#!/usr/bin/env python3
"""4주차: 잘 된 샘플 쇼츠를 분석해서 "성공공식 카드"(JSON)를 만드는 도구.

순서:
  1. 영상마다 프로그램이 직접 재요: 길이, 컷(장면 바뀜) 위치, 무음 비율.
  2. 영상마다 Gemini 가 보고 들어요: 훅, 구조, 자막 스타일, 효과음, 전환, 음악, 참여 유도.
     (영상마다 결과를 '샘플이름.analysis.json' 에 저장해서, 다시 실행하면 재사용해요.)
  3. 모든 샘플의 공통점을 모아서 성공공식 카드 한 장을 만들어요.

사용 예:
  python analyze_sample.py 샘플1.mp4 샘플2.mp4 샘플3.mp4 --out 공식_주방.json
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
import time
import urllib.request
from pathlib import Path

import auto_subtitle as au
import silence_cut as sc

SHORTS_MIN, SHORTS_MAX = 8.0, 35.0
INLINE_LIMIT = 15 * 1024 * 1024  # 이보다 작은 영상은 요청에 바로 실어 보내요.
MIME = {".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska"}
SECTIONS = ["훅", "배경", "전개", "반전", "클라이맥스", "결말", "참여유도", "기타"]


# ---------------------------------------------------------------------------
# 1. 프로그램이 직접 재는 것
# ---------------------------------------------------------------------------

def parse_scene_cuts(log: str) -> list[float]:
    return sorted(float(m) for m in re.findall(r"pts_time:\s*(\d+(?:\.\d+)?)", log))


def detect_cuts(video: Path, threshold: float) -> list[float]:
    log = sc.run_ffmpeg([
        "-i", str(video), "-an",
        "-vf", f"select='gt(scene,{threshold})',showinfo",
        "-f", "null", "-",
    ])
    return parse_scene_cuts(log)


def measure(video: Path, scene_threshold: float = 0.3) -> dict:
    info = sc.probe(video)
    cuts = [c for c in detect_cuts(video, scene_threshold) if 0.05 < c < info.duration - 0.05]
    bounds = [0.0, *cuts, info.duration]
    shots = [b - a for a, b in zip(bounds, bounds[1:]) if b - a > 0]
    silence = 0.0
    if info.has_audio:
        silence = sum(e - s for s, e in sc.detect_silences(video, info.duration, -35.0, 0.4))
    return {
        "길이초": round(info.duration, 2),
        "화면": f"{info.width}x{info.height}",
        "세로영상": info.height > info.width,
        "컷수": len(cuts),
        "컷시점초": [round(c, 2) for c in cuts],
        "평균장면길이초": round(statistics.mean(shots), 2) if shots else round(info.duration, 2),
        "첫3초컷수": sum(1 for c in cuts if c < 3.0),
        "무음비율": round(silence / info.duration, 2) if info.duration else 0.0,
        "장면민감도": scene_threshold,
    }


def summarize_measures(measures: list[dict]) -> dict:
    def avg(key: str) -> float:
        return round(statistics.mean(m[key] for m in measures), 2)
    lengths = [m["길이초"] for m in measures]
    return {
        "샘플수": len(measures),
        "평균길이초": avg("길이초"),
        "길이범위초": [min(lengths), max(lengths)],
        "평균장면길이초": avg("평균장면길이초"),
        "평균첫3초컷수": avg("첫3초컷수"),
        "평균무음비율": avg("무음비율"),
    }


# ---------------------------------------------------------------------------
# 2. Gemini 가 영상을 보고 분석
# ---------------------------------------------------------------------------

SAMPLE_PROMPT = """너는 한국 이슈·감동·정보·스토리 쇼츠 전문 기획자야. 이 영상은 조회수가 잘 나온 쇼츠야.
다른 영상에 똑같이 적용할 수 있게, 이 영상의 '성공 공식'을 뜯어서 정리해 줘.

