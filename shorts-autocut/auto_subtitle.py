#!/usr/bin/env python3
"""3주차: 외국어 말 → 한국어 쇼핑쇼츠 자막을 말하는 시간에 맞춰 자동으로 넣는 도구.

순서:
  1. (2주차) 무음을 찾아 남길 조각을 정해요.
  2. Whisper 가 원본 영상의 말을 글자로 바꾸고, 몇 초에 말했는지도 알려줘요.
  3. 무음을 잘라낸 뒤의 시간으로 옮겨요.
  4. Gemini 가 한국어 쇼핑쇼츠 말투로 짧게 바꿔요.
  5. 틀 프로젝트를 복사해서 영상 조각 + 자막을 넣고, 같은 자막을 .srt 파일로도 저장해요.

필요한 것:
  python -m pip install imageio-ffmpeg faster-whisper
  Gemini API 키 (api_key.txt 파일 또는 GEMINI_API_KEY 환경 변수)
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

import capcut_draft as cd
import silence_cut as sc

US = cd.MICROSECONDS
HERE = Path(__file__).resolve().parent
KEY_FILE = HERE / "api_key.txt"
DEFAULT_MODEL = "gemini-flash-latest"


@dataclass
class Line:
    """자막 한 줄. 시간은 '무음을 잘라낸 뒤' 기준(초)."""
    start: float
    end: float
    text: str


# ---------------------------------------------------------------------------
# 1. 말 → 글자 (Whisper)
# ---------------------------------------------------------------------------

def transcribe(video: Path, model_size: str, language: str | None) -> list[dict]:
    """[{start, end, text}] 목록. 같은 영상은 결과를 저장해 두고 다시 써요."""
    cache = video.with_name(f"{video.stem}.transcript.json")
    if cache.exists():
        saved = json.loads(cache.read_text(encoding="utf-8"))
        if saved.get("model") == model_size and saved.get("language_arg") == language:
            print(f"🗂️  저장해 둔 받아쓰기 결과를 써요: {cache.name}")
            return saved["segments"]

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except ImportError:
        raise sc.CutError(
            "받아쓰기 도구(faster-whisper)가 없어요. 검은 창에 입력해 주세요.\n"
            "    python -m pip install faster-whisper"
        ) from None

    print(f"🎧 받아쓰는 중… (모델: {model_size}. 처음에는 모델을 내려받느라 몇 분 걸려요)")
    result, info = None, None
    # 그래픽카드(GPU)가 있으면 먼저 써 보고, 안 되면 CPU 로 해요.
    for device in ("auto", "cpu"):
        try:
            model = WhisperModel(model_size, device=device, compute_type="int8")
            segments, info = model.transcribe(str(video), language=language, vad_filter=True)
            result = [
                {"start": round(s.start, 3), "end": round(s.end, 3), "text": s.text.strip()}
                for s in segments if s.text.strip()
            ]
            break
        except Exception as e:  # 모델 내려받기 실패, GPU 드라이버 문제 등
            error = e
    if result is None:
        raise sc.CutError(
            f"받아쓰기에 실패했어요: {error}\n"
            "  처음 실행할 때는 인터넷으로 모델을 내려받아요. 인터넷 연결을 확인해 주세요."
        )
    print(f"   언어: {info.language}  ·  문장 {len(result)}개")
    cache.write_text(json.dumps({
        "model": model_size, "language_arg": language, "language": info.language, "segments": result,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    return result


# ---------------------------------------------------------------------------
# 2. 원본 시간 → 잘라낸 뒤 시간
# ---------------------------------------------------------------------------

def map_interval(start: float, end: float, ranges: list[tuple[float, float]]) -> tuple[float, float] | None:
    """원본의 [start, end] 가 잘라낸 영상에서 몇 초~몇 초인지 구해요. 전부 잘렸으면 None."""
    offset = 0.0
    first = last = None
    for rs, re_ in ranges:
        s, e = max(start, rs), min(end, re_)
        if e > s:
            if first is None:
                first = offset + (s - rs)
            last = offset + (e - rs)
        offset += re_ - rs
    if first is None:
        return None
    return first, last


def map_segments(segments: list[dict], ranges: list[tuple[float, float]], min_len: float = 0.2) -> list[dict]:
    mapped = []
    for i, seg in enumerate(segments, 1):
        span = map_interval(seg["start"], seg["end"], ranges)
        if span and span[1] - span[0] >= min_len:
            mapped.append({"id": i, "start": span[0], "end": span[1], "text": seg["text"]})
    return mapped


# ---------------------------------------------------------------------------
# 3. 쇼핑쇼츠 자막으로 바꾸기
# ---------------------------------------------------------------------------

def split_text(text: str, max_chars: int) -> list[str]:
    """띄어쓰기 기준으로 한 줄 max_chars 글자 이하로 나눠요."""
    lines, current = [], ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > max_chars:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def build_prompt(items: list[dict], max_chars: int, style: str) -> str:
    rows = "\n".join(json.dumps({"id": it["id"], "sec": round(it["end"] - it["start"], 1), "text": it["text"]},
                                ensure_ascii=False) for it in items)
    return f"""너는 조회수 높은 한국 쇼핑 쇼츠의 자막 작가야.
