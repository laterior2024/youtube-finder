#!/usr/bin/env python3
"""7주차: 지금까지의 도구를 버튼으로 쓰는 화면.

  python app.py

를 실행하면 인터넷 창(브라우저)에 화면이 열려요. 이 화면은 내 컴퓨터 안에서만 열리고,
다른 사람은 들어올 수 없어요. 끝내려면 검은 창에서 Ctrl + C 를 누르세요.

① 성공공식 만들기 → ② 편집 계획 만들기 → ③ 계획 고치기 → ④ CapCut 프로젝트 만들기
"""

from __future__ import annotations

import contextlib
import json
import os
import sys
import threading
import traceback
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import add_effects  # noqa: E402
import analyze_sample  # noqa: E402
import auto_edit  # noqa: E402
import capcut_draft as cd  # noqa: E402

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}
SIDE_FILES = (".plan.json", ".analysis.json", ".timeline.json", ".transcript.json")
PORT = 8765


# ---------------------------------------------------------------------------
# 폴더 안 파일 목록
# ---------------------------------------------------------------------------

def safe_name(name: str, folder: Path = HERE) -> Path:
    """화면에서 온 파일 이름이 이 폴더 안의 파일인지 확인해요 (다른 폴더 접근 막기)."""
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        raise ValueError(f"파일 이름이 이상해요: {name!r}")
    path = (folder / name).resolve()
    if path.parent != folder.resolve():
        raise ValueError(f"파일 이름이 이상해요: {name!r}")
    return path


def is_formula(path: Path) -> bool:
    if path.suffix != ".json" or path.name.endswith(SIDE_FILES):
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return False
    return isinstance(data, dict) and "구조" in data


def list_state(folder: Path = HERE, projects_dir: Path | None = None) -> dict:
    files = sorted(p for p in folder.iterdir() if p.is_file())
    dirs = [projects_dir] if projects_dir else cd.default_projects_dirs()
    projects = [d.name for base in dirs for d in cd.list_drafts(base)]
    sfx = folder / "효과음"
    return {
        "videos": [p.name for p in files if p.suffix.lower() in VIDEO_EXT],
        "formulas": [p.name for p in files if is_formula(p)],
        "plans": [p.name for p in files if p.name.endswith(".plan.json")],
        "projects": projects,
        "sfx": sorted(f.name for f in sfx.iterdir() if f.suffix.lower() in add_effects.AUDIO_EXT) if sfx.is_dir() else [],
        "has_key": (folder / "api_key.txt").exists() or bool(os.environ.get("GEMINI_API_KEY")),
    }


# ---------------------------------------------------------------------------
# 작업 실행 (한 번에 하나)
# ---------------------------------------------------------------------------

class Job:
    def __init__(self):
        self.lock = threading.Lock()
        self.running = False
        self.title = ""
        self.log: list[str] = []
        self.ok: bool | None = None
        self.result: dict = {}

    def write(self, text: str) -> int:  # print() 가 여기로 와요
        with self.lock:
            self.log.append(text)
        return len(text)

    def flush(self) -> None:
        pass

    def snapshot(self) -> dict:
        with self.lock:
            return {"running": self.running, "title": self.title, "log": "".join(self.log)[-20000:],
                    "ok": self.ok, "result": self.result}

    def start(self, title: str, steps, result: dict | None = None) -> bool:
        """steps: [(설명, 함수, 인자 목록)] 를 차례로 실행해요. 하나라도 실패하면 멈춰요."""
        with self.lock:
            if self.running:
                return False
            self.running, self.title, self.log, self.ok, self.result = True, title, [], None, result or {}

        def run():
            ok = True
            with contextlib.redirect_stdout(self), contextlib.redirect_stderr(self):
                for label, func, argv in steps:
                    print(f"\n▶ {label}")
                    try:
                        code = func(argv)
                    except SystemExit as e:  # 인자 오류 등
                        code = e.code if isinstance(e.code, int) else 1
                    except Exception:
                        traceback.print_exc()
                        code = 1
                    if code != 0:
                        ok = False
                        print("\n❌ 여기서 멈췄어요. 위의 메시지를 확인해 주세요.")
                        break
                if ok:
                    print("\n🎉 끝났어요!")
            with self.lock:
                self.running, self.ok = False, ok

        threading.Thread(target=run, daemon=True).start()
        return True