참고로 프로그램이 잰 값: 길이 {duration}초, 컷 {cuts}번, 컷 시점(초) {cut_times}

규칙:
- 화면에 보이고 들리는 것만 근거로 써. 모르는 건 "모름".
- 시간은 초 단위 숫자.
- 효과음은 들리는 것만 (whoosh, pop, ding, 띠링, 카메라셔터, 박수, 웃음 등).

아래 JSON 모양 그대로 답해:
{{
  "주제": "무슨 이야기인지 한 줄",
  "장르": "이슈/감동/정보/스토리/유머/기타",
  "훅": {{"종류": "결말먼저/충격장면/질문/반전예고/감정리액션/기타", "설명": "첫 2초에 무엇을 보여주고 말하는지", "첫자막": "첫 자막 글자"}},
  "구조": [{{"구간": "{sections}", "시작": 0, "끝": 2, "내용": "무엇을 보여주는지"}}],
  "자막": {{"위치": "상단/중앙/하단", "글자색": "", "강조색": "", "테두리": true, "배경박스": false,
            "한줄평균글자수": 10, "강조방식": "어떤 단어를 어떻게 강조하는지", "폰트느낌": "굵은고딕/손글씨/..."}},
  "효과음": [{{"초": 1.2, "종류": "whoosh", "언제": "컷 바뀔 때/자막 뜰 때/반전 순간"}}],
  "전환": {{"주로": "그냥컷/줌인/슬라이드/흔들림/...", "특징": ""}},
  "음악": {{"있음": true, "분위기": "", "템포": "빠름/보통/느림"}},
  "말소리": {{"종류": "원어/한국어더빙/TTS/없음", "말투": ""}},
  "속도감": "느림/보통/빠름/매우빠름",
  "참여유도": "마지막에 댓글·좋아요·구독을 어떻게 유도하는지",
  "성공이유": ["이 영상이 잘 된 이유 3가지"]
}}"""


FORMULA_PROMPT = """너는 한국 이슈·감동·정보·스토리 쇼츠 전문 기획자야. 아래는 조회수가 잘 나온 쇼츠 {n}개의 분석 결과야.
공통점을 뽑아서, 새 영상을 편집할 때 그대로 따를 수 있는 '성공공식 카드'를 만들어 줘.

프로그램이 잰 평균값: {measured}

샘플 분석:
{samples}

규칙:
- 샘플 여러 개에 공통으로 나오는 것을 우선해. 한 영상에만 있는 건 '선택' 이라고 표시.
- 구조의 '비율'은 전체 길이 대비 비율(0~1)이고, 합이 1이 되게.
- '나만의공식_제안' 에는 샘플을 베끼지 않고 차별화할 방법을 구체적으로 3개.
- 샘플 영상의 문장이나 장면을 그대로 복사하라고 하지 마.