아래는 해외 제품 영상의 대사야. 한 줄에 하나씩 id, 말하는 시간(sec), 원문(text)이 있어.

각 대사를 한국 쇼핑 쇼츠 자막으로 바꿔 줘.
규칙:
- 뜻은 유지하되, 직역하지 말고 한국 쇼츠 말투로 짧고 임팩트 있게.
- 자막 한 줄은 공백 포함 {max_chars}자 이하. 길면 여러 줄(lines)로 나눠.
- 말하는 시간이 짧으면 줄 수도 적게 (대략 1초에 한 줄).
- 원문에 없는 가격, 효과, 사실은 절대 지어내지 마.
- 이모지와 특수문자 장식은 쓰지 마.
- 의미 없는 추임새(음, 어, uh)만 있는 대사는 lines 를 빈 배열로.
{f"- 추가 스타일: {style}" if style else ""}

대사:
{rows}

JSON 배열로만 답해. 예: [{{"id": 1, "lines": ["이거 진짜 미쳤다", "3초면 끝"]}}]"""


def load_api_key(cli_key: str | None) -> str:
    key = cli_key or os.environ.get("GEMINI_API_KEY", "")
    if not key and KEY_FILE.exists():
        key = KEY_FILE.read_text(encoding="utf-8").strip()
    if not key:
        raise sc.CutError(
            "Gemini API 키가 없어요.\n"
            f"  1) https://aistudio.google.com/apikey 에서 키를 만들고\n"
            f"  2) {KEY_FILE} 파일에 키 한 줄만 붙여 넣어 저장해 주세요.\n"
            "  번역 없이 원문 그대로 자막을 넣으려면 --no-translate 를 붙이세요."
        )
    return key


def call_gemini(prompt: str, api_key: str, model: str) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.7},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "x-goog-api-key": api_key,
    })
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")[:300]
        hints = {
            400: "API 키가 틀렸거나 모델 이름이 잘못됐어요. api_key.txt 를 확인해 주세요.",
            403: "이 API 키로는 Gemini 를 쓸 수 없어요. 키를 새로 만들어 보세요.",
            404: f"'{model}' 모델을 찾을 수 없어요. --model gemini-2.5-flash 처럼 바꿔 보세요.",
            402: "AI Studio 프로젝트의 선불 크레딧이 다 떨어졌어요. README 의 'Gemini 402 오류' 부분을 보세요.",
            429: "사용 한도를 넘었어요. 1분쯤 기다렸다가 다시 해 보세요.",
        }
        hint = hints.get(e.code, "API 키와 모델 이름을 확인해 주세요.")
        raise sc.CutError(f"Gemini 요청이 실패했어요 ({e.code}). {hint}\n{detail}") from None
    except urllib.error.URLError as e:
        raise sc.CutError(f"Gemini 에 연결하지 못했어요. 인터넷 연결을 확인해 주세요. ({e.reason})") from None
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise sc.CutError(f"Gemini 답을 이해하지 못했어요: {json.dumps(data, ensure_ascii=False)[:300]}") from None


def parse_rewrite(answer: str) -> dict[int, list[str]]:
    answer = re.sub(r"^```(?:json)?|```$", "", answer.strip(), flags=re.M).strip()
    try:
        items = json.loads(answer)
    except json.JSONDecodeError:
        raise sc.CutError("Gemini 가 JSON 이 아닌 답을 줬어요. 다시 실행해 보세요.") from None
    result = {}
    for item in items if isinstance(items, list) else []:
        if isinstance(item, dict) and isinstance(item.get("id"), int):
            result[item["id"]] = [str(x).strip() for x in item.get("lines") or [] if str(x).strip()]
    return result


def spread_lines(start: float, end: float, texts: list[str]) -> list[Line]:
    """한 대사 시간 안에서 줄마다 글자 수에 비례해 시간을 나눠요."""
    total_chars = sum(max(len(t), 1) for t in texts)
    lines, cursor = [], start
    for i, text in enumerate(texts):
        share = (end - start) * max(len(text), 1) / total_chars
        stop = end if i == len(texts) - 1 else cursor + share
        lines.append(Line(round(cursor, 3), round(stop, 3), text))
        cursor = stop
    return lines


def lines_for(item: dict, rewrites: dict[int, list[str]] | None, max_chars: int) -> list[Line]:
    if rewrites is not None and item["id"] in rewrites:
        texts = rewrites[item["id"]]
    else:
        texts = split_text(item["text"], max_chars)
    return spread_lines(item["start"], item["end"], texts) if texts else []


def make_lines(items: list[dict], rewrites: dict[int, list[str]] | None, max_chars: int) -> list[Line]:
    return [line for it in items for line in lines_for(it, rewrites, max_chars)]


# ---------------------------------------------------------------------------
# 4. CapCut / SRT 에 쓰기
# ---------------------------------------------------------------------------

def remove_unused(draft: dict, candidates: set[str]) -> None:
    """어느 조각도 더 이상 쓰지 않는 재료만 지워요."""
    used = set()
    for track in draft.get("tracks") or []:
        for seg in track.get("segments") or []:
            used.add(seg.get("material_id"))
            used.update(seg.get("extra_material_refs") or [])
    sc.remove_materials(draft, candidates - used)


def apply_captions(draft: dict, lines: list[Line]) -> None:
    tracks = draft.get("tracks") or []
    track = next((t for t in tracks if t.get("type") == "text" and t.get("segments")), None)
    if track is None:
        raise sc.CutError("틀 프로젝트에 자막이 없어요. CapCut에서 자막을 1개 이상 넣은 틀을 써 주세요.")

    proto_seg = track["segments"][0]
    found = sc.find_material(draft, proto_seg.get("material_id", ""))
    if not found:
        raise sc.CutError("틀의 자막 조각이 가리키는 글자 재료를 찾을 수 없어요.")
    texts_list, proto_mat = found

    old_ids = set()
    for seg in track["segments"]:
        old_ids.add(seg.get("material_id"))
        old_ids.update(seg.get("extra_material_refs") or [])
    proto_refs = list(proto_seg.get("extra_material_refs") or [])

    segments = []
    for line in lines:
        start = int(round(line.start * US))
        dur = int(round(line.end * US)) - start
        if dur <= 0:
            continue
        mat = copy.deepcopy(proto_mat)
        mat["id"] = sc.new_id()
        cd.write_text(mat, line.text)
        texts_list.append(mat)

        seg = copy.deepcopy(proto_seg)
        seg["id"] = sc.new_id()
        seg["material_id"] = mat["id"]
        seg["target_timerange"] = {"start": start, "duration": dur}
        if isinstance(seg.get("source_timerange"), dict):
            seg["source_timerange"] = {"start": 0, "duration": dur}
        seg["extra_material_refs"] = sc.clone_extra_materials(draft, proto_refs)
        segments.append(seg)

    track["segments"] = segments
    remove_unused(draft, old_ids)


def srt_time(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def to_srt(lines: list[Line]) -> str:
    return "\n".join(
        f"{i}\n{srt_time(l.start)} --> {srt_time(l.end)}\n{l.text}\n" for i, l in enumerate(lines, 1)
    )


def parse_srt(text: str) -> list[Line]:
    """.srt 파일을 읽어요. 메모장으로 고친 자막을 그대로 쓰려고 만들었어요."""
    stamp = re.compile(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)")
    lines = []
    for block in re.split(r"\n\s*\n", text.replace("\r\n", "\n").lstrip("\ufeff").strip()):
        rows = block.strip().split("\n")
        for i, row in enumerate(rows):
            m = stamp.search(row)
            if m:
                g = [int(x) for x in m.groups()]
                start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
                end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
                body = " ".join(r.strip() for r in rows[i + 1:] if r.strip())
                if body and end > start:
                    lines.append(Line(start, end, body))
                break
    return lines


def build_project(template: Path, name: str, video: Path, info: sc.VideoInfo,
                  ranges: list[tuple[float, float]], lines: list[Line]) -> Path:
    target = cd.clone_draft(template, name, [])
    try:
        path = cd.content_path(target)
        draft = cd.load_json(path)
        sc.apply_cuts(draft, video, info, ranges)
        apply_captions(draft, lines)
        cd.save_draft(target, path, draft)
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    return target


# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    p = argparse.ArgumentParser(description="무음 컷 + 한국어 쇼핑쇼츠 자막 → CapCut 프로젝트 (3주차)")
    p.add_argument("video", help="원본 영상 파일 경로")
    p.add_argument("--template", default="틀_쇼핑쇼츠", help="틀 프로젝트 이름 (기본: 틀_쇼핑쇼츠)")
    p.add_argument("--name", help="새 프로젝트 이름 (기본: 영상파일이름_자막)")
    p.add_argument("--projects-dir", help="CapCut 프로젝트 폴더 (기본: 자동으로 찾기)")
    p.add_argument("--no-cut", action="store_true", help="무음을 자르지 않고 자막만 넣어요")
    p.add_argument("--threshold", type=float, default=-35.0, help="무음 기준 소리 크기(dB) (기본 -35)")
    p.add_argument("--min-silence", type=float, default=0.4, help="무음으로 볼 최소 시간(초) (기본 0.4)")
    p.add_argument("--padding", type=float, default=0.1, help="소리 앞뒤 여유(초) (기본 0.1)")
    p.add_argument("--whisper-model", default="small", help="받아쓰기 모델: tiny/base/small/medium/large-v3 (기본 small)")
    p.add_argument("--language", help="원본 언어 (예: en, zh, ja). 비우면 자동으로 알아내요")
    p.add_argument("--no-translate", action="store_true", help="번역하지 않고 받아쓴 글자 그대로 넣어요")
    p.add_argument("--max-chars", type=int, default=12, help="자막 한 줄 최대 글자 수 (기본 12)")
    p.add_argument("--style", default="", help='자막 말투 추가 주문 (예: "반말, 친구한테 추천하듯")')
    p.add_argument("--model", default=DEFAULT_MODEL, help=f"Gemini 모델 (기본 {DEFAULT_MODEL})")
    p.add_argument("--api-key", help="Gemini API 키 (기본: api_key.txt 또는 GEMINI_API_KEY)")
    p.add_argument("--srt", help="받아쓰기·번역 대신 이 .srt 자막 파일을 그대로 써요 (메모장으로 고친 자막)")
    p.add_argument("--dry-run", action="store_true", help="프로젝트는 만들지 않고 자막 결과만 보여줘요")
    args = p.parse_args(argv)

    try:
        video = Path(args.video.strip('"')).expanduser()
        if not video.is_file():
            raise sc.CutError(f"'{video}' 영상 파일을 찾을 수 없어요.")
        info = sc.probe(video)
        if not info.has_audio:
            raise sc.CutError("이 영상에는 소리가 없어서 받아쓸 말이 없어요.")

        # 1) 무음 컷
        if args.no_cut:
            ranges = [(0.0, info.duration)]
        else:
            silences = sc.detect_silences(video, info.duration, args.threshold, args.min_silence)
            ranges = sc.keep_ranges(info.duration, silences, args.padding)
            if not ranges:
                raise sc.CutError("전부 무음으로 판단됐어요. --threshold 를 낮춰 보세요 (예: -50).")
        cut_len = sum(e - s for s, e in ranges)
        print(f"✂️  무음 컷: {info.duration:.2f}초 → {cut_len:.2f}초 (조각 {len(ranges)}개)")

        name = args.name or f"{video.stem}_자막"
        if args.srt:
            # 이미 확인한(또는 메모장으로 고친) 자막 파일을 그대로 써요.
            srt_in = Path(args.srt.strip('"')).expanduser()
            if not srt_in.is_file():
                raise sc.CutError(f"'{srt_in}' 자막 파일을 찾을 수 없어요.")
            lines = parse_srt(srt_in.read_text(encoding="utf-8-sig"))
            if not lines:
                raise sc.CutError(f"'{srt_in.name}' 에서 자막을 하나도 읽지 못했어요.")
            print(f"\n💬 자막 파일에서 {len(lines)}줄을 읽었어요: {srt_in.name}")
            for line in lines:
                print(f"   {line.start:5.1f}~{line.end:5.1f}  {line.text}")
            if lines[-1].end > cut_len + 0.5:
                print("   ⚠️ 자막이 영상보다 길어요. 자막을 만들 때와 무음 컷 설정이 같은지 확인해 주세요.")
        else:
            # 2) 받아쓰기 → 3) 시간 옮기기
            segments = transcribe(video, args.whisper_model, args.language)
            items = map_segments(segments, ranges)
            if not items:
                raise sc.CutError("받아쓴 말이 없어요. 말소리가 있는 영상인지 확인해 주세요.")

            # 4) 쇼핑쇼츠 자막
            rewrites = None
            if not args.no_translate:
                print(f"✍️  Gemini 가 쇼핑쇼츠 자막으로 바꾸는 중… ({args.model})")
                answer = call_gemini(build_prompt(items, args.max_chars, args.style),
                                     load_api_key(args.api_key), args.model)
                rewrites = parse_rewrite(answer)
                missing = [it["id"] for it in items if it["id"] not in rewrites]
                if missing:
                    print(f"   ⚠️ {len(missing)}개 대사는 답이 없어서 원문을 그대로 넣었어요.")
            lines = make_lines(items, rewrites, args.max_chars)

            print("\n💬 자막")
            for it in items:
                print(f"   [{it['start']:5.1f}~{it['end']:5.1f}초] {it['text']}")
                for line in lines_for(it, rewrites, args.max_chars):
                    print(f"        → {line.start:5.1f}~{line.end:5.1f}  {line.text}")

            srt = video.with_name(f"{name}.srt")
            srt.write_text(to_srt(lines), encoding="utf-8")
            print(f"\n📝 자막 파일도 저장했어요: {srt}")
            print(f"   이 자막 그대로 쓰려면: python auto_subtitle.py {video.name} --srt {srt.name} --name 원하는이름")

        if args.dry_run:
            print("(--dry-run 이라서 CapCut 프로젝트는 만들지 않았어요.)")
            return 0

        template = cd.resolve_draft(args.template, args.projects_dir and Path(args.projects_dir))
        target = build_project(template, name, video, info, ranges, lines)
        print(f"✅ CapCut 프로젝트를 만들었어요: {target}")
        print("   CapCut을 완전히 껐다가 다시 켜면 목록에 보여요.")
    except cd.DraftError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