JOB = Job()


def steps_for(action: str, data: dict, folder: Path = HERE) -> tuple[str, list, dict]:
    """화면의 버튼 → 실행할 도구와 인자."""
    template = data.get("template") or "틀_쇼핑쇼츠"
    if action == "analyze":
        samples = [safe_name(s, folder).name for s in data.get("samples") or []]
        if not samples:
            raise ValueError("샘플 영상을 1개 이상 골라 주세요.")
        out = safe_name(ensure_suffix(data.get("out") or "성공공식", ".json"), folder).name
        argv = [*samples, "--out", out, "--scene-threshold", str(float(data.get("scene") or 0.15))]
        return "성공공식 만들기", [("샘플 분석 → 성공공식 카드", analyze_sample.main, argv)], {"formula": out}

    if action == "plan":
        video = safe_name(data.get("video") or "", folder).name
        formula = safe_name(data.get("formula") or "", folder).name
        name = clean_project_name(data.get("name") or f"{Path(video).stem}_편집")
        argv = [video, "--formula", formula, "--name", name, "--template", template, "--dry-run"]
        if data.get("target"):
            argv += ["--target", str(float(data["target"]))]
        return "편집 계획 만들기", [("장면 고르기 + 자막 (Gemini)", auto_edit.main, argv)], {"plan": f"{name}.plan.json"}

    if action == "build":
        plan_name = safe_name(data.get("plan") or "", folder).name
        plan = json.loads((folder / plan_name).read_text(encoding="utf-8"))
        video = safe_name(plan.get("원본") or "", folder).name
        name = clean_project_name(data.get("name") or plan_name[: -len(".plan.json")])
        steps = [("CapCut 프로젝트 만들기", auto_edit.main,
                  [video, "--plan", plan_name, "--name", name, "--template", template])]
        result = {"project": name}
        if data.get("effects"):
            formula = safe_name(data.get("formula") or "", folder).name
            argv = [name, "--formula", formula, "--template", template,
                    "--sfx-volume", str(float(data.get("volume") or 0.6)),
                    "--transitions", data.get("transitions") or "clips"]
            steps.append(("효과음·장면 전환 넣기", add_effects.main, argv))
            result["project"] = f"{name}_효과"
        return "CapCut 프로젝트 만들기", steps, result

    raise ValueError(f"모르는 작업이에요: {action}")


def ensure_suffix(name: str, suffix: str) -> str:
    return name if name.endswith(suffix) else name + suffix


def clean_project_name(name: str) -> str:
    name = name.strip()
    if not name or any(c in name for c in '/\\:*?"<>|'):
        raise ValueError(f"프로젝트 이름에 쓸 수 없는 글자가 있어요: {name!r}")
    return name


# ---------------------------------------------------------------------------
# 계획 읽기 / 저장
# ---------------------------------------------------------------------------

def read_plan(name: str, folder: Path = HERE) -> dict:
    path = safe_name(name, folder)
    if not path.name.endswith(".plan.json"):
        raise ValueError("계획 파일(.plan.json)만 열 수 있어요.")
    return json.loads(path.read_text(encoding="utf-8"))