아래 JSON 모양 그대로 답해:
{{
  "이름": "공식 이름 (예: 감동사연_반전엔딩형)",
  "한줄요약": "",
  "훅": {{"규칙": "", "첫자막_예시": ["", "", ""]}},
  "구조": [{{"구간": "{sections}", "비율": 0.1, "규칙": ""}}],
  "자막": {{"위치": "", "글자색": "", "강조색": "", "테두리": true, "배경박스": false,
            "한줄최대글자수": 10, "강조규칙": "", "폰트느낌": ""}},
  "효과음": {{"규칙": [{{"언제": "컷 바뀔 때", "종류": "whoosh", "빈도": "매번/가끔"}}]}},
  "전환": {{"기본": "그냥컷", "규칙": ""}},
  "음악": {{"분위기": "", "템포": ""}},
  "말투": "",
  "속도감": "",
  "참여유도": "",
  "나만의공식_제안": ["", "", ""]
}}"""


def upload_video(video: Path, api_key: str) -> tuple[str, str]:
    """큰 영상은 Gemini 파일 저장소에 올리고 (uri, mime)를 돌려줘요."""
    mime = MIME.get(video.suffix.lower(), "video/mp4")
    size = video.stat().st_size
    start = urllib.request.Request(
        "https://generativelanguage.googleapis.com/upload/v1beta/files",
        data=json.dumps({"file": {"display_name": video.stem}}).encode("utf-8"),
        method="POST",
        headers={
            "x-goog-api-key": api_key, "Content-Type": "application/json",
            "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(size), "X-Goog-Upload-Header-Content-Type": mime,
        },
    )
    headers, _ = au.gemini_http(start)
    upload_url = headers.get("X-Goog-Upload-URL") or headers.get("x-goog-upload-url")
    if not upload_url:
        raise sc.CutError("Gemini 에 영상을 올릴 주소를 받지 못했어요.")

    send = urllib.request.Request(upload_url, data=video.read_bytes(), method="POST", headers={
        "Content-Length": str(size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize",
    })
    _, data = au.gemini_http(send, timeout=600)
    file = data.get("file", {})

    # 올린 영상은 Gemini 가 준비하는 데 시간이 걸려요.
    for _ in range(60):
        if file.get("state") != "PROCESSING":
            break
        time.sleep(3)
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/{file['name']}",
            headers={"x-goog-api-key": api_key},
        )
        _, file = au.gemini_http(req)
    if file.get("state") not in (None, "ACTIVE"):
        raise sc.CutError(f"Gemini 가 영상을 처리하지 못했어요 (상태: {file.get('state')}).")
    return file["uri"], file.get("mimeType", mime)


def video_part(video: Path, api_key: str) -> dict:
    if video.stat().st_size <= INLINE_LIMIT:
        import base64
        return {"inline_data": {"mime_type": MIME.get(video.suffix.lower(), "video/mp4"),
                                "data": base64.b64encode(video.read_bytes()).decode("ascii")}}
    print("   (영상이 커서 Gemini 에 먼저 올리는 중…)")
    uri, mime = upload_video(video, api_key)
    return {"file_data": {"mime_type": mime, "file_uri": uri}}


def ai_analyze(video: Path, measured: dict, api_key: str, model: str) -> dict:
    prompt = SAMPLE_PROMPT.format(
        duration=measured["길이초"], cuts=measured["컷수"],
        cut_times=measured["컷시점초"][:40], sections="/".join(SECTIONS),
    )
    answer = au.generate([video_part(video, api_key), {"text": prompt}], api_key, model, temperature=0.3, timeout=600)
    result = au.parse_json_answer(answer)
    if not isinstance(result, dict):
        raise sc.CutError("Gemini 분석 결과 모양이 이상해요. 다시 실행해 보세요.")
    return result


def print_measure(video: Path, m: dict) -> None:
    print(f"📏 {video.name}: 길이 {m['길이초']}초 · 컷 {m['컷수']}번 · 평균 장면 {m['평균장면길이초']}초 · 첫 3초 컷 {m['첫3초컷수']}번")


def analyze_one(video: Path, args, api_key: str | None) -> dict:
    cache = video.with_name(f"{video.stem}.analysis.json")
    result = None
    if cache.exists() and not args.refresh:
        result = json.loads(cache.read_text(encoding="utf-8"))
        print(f"🗂️  저장해 둔 분석 결과를 써요: {cache.name}")

    if result is None:
        result = {"파일": video.name, "측정": measure(video, args.scene_threshold)}
        print_measure(video, result["측정"])
    elif (result.get("측정") or {}).get("장면민감도") != args.scene_threshold:
        # 컷 민감도만 바뀌었으면 다시 재기만 해요. (Gemini 분석은 그대로, 돈 안 들어요)
        result["측정"] = measure(video, args.scene_threshold)
        print_measure(video, result["측정"])

    if api_key and not result.get("AI분석"):
        print(f"👀 Gemini 가 영상을 보는 중… ({args.model})")
        result["AI분석"] = ai_analyze(video, result["측정"], api_key, args.model)
    cache.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


# ---------------------------------------------------------------------------
# 3. 성공공식 카드
# ---------------------------------------------------------------------------

def target_length(avg_len: float) -> float:
    return round(min(max(avg_len, SHORTS_MIN), SHORTS_MAX), 1)


def default_formula(stats: dict) -> dict:
    """AI 없이 측정값만으로 만드는 기본 카드."""
    return {
        "이름": "측정값_기본공식",
        "한줄요약": "샘플의 길이와 컷 속도만 반영한 기본 공식 (AI 분석 없음)",
        "훅": {"규칙": "가장 강한 장면을 첫 2초에", "첫자막_예시": []},
        "구조": [
            {"구간": "훅", "비율": 0.1, "규칙": "가장 강한 장면(결말·반전)부터"},
            {"구간": "배경", "비율": 0.2, "규칙": "무슨 상황인지 짧게"},
            {"구간": "전개", "비율": 0.35, "규칙": "사건이 흘러가는 장면"},
            {"구간": "클라이맥스", "비율": 0.25, "규칙": "반전·감정이 터지는 순간"},
            {"구간": "참여유도", "비율": 0.1, "규칙": "질문으로 댓글 유도"},
        ],
        "자막": {"위치": "하단", "글자색": "흰색", "강조색": "노랑", "테두리": True, "배경박스": False,
                "한줄최대글자수": 12, "강조규칙": "감정·핵심 단어 강조", "폰트느낌": "굵은고딕"},
        "효과음": {"규칙": [{"언제": "컷 바뀔 때", "종류": "whoosh", "빈도": "가끔"}]},
        "전환": {"기본": "그냥컷", "규칙": ""},
        "음악": {"분위기": "경쾌", "템포": "빠름"},
        "말투": "담담하게 이야기하듯",
        "속도감": "빠름",
        "참여유도": "여러분 생각은? 질문으로 댓글 유도",
        "나만의공식_제안": [],
    }


def build_formula(results: list[dict], api_key: str | None, model: str) -> dict:
    stats = summarize_measures([r["측정"] for r in results])
    analyses = [r["AI분석"] for r in results if r.get("AI분석")]

    if api_key and analyses:
        print(f"🧪 샘플 {len(analyses)}개의 공통점으로 성공공식을 만드는 중…")
        prompt = FORMULA_PROMPT.format(
            n=len(analyses), measured=json.dumps(stats, ensure_ascii=False),
            samples="\n".join(json.dumps(a, ensure_ascii=False) for a in analyses),
            sections="/".join(SECTIONS),
        )
        formula = au.parse_json_answer(au.generate([{"text": prompt}], api_key, model, temperature=0.4))
        if not isinstance(formula, dict):
            raise sc.CutError("Gemini 가 만든 공식 모양이 이상해요. 다시 실행해 보세요.")
    else:
        formula = default_formula(stats)

    # 숫자는 AI 보다 프로그램이 잰 값이 정확해서, 측정값으로 채워요.
    formula["길이"] = {"최소": SHORTS_MIN, "최대": SHORTS_MAX, "목표": target_length(stats["평균길이초"])}
    formula["컷"] = {"평균장면길이초": stats["평균장면길이초"], "첫3초컷수": stats["평균첫3초컷수"]}
    formula["측정값"] = stats
    formula["샘플"] = [r["파일"] for r in results]
    formula["구조"] = normalize_structure(formula.get("구조") or [])
    return formula


def normalize_structure(parts: list) -> list[dict]:
    """구간 비율의 합이 1이 되게 맞춰요."""
    parts = [p for p in parts if isinstance(p, dict)]
    total = sum(float(p.get("비율") or 0) for p in parts)
    if total <= 0:
        return parts
    for p in parts:
        p["비율"] = round(float(p.get("비율") or 0) / total, 2)
    return parts


def print_formula(formula: dict) -> None:
    length = formula["길이"]["목표"]
    print(f"\n🏆 성공공식: {formula.get('이름', '')}")
    if formula.get("한줄요약"):
        print(f"   {formula['한줄요약']}")
    print(f"\n⏱️  목표 길이 {length}초 · 평균 장면 {formula['컷']['평균장면길이초']}초 · 첫 3초 컷 {formula['컷']['첫3초컷수']}번")
    hook = formula.get("훅") or {}
    print(f"🪝 훅: {hook.get('규칙', '')}")
    for ex in hook.get("첫자막_예시") or []:
        print(f"      예) {ex}")
    print("🧱 구조:")
    cursor = 0.0
    for part in formula["구조"]:
        sec = part.get("비율", 0) * length
        print(f"   {cursor:5.1f}~{cursor + sec:5.1f}초  {part.get('구간', ''):<5} {part.get('규칙', '')}")
        cursor += sec
    sub = formula.get("자막") or {}
    print(f"💬 자막: {sub.get('위치', '')} · {sub.get('글자색', '')}/{sub.get('강조색', '')} · "
          f"한 줄 {sub.get('한줄최대글자수', '')}자 · {sub.get('강조규칙', '')}")
    for rule in (formula.get("효과음") or {}).get("규칙") or []:
        print(f"🔊 효과음: {rule.get('언제', '')} → {rule.get('종류', '')} ({rule.get('빈도', '')})")
    trans = formula.get("전환") or {}
    print(f"🎞️  전환: {trans.get('기본', '')} {trans.get('규칙', '')}")
    cta = formula.get("참여유도") or formula.get("구매유도", "")
    print(f"🗣️  말투: {formula.get('말투', '')}   💬 참여유도: {cta}")
    if formula.get("나만의공식_제안"):
        print("✨ 나만의 공식으로 바꿀 아이디어:")
        for idea in formula["나만의공식_제안"]:
            print(f"   - {idea}")


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    p = argparse.ArgumentParser(description="잘 된 샘플 쇼츠 → 성공공식 카드 (4주차, 이슈·감동·정보·스토리)")
    p.add_argument("videos", nargs="+", help="샘플 영상 파일들 (2~5개 추천)")
    p.add_argument("--out", default="성공공식.json", help="만들 공식 카드 파일 이름 (기본: 성공공식.json)")
    p.add_argument("--no-ai", action="store_true", help="Gemini 없이 길이·컷 속도만 재요 (무료)")
    p.add_argument("--refresh", action="store_true", help="저장된 분석을 무시하고 다시 분석해요")
    p.add_argument("--scene-threshold", type=float, default=0.3, help="장면 바뀜 민감도 0~1 (낮을수록 컷을 많이 찾아요, 기본 0.3)")
    p.add_argument("--model", default=au.DEFAULT_MODEL, help=f"Gemini 모델 (기본 {au.DEFAULT_MODEL})")
    p.add_argument("--api-key", help="Gemini API 키 (기본: api_key.txt 또는 GEMINI_API_KEY)")
    args = p.parse_args(argv)

    try:
        videos = [Path(v.strip('"')).expanduser() for v in args.videos]
        for v in videos:
            if not v.is_file():
                raise sc.CutError(f"'{v}' 영상 파일을 찾을 수 없어요.")
        api_key = None if args.no_ai else au.load_api_key(args.api_key)

        results = [analyze_one(v, args, api_key) for v in videos]
        formula = build_formula(results, api_key, args.model)

        out = Path(args.out)
        if not out.is_absolute():
            out = videos[0].parent / out
        out.write_text(json.dumps(formula, ensure_ascii=False, indent=2), encoding="utf-8")
        print_formula(formula)
        print(f"\n📝 공식 카드를 저장했어요: {out}")
        print("   메모장으로 열어서 숫자나 글자를 고치면 '나만의 공식'이 돼요.")
    except sc.CutError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