def write_plan(name: str, plan: dict, folder: Path = HERE) -> None:
    path = safe_name(name, folder)
    if not path.name.endswith(".plan.json"):
        raise ValueError("계획 파일(.plan.json)만 저장할 수 있어요.")
    if not isinstance(plan, dict) or not isinstance(plan.get("구간"), list):
        raise ValueError("계획 모양이 이상해요.")
    clips = []
    for c in plan["구간"]:
        start, end = float(c["시작"]), float(c["끝"])
        if end <= start:
            raise ValueError(f"장면 시간이 이상해요: {start}~{end}")
        clips.append({"시작": start, "끝": end, "역할": str(c.get("역할", "")), "이유": str(c.get("이유", ""))})
    lines = [{"시작": float(l["시작"]), "끝": float(l["끝"]), "글자": str(l["글자"])} for l in plan.get("자막") or []]
    old = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    old.update({"훅제목": str(plan.get("훅제목", "")), "참여유도": str(plan.get("참여유도", "")),
                "구간": clips, "자막": lines})
    path.write_text(json.dumps(old, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# 웹 서버
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    folder = HERE
    projects_dir: Path | None = None

    def log_message(self, *args):  # 검은 창을 조용하게
        pass

    def send(self, code: int, body, content_type="application/json; charset=utf-8"):
        data = body.encode("utf-8") if isinstance(body, str) else json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        url = urlparse(self.path)
        try:
            if url.path == "/":
                self.send(200, PAGE, "text/html; charset=utf-8")
            elif url.path == "/api/state":
                self.send(200, list_state(self.folder, self.projects_dir))
            elif url.path == "/api/job":
                self.send(200, JOB.snapshot())
            elif url.path == "/api/plan":
                name = (parse_qs(url.query).get("name") or [""])[0]
                self.send(200, read_plan(name, self.folder))
            else:
                self.send(404, {"error": "없는 주소예요."})
        except (ValueError, OSError) as e:
            self.send(400, {"error": str(e)})

    def do_POST(self):
        # 다른 사이트가 몰래 이 화면에 명령을 보내지 못하게 막아요.
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).hostname not in ("127.0.0.1", "localhost"):
            self.send(403, {"error": "허용되지 않은 요청이에요."})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            data = json.loads(self.rfile.read(length) or b"{}")
            url = urlparse(self.path)
            if url.path == "/api/run":
                title, steps, result = steps_for(data.get("action", ""), data, self.folder)
                if not JOB.start(title, steps, result):
                    self.send(409, {"error": "다른 작업이 아직 끝나지 않았어요."})
                    return
                self.send(200, {"started": title, "result": result})
            elif url.path == "/api/plan":
                write_plan(data.get("name", ""), data.get("plan"), self.folder)
                self.send(200, {"saved": True})
            else:
                self.send(404, {"error": "없는 주소예요."})
        except (ValueError, KeyError, TypeError, OSError) as e:
            self.send(400, {"error": str(e)})


def serve(port: int = PORT, open_browser: bool = True) -> None:
    os.chdir(HERE)  # 도구들이 파일을 이 폴더 기준으로 찾아요.
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"✅ 화면이 열렸어요: {url}")
    print("   (브라우저가 안 열리면 위 주소를 복사해서 브라우저 주소창에 붙여 넣으세요)")
    print("   끝내려면 이 검은 창에서 Ctrl + C")
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 종료했어요.")
    finally:
        server.server_close()


PAGE = r"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>쇼츠 자동 편집기</title>
<style>
  :root {
    --bg: #f6f7f9; --card: #ffffff; --ink: #1c1f24; --muted: #667085; --line: #e3e6eb;
    --accent: #3b5bdb; --accent-ink: #ffffff; --ok: #2b8a3e; --bad: #c92a2a; --log: #111418; --log-ink: #d7dde5;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #15181c; --card: #1d2126; --ink: #e8eaed; --muted: #9aa3ae; --line: #2e343b;
            --accent: #7b93ff; --accent-ink: #0d1117; --ok: #69db7c; --bad: #ff8787; --log: #0b0d10; --log-ink: #cfd6de; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
         font: 15px/1.55 "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", system-ui, sans-serif; }
  main { max-width: 980px; margin: 0 auto; padding: 24px 16px 80px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); margin: 0 0 20px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
  h2 { font-size: 17px; margin: 0 0 12px; display: flex; gap: 8px; align-items: center; }
  .num { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%;
         background: var(--accent); color: var(--accent-ink); font-size: 14px; }
  label { display: block; font-size: 13px; color: var(--muted); margin: 10px 0 4px; }
  select, input[type=text], input[type=number] { width: 100%; padding: 9px 10px; border: 1px solid var(--line);
         border-radius: 8px; background: var(--bg); color: var(--ink); font: inherit; }
  .row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  button { margin-top: 14px; padding: 11px 18px; border: 0; border-radius: 8px; background: var(--accent);
           color: var(--accent-ink); font: inherit; font-weight: 600; cursor: pointer; }
  button.ghost { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .checks { display: flex; flex-wrap: wrap; gap: 6px 16px; }
  .checks label { display: flex; gap: 6px; align-items: center; color: var(--ink); margin: 4px 0; font-size: 14px; }
  .hint { color: var(--muted); font-size: 13px; margin: 8px 0 0; }
  .warn { color: var(--bad); }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { border-bottom: 1px solid var(--line); padding: 6px 4px; text-align: left; vertical-align: top; }
  td input { padding: 6px 7px; }
  td.n { width: 90px; }
  .scroll { overflow-x: auto; }
  pre { background: var(--log); color: var(--log-ink); border-radius: 10px; padding: 14px; min-height: 120px;
        max-height: 360px; overflow: auto; white-space: pre-wrap; font: 13px/1.5 Consolas, "D2Coding", monospace; margin: 0; }
  .status { font-weight: 600; margin-bottom: 8px; }
  .status.ok { color: var(--ok); } .status.bad { color: var(--bad); }
  details summary { cursor: pointer; color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>🎬 쇼츠 자동 편집기</h1>
  <p class="sub">이슈·감동·정보·스토리 쇼츠 · 원본 영상 → 성공공식대로 편집 → CapCut 프로젝트</p>
  <p id="keywarn" class="hint warn" hidden>⚠️ api_key.txt 가 없어요. Gemini 가 필요한 ①② 단계가 안 돼요 (README 3주차 참고).</p>

  <section>
    <h2><span class="num">1</span>성공공식 <small class="hint">이미 있으면 건너뛰어도 돼요</small></h2>
    <label>샘플 영상 고르기 (2~5개)</label>
    <div id="samples" class="checks"></div>
    <div class="row">
      <div><label>공식 이름</label><input id="formulaOut" type="text" value="공식_새로운"></div>
      <div><label>장면 바뀜 민감도 (낮을수록 컷을 많이 찾아요)</label><input id="scene" type="number" value="0.15" step="0.05" min="0.05" max="0.9"></div>
    </div>
    <button id="btnAnalyze">샘플 분석해서 공식 만들기</button>
  </section>

  <section>
    <h2><span class="num">2</span>편집 계획 만들기</h2>
    <div class="row">
      <div><label>원본 영상</label><select id="video"></select></div>
      <div><label>성공공식</label><select id="formula"></select></div>
      <div><label>이름</label><input id="planName" type="text" placeholder="비우면: 영상이름_편집"></div>
      <div><label>목표 길이(초, 비우면 공식대로)</label><input id="target" type="number" min="8" max="35" step="1"></div>
    </div>
    <button id="btnPlan">Gemini 로 장면 고르기</button>
  </section>

  <section>
    <h2><span class="num">3</span>계획 확인·고치기</h2>
    <div class="row">
      <div><label>계획 파일</label><select id="plan"></select></div>
      <div style="align-self:end"><button class="ghost" id="btnLoad">불러오기</button></div>
    </div>
    <div id="planEditor" hidden>
      <div class="row">
        <div><label>🪝 훅 제목 (처음 2~3초, 화면 위)</label><input id="hook" type="text"></div>
        <div><label>💬 참여유도 (마지막 2~3초)</label><input id="cta" type="text"></div>
      </div>
      <label>🎞️ 장면 (쇼츠에 나오는 순서 · 시간은 원본 기준 초)</label>
      <div class="scroll"><table><thead><tr><th>역할</th><th>시작</th><th>끝</th><th>이유</th><th></th></tr></thead><tbody id="clips"></tbody></table></div>
      <label>📝 자막 (완성본 기준 초)</label>
      <div class="scroll"><table><thead><tr><th>시작</th><th>끝</th><th>글자</th></tr></thead><tbody id="lines"></tbody></table></div>
      <p class="hint">장면 시간을 바꾸면 자막 시간이 어긋날 수 있어요. 그땐 ②를 다시 해 주세요.</p>
      <p id="planTotal" class="hint"></p>
      <button id="btnSave">고친 내용 저장</button>
    </div>
  </section>

  <section>
    <h2><span class="num">4</span>CapCut 프로젝트 만들기</h2>
    <p class="hint warn">⚠️ 누르기 전에 CapCut 을 완전히 꺼 주세요.</p>
    <div class="row">
      <div><label>프로젝트 이름</label><input id="projName" type="text" placeholder="비우면: 계획 이름"></div>
      <div><label>틀 프로젝트</label><select id="template"></select></div>
    </div>
    <div class="checks" style="margin-top:10px">
      <label><input id="effects" type="checkbox" checked> 효과음·장면 전환도 넣기 (6주차)</label>
    </div>
    <div class="row" id="fxOptions">
      <div><label>효과음 크기 <span id="volOut">0.6</span></label><input id="volume" type="range" min="0" max="1" step="0.1" value="0.6" style="width:100%"></div>
      <div><label>장면 전환</label><select id="transitions">
        <option value="clips">이야기 구간이 바뀔 때</option><option value="all">모든 컷</option><option value="none">넣지 않기</option></select></div>
    </div>
    <p id="sfxInfo" class="hint"></p>
    <button id="btnBuild">CapCut 프로젝트 만들기</button>
  </section>

  <section>
    <h2>진행 상황</h2>
    <div id="status" class="status">기다리는 중</div>
    <pre id="log"></pre>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
let state = {}, currentPlan = null, polling = null;

function fill(select, items, keep) {
  const old = keep ?? select.value;
  select.innerHTML = items.map(v => `<option>${esc(v)}</option>`).join("") || "<option value=''>(없음)</option>";
  if (items.includes(old)) select.value = old;
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

async function refresh() {
  state = await (await fetch("/api/state")).json();
  $("keywarn").hidden = state.has_key;
  const checked = new Set([...document.querySelectorAll("#samples input:checked")].map(i => i.value));
  $("samples").innerHTML = state.videos.map(v =>
    `<label><input type="checkbox" value="${esc(v)}" ${checked.has(v) ? "checked" : ""}> ${esc(v)}</label>`).join("")
    || "<span class='hint'>폴더에 영상이 없어요.</span>";
  fill($("video"), state.videos);
  fill($("formula"), state.formulas);
  fill($("plan"), state.plans);
  const tpl = state.projects.includes("틀_쇼핑쇼츠") ? "틀_쇼핑쇼츠" : undefined;
  fill($("template"), state.projects, $("template").value || tpl);
  $("sfxInfo").textContent = state.sfx.length ? `효과음 폴더: ${state.sfx.length}개 (${state.sfx.slice(0, 5).join(", ")}${state.sfx.length > 5 ? " …" : ""})`
                                              : "⚠️ '효과음' 폴더에 파일이 없어요 (README 6주차 참고).";
}

async function run(payload) {
  const res = await fetch("/api/run", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(payload)});
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }
  setBusy(true);
  poll(data.result);
}

function setBusy(busy) {
  for (const b of document.querySelectorAll("button")) b.disabled = busy;
}

function poll(result) {
  clearInterval(polling);
  polling = setInterval(async () => {
    const job = await (await fetch("/api/job")).json();
    $("log").textContent = job.log;
    $("log").scrollTop = $("log").scrollHeight;
    const st = $("status");
    if (job.running) { st.className = "status"; st.textContent = `⏳ ${job.title} 중… (Gemini 는 몇 분 걸릴 수 있어요)`; return; }
    clearInterval(polling);
    setBusy(false);
    st.className = "status " + (job.ok ? "ok" : "bad");
    st.textContent = job.ok ? `✅ ${job.title} 완료` : `❌ ${job.title} 실패 — 아래 메시지를 확인해 주세요`;
    await refresh();
    if (job.ok && result?.formula) $("formula").value = result.formula;
    if (job.ok && result?.plan) { $("plan").value = result.plan; loadPlan(); }
    if (job.ok && result?.project) st.textContent += ` · CapCut 을 켜서 '${result.project}' 를 열어 보세요`;
  }, 1000);
}

function num(v) { return Number(v).toFixed(2); }

async function loadPlan() {
  const name = $("plan").value;
  if (!name) return;
  const res = await fetch("/api/plan?name=" + encodeURIComponent(name));
  const data = await res.json();
  if (!res.ok) { alert(data.error); return; }
  currentPlan = data;
  $("planEditor").hidden = false;
  $("hook").value = data["훅제목"] || "";
  $("cta").value = data["참여유도"] || "";
  $("clips").innerHTML = (data["구간"] || []).map((c, i) => `<tr>
      <td><input type="text" value="${esc(c["역할"] || "")}" data-k="역할"></td>
      <td class="n"><input type="number" step="0.1" value="${num(c["시작"])}" data-k="시작"></td>
      <td class="n"><input type="number" step="0.1" value="${num(c["끝"])}" data-k="끝"></td>
      <td><input type="text" value="${esc(c["이유"] || "")}" data-k="이유"></td>
      <td><button class="ghost" style="margin:0;padding:6px 10px" onclick="this.closest('tr').remove();total()">삭제</button></td></tr>`).join("");
  $("lines").innerHTML = (data["자막"] || []).map(l => `<tr>
      <td class="n"><input type="number" step="0.1" value="${num(l["시작"])}" data-k="시작"></td>
      <td class="n"><input type="number" step="0.1" value="${num(l["끝"])}" data-k="끝"></td>
      <td><input type="text" value="${esc(l["글자"])}" data-k="글자"></td></tr>`).join("");
  $("projName").placeholder = "비우면: " + name.replace(/\.plan\.json$/, "");
  total();
}

function rows(tbody) {
  return [...$(tbody).querySelectorAll("tr")].map(tr => Object.fromEntries(
    [...tr.querySelectorAll("input")].map(inp => [inp.dataset.k, inp.type === "number" ? Number(inp.value) : inp.value])));
}
function total() {
  const t = rows("clips").reduce((s, c) => s + Math.max(0, c["끝"] - c["시작"]), 0);
  $("planTotal").textContent = `장면 길이 합계: ${t.toFixed(1)}초 (무음을 빼면 조금 짧아져요) ` + (t > 35 ? "⚠️ 35초가 넘어요" : "");
}
document.addEventListener("input", (e) => { if (e.target.closest("#clips")) total(); });

async function savePlan() {
  const plan = {"훅제목": $("hook").value, "참여유도": $("cta").value, "구간": rows("clips"), "자막": rows("lines")};
  const res = await fetch("/api/plan", {method: "POST", headers: {"Content-Type": "application/json"},
                                        body: JSON.stringify({name: $("plan").value, plan})});
  const data = await res.json();
  if (!res.ok) { alert(data.error); return false; }
  return true;
}

$("btnAnalyze").onclick = () => {
  const samples = [...document.querySelectorAll("#samples input:checked")].map(i => i.value);
  run({action: "analyze", samples, out: $("formulaOut").value, scene: $("scene").value});
};
$("btnPlan").onclick = () => run({action: "plan", video: $("video").value, formula: $("formula").value,
                                  name: $("planName").value, target: $("target").value, template: $("template").value});
$("btnLoad").onclick = loadPlan;
$("btnSave").onclick = async () => { if (await savePlan()) alert("저장했어요."); };
$("btnBuild").onclick = async () => {
  if (!$("plan").value) { alert("③에서 계획 파일을 골라 주세요."); return; }
  if (!$("planEditor").hidden && !(await savePlan())) return;
  if (!confirm("CapCut 을 완전히 껐나요?")) return;
  run({action: "build", plan: $("plan").value, name: $("projName").value, template: $("template").value,
       effects: $("effects").checked, formula: $("formula").value, volume: $("volume").value,
       transitions: $("transitions").value});
};
$("effects").onchange = () => { $("fxOptions").hidden = !$("effects").checked; };
$("volume").oninput = () => { $("volOut").textContent = $("volume").value; };

refresh().then(async () => {
  const job = await (await fetch("/api/job")).json();
  if (job.running) { setBusy(true); poll(job.result); }
});
</script>
</body>
</html>
"""


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else PORT
    serve(port)
