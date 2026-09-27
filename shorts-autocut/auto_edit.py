#!/usr/bin/env python3
"""5주차: 성공공식 카드대로 원본 영상을 8~35초 쇼츠로 자동 편집해서 CapCut 프로젝트로 만드는 도구.

이슈·감동·정보·스토리 쇼츠용이에요.

순서:
  1. 원본의 장면 바뀌는 시점(컷)과 대사(Whisper)를 알아내요.
  2. Gemini 가 원본 영상을 보고, 공식의 구조(훅→배경→전개→클라이맥스→참여유도)에 맞는 장면을 골라요.
     가장 강한 장면을 맨 앞(훅)으로 옮겨도 돼요.
  3. 고른 장면 안의 무음을 잘라내고, 대사를 공식의 말투로 자막을 만들어요.
  4. 첫 2~3초 '훅 제목'과 마지막 '참여유도 자막'을 화면 위쪽에 넣어요.
  5. 편집 계획을 '이름.plan.json' 으로 저장해요. 메모장으로 고쳐서 --plan 으로 다시 쓸 수 있어요.

사용 예:
  python auto_edit.py 원본.mp4 --formula 공식_생활.json --dry-run
  python auto_edit.py 원본.mp4 --plan 원본_편집.plan.json --name 편집1
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import analyze_sample as an
import auto_subtitle as au
import capcut_draft as cd
import silence_cut as sc

SHORTS_MIN, SHORTS_MAX = an.SHORTS_MIN, an.SHORTS_MAX
MIN_CLIP = 0.6  # 이보다 짧은 장면은 버려요.


# ---------------------------------------------------------------------------
# 공식 카드
# ---------------------------------------------------------------------------

def load_formula(path: Path) -> dict:
    if not path.is_file():
        raise sc.CutError(f"'{path}' 공식 카드 파일을 찾을 수 없어요. 4주차에서 만든 .json 파일 이름을 확인해 주세요.")
    try:
        formula = json.loads(path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as e:
        raise sc.CutError(
            f"'{path.name}' 파일 {e.lineno}번째 줄 근처 모양이 깨졌어요. 메모장으로 고칠 때 따옴표(\")나 쉼표(,)가 "
            "빠지지 않았는지 확인해 주세요."
        ) from None
    if not isinstance(formula, dict):
        raise sc.CutError(f"'{path.name}' 은(는) 공식 카드 모양이 아니에요.")
    return formula


def target_seconds(formula: dict, override: float | None) -> float:
    length = formula.get("길이") or {}
    value = override or length.get("목표") or 25.0
    return round(min(max(float(value), SHORTS_MIN), SHORTS_MAX), 1)


def section_plan(formula: dict, target: float) -> list[str]:
    """'훅 0~2.5초: 규칙' 같은 구조별 목표 시간 설명을 만들어요."""
    rows, cursor = [], 0.0
    for part in formula.get("구조") or []:
        sec = float(part.get("비율") or 0) * target
        rows.append(f"- {part.get('구간', '')}: {cursor:.1f}~{cursor + sec:.1f}초 — {part.get('규칙', '')}")
        cursor += sec
    return rows


def caption_style(formula: dict) -> tuple[int, str]:
    sub = formula.get("자막") or {}
    try:
        max_chars = int(sub.get("한줄최대글자수") or 12)
    except (TypeError, ValueError):
        max_chars = 12
    parts = [formula.get("말투") or "", sub.get("강조규칙") or ""]
    return max(4, max_chars), " / ".join(p for p in parts if p)


# ---------------------------------------------------------------------------
# 장면 고르기 (Gemini)
# ---------------------------------------------------------------------------

EDIT_PROMPT = """너는 조회수 높은 한국 이슈·감동·정보·스토리 쇼츠 편집자야.
첨부한 원본 영상을 아래 '성공공식'대로 {target}초짜리 쇼츠로 편집하려고 해. 쓸 장면을 골라 줘.

[성공공식]
이름: {name}
요약: {summary}
훅 규칙: {hook}
속도감: {pace} (평균 장면 길이 약 {shot}초)
구조별 목표 시간:
{sections}

[원본 정보]
길이: {duration}초
장면이 바뀌는 시점(초): {cuts}
대사 (시작~끝초: 원문):
{transcript}

[규칙]
- 원본에서 [시작, 끝] 구간을 골라, 쇼츠에 나올 순서대로 나열해.
- 순서는 원본과 달라도 돼. 가장 강한 장면(결말, 반전, 감정이 터지는 순간)을 훅으로 맨 앞에 둬도 좋아.
- 되도록 장면이 바뀌는 시점이나 대사 경계에서 자르고, 말하는 중간에 자르지 마.
- 한 구간은 {min_clip}초 이상. 같은 장면을 두 번 쓰지 마 (구간끼리 겹치지 않게).
- 고른 구간 길이의 합은 {min_len}~{max_len}초, 목표 {target}초에 가깝게.
- 보는 사람이 이야기를 이해할 수 있게 골라. 원본에 없는 사실을 만들지 마.
- 훅제목: 첫 2~3초 화면 위쪽에 띄울 제목 한 줄. 공백 포함 {title_chars}자 이하, 훅 규칙을 따르되 과장·허위 금지.
- 참여유도: 마지막 2~3초에 띄울 한 줄 ({title_chars}자 이하). 공식의 참여유도 방식을 따라. 필요 없으면 "".

JSON 으로만 답해:
{{"훅제목": "", "참여유도": "", "구간": [{{"시작": 12.3, "끝": 15.0, "역할": "훅", "이유": "왜 이 장면인지"}}]}}"""


def build_edit_prompt(formula: dict, duration: float, cuts: list[float], transcript: list[dict],
                      target: float, title_chars: int) -> str:
    lines = "\n".join(f"{t['start']:.1f}~{t['end']:.1f}: {t['text']}" for t in transcript) or "(대사 없음)"
    return EDIT_PROMPT.format(
        target=target, name=formula.get("이름", ""), summary=formula.get("한줄요약", ""),
        hook=(formula.get("훅") or {}).get("규칙", ""), pace=formula.get("속도감", ""),
        shot=(formula.get("컷") or {}).get("평균장면길이초", "?"),
        sections="\n".join(section_plan(formula, target)) or "- (구조 정보 없음)",
        duration=round(duration, 2), cuts=[round(c, 1) for c in cuts[:120]], transcript=lines,
        min_clip=MIN_CLIP, min_len=SHORTS_MIN, max_len=SHORTS_MAX, title_chars=title_chars,
    )


def clean_clips(raw: list, duration: float) -> list[dict]:
    """Gemini 가 고른 구간을 정리해요: 범위 밖 자르기, 겹치는 부분 빼기, 너무 짧은 것 버리기."""
    taken: list[tuple[float, float]] = []
    clips = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        try:
            start = max(0.0, float(item.get("시작")))
            end = min(duration, float(item.get("끝")))
        except (TypeError, ValueError):
            continue
        # 이미 쓴 장면과 겹치는 부분은 잘라내요.
        for ts, te in taken:
            if start < te and end > ts:
                if start >= ts:
                    start = te
                else:
                    end = min(end, ts)
        if end - start < MIN_CLIP:
            continue
        taken.append((start, end))
        clips.append({"시작": round(start, 2), "끝": round(end, 2),
                      "역할": str(item.get("역할") or ""), "이유": str(item.get("이유") or "")})
    return clips


def fit_length(clips: list[dict], max_len: float) -> list[dict]:
    """전체가 max_len 을 넘으면 뒤쪽 장면부터 줄이거나 빼요 (훅은 지켜요)."""
    clips = [dict(c) for c in clips]
    total = sum(c["끝"] - c["시작"] for c in clips)
    i = len(clips) - 1
    while total > max_len + 1e-6 and i > 0:
        over = total - max_len
        length = clips[i]["끝"] - clips[i]["시작"]
        if length - over >= MIN_CLIP:
            clips[i]["끝"] = round(clips[i]["끝"] - over, 2)
            total -= over
        else:
            total -= length
            clips.pop(i)
        i = min(i - 1, len(clips) - 1)
    return clips


def split_by_sound(clips: list[dict], keep: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """고른 장면마다 무음을 잘라내요. 순서는 고른 순서 그대로예요."""
    ranges = []
    for c in clips:
        for ks, ke in keep:
            s, e = max(c["시작"], ks), min(c["끝"], ke)
            if e - s >= 0.2:
                ranges.append((round(s, 3), round(e, 3)))
    return ranges


# ---------------------------------------------------------------------------
# 계획 저장 / 불러오기
# ---------------------------------------------------------------------------

def save_plan(path: Path, video: Path, formula_name: str, plan: dict, lines: list[au.Line]) -> None:
    data = {
        "원본": video.name,
        "공식": formula_name,
        "훅제목": plan.get("훅제목", ""),
        "참여유도": plan.get("참여유도", ""),
        "구간": plan["구간"],
        "자막": [{"시작": l.start, "끝": l.end, "글자": l.text} for l in lines],
    }
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_plan(path: Path) -> tuple[dict, list[au.Line]]:
    plan = load_formula(path)  # 같은 방식으로 읽고, 깨진 곳을 알려줘요.
    lines = []
    for row in plan.get("자막") or []:
        try:
            lines.append(au.Line(float(row["시작"]), float(row["끝"]), str(row["글자"])))
        except (KeyError, TypeError, ValueError):
            continue
    return plan, lines


def title_lines(plan: dict, total: float) -> list[au.Line]:
    lines = []
    hook = str(plan.get("훅제목") or "").strip()
    cta = str(plan.get("참여유도") or "").strip()
    if hook:
        lines.append(au.Line(0.0, round(min(3.0, total), 3), hook))
    if cta and total > 4.0:
        lines.append(au.Line(round(total - min(2.5, total / 4), 3), round(total, 3), cta))
    return lines


def near(path_arg: str, video: Path) -> Path:
    """파일 이름만 쓰면 지금 폴더 → 영상이 있는 폴더 순서로 찾아요."""
    path = Path(path_arg.strip('"')).expanduser()
    if not path.exists() and not path.is_absolute() and (video.parent / path).exists():
        return video.parent / path
    return path


def build_project(template: Path, name: str, video: Path, info: sc.VideoInfo,
                  ranges: list[tuple[float, float]], lines: list[au.Line], titles: list[au.Line]) -> Path:
    target = cd.clone_draft(template, name, [])
    try:
        path = cd.content_path(target)
        draft = cd.load_json(path)
        sc.apply_cuts(draft, video, info, ranges)
        au.apply_captions(draft, lines, titles)
        cd.save_draft(target, path, draft)
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    return target


# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------

def print_plan(plan: dict, ranges: list[tuple[float, float]], lines: list[au.Line]) -> float:
    total = sum(e - s for s, e in ranges)
    print("\n🎬 고른 장면 (쇼츠에 나오는 순서)")
    cursor = 0.0
    for c in plan["구간"]:
        length = c["끝"] - c["시작"]
        print(f"   {cursor:5.1f}초~  [{c.get('역할', ''):<5}] 원본 {c['시작']:6.1f}~{c['끝']:6.1f}초 ({length:.1f}초)  {c.get('이유', '')}")
        cursor += length
    print(f"\n🪝 훅 제목: {plan.get('훅제목') or '(없음)'}")
    print(f"💬 참여유도: {plan.get('참여유도') or '(없음)'}")
    print(f"\n📝 자막 {len(lines)}줄")
    for l in lines:
        print(f"   {l.start:5.1f}~{l.end:5.1f}  {l.text}")
    print(f"\n⏱️  완성 길이: {total:.1f}초 (무음 제거 후)")
    if total < SHORTS_MIN:
        print(f"   ⚠️ {SHORTS_MIN:.0f}초보다 짧아요. --no-silence-cut 을 붙이거나 --target 을 늘려 보세요.")
    elif total > SHORTS_MAX:
        print(f"   ⚠️ {SHORTS_MAX:.0f}초보다 길어요.")
    else:
        print(f"   ✅ 쇼츠 길이({SHORTS_MIN:.0f}~{SHORTS_MAX:.0f}초) 안이에요.")
    return total


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    p = argparse.ArgumentParser(description="성공공식대로 원본 → 8~35초 쇼츠 자동 편집 → CapCut 프로젝트 (5주차)")
    p.add_argument("video", help="원본 영상 파일 경로")
    p.add_argument("--formula", help="4주차 공식 카드 (.json). --plan 을 쓰면 필요 없어요")
    p.add_argument("--plan", help="저장해 둔 편집 계획 (.plan.json) 을 그대로 써요 (Gemini 안 씀)")
    p.add_argument("--name", help="새 프로젝트 이름 (기본: 영상파일이름_편집)")
    p.add_argument("--template", default="틀_쇼핑쇼츠", help="틀 프로젝트 이름 (기본: 틀_쇼핑쇼츠)")
    p.add_argument("--projects-dir", help="CapCut 프로젝트 폴더 (기본: 자동으로 찾기)")
    p.add_argument("--target", type=float, help="목표 길이(초). 기본은 공식 카드의 목표 길이")
    p.add_argument("--no-silence-cut", action="store_true", help="고른 장면 안의 무음은 자르지 않아요")
    p.add_argument("--threshold", type=float, default=-35.0, help="무음 기준 소리 크기(dB) (기본 -35)")
    p.add_argument("--min-silence", type=float, default=0.6, help="무음으로 볼 최소 시간(초) (기본 0.6)")
    p.add_argument("--padding", type=float, default=0.12, help="소리 앞뒤 여유(초) (기본 0.12)")
    p.add_argument("--scene-threshold", type=float, default=0.15, help="장면 바뀜 민감도 (기본 0.15)")
    p.add_argument("--whisper-model", default="small", help="받아쓰기 모델 (기본 small)")
    p.add_argument("--language", help="원본 언어 (예: en, es). 비우면 자동")
    p.add_argument("--no-translate", action="store_true", help="자막을 번역하지 않고 원문 그대로 넣어요")
    p.add_argument("--title-y", type=float, default=0.6, help="훅 제목 높이 (-1 아래 ~ 1 위, 기본 0.6)")
    p.add_argument("--model", default=au.DEFAULT_MODEL, help=f"Gemini 모델 (기본 {au.DEFAULT_MODEL})")
    p.add_argument("--api-key", help="Gemini API 키 (기본: api_key.txt 또는 GEMINI_API_KEY)")
    p.add_argument("--dry-run", action="store_true", help="CapCut 프로젝트는 만들지 않고 계획만 보여주고 저장해요")
    args = p.parse_args(argv)

    try:
        video = Path(args.video.strip('"')).expanduser()
        if not video.is_file():
            raise sc.CutError(f"'{video}' 영상 파일을 찾을 수 없어요.")
        if not args.formula and not args.plan:
            raise sc.CutError("--formula 공식카드.json 또는 --plan 계획.plan.json 중 하나를 알려 주세요.")
        info = sc.probe(video)
        name = args.name or f"{video.stem}_편집"

        # 무음이 아닌 부분 (고른 장면을 한 번 더 다듬는 데 써요)
        if args.no_silence_cut or not info.has_audio:
            keep = [(0.0, info.duration)]
        else:
            silences = sc.detect_silences(video, info.duration, args.threshold, args.min_silence)
            keep = sc.keep_ranges(info.duration, silences, args.padding) or [(0.0, info.duration)]

        if args.plan:
            plan, lines = load_plan(near(args.plan, video))
            plan["구간"] = clean_clips(plan.get("구간"), info.duration)
            ranges = split_by_sound(plan["구간"], keep)
            print(f"🗂️  저장된 편집 계획을 써요: {args.plan}")
        else:
            formula = load_formula(near(args.formula, video))
            target = target_seconds(formula, args.target)
            max_chars, style = caption_style(formula)
            api_key = au.load_api_key(args.api_key)
            print(f"🏆 공식: {formula.get('이름', '')}  ·  목표 {target}초")

            # 1) 원본 파악: 컷 + 대사
            cuts = an.detect_cuts(video, args.scene_threshold)
            print(f"📏 원본 {info.duration:.1f}초 · 장면 바뀜 {len(cuts)}번")
            transcript = au.transcribe(video, args.whisper_model, args.language) if info.has_audio else []

            # 2) 장면 고르기
            print(f"👀 Gemini 가 원본을 보고 장면을 고르는 중… ({args.model})")
            prompt = build_edit_prompt(formula, info.duration, cuts, transcript, target, max_chars + 4)
            answer = au.generate([an.video_part(video, api_key), {"text": prompt}], api_key, args.model,
                                 temperature=0.4, timeout=600)
            plan = au.parse_json_answer(answer)
            if not isinstance(plan, dict):
                raise sc.CutError("Gemini 편집 계획 모양이 이상해요. 다시 실행해 보세요.")
            plan["구간"] = fit_length(clean_clips(plan.get("구간"), info.duration), SHORTS_MAX)
            if not plan["구간"]:
                raise sc.CutError("Gemini 가 쓸 만한 장면을 고르지 못했어요. 다시 실행해 보세요.")

            # 3) 무음 다듬기 + 자막
            ranges = split_by_sound(plan["구간"], keep)
            items = au.map_segments(transcript, ranges)
            rewrites = None
            if items and not args.no_translate:
                print("✍️  공식 말투로 자막을 만드는 중…")
                answer = au.call_gemini(au.build_prompt(items, max_chars, style), api_key, args.model)
                rewrites = au.parse_rewrite(answer)
            lines = au.make_lines(items, rewrites, max_chars)
            save_plan(video.with_name(f"{name}.plan.json"), video, formula.get("이름", ""), plan, lines)

        if not ranges:
            raise sc.CutError("고른 장면이 전부 무음이라 남는 게 없어요. --no-silence-cut 을 붙여 보세요.")
        total = print_plan(plan, ranges, lines)
        titles = title_lines(plan, total)

        video.with_name(f"{name}.srt").write_text(au.to_srt(lines), encoding="utf-8")
        if not args.plan:
            print(f"\n💾 편집 계획 저장: {name}.plan.json  (메모장으로 고친 뒤 --plan 으로 다시 쓸 수 있어요)")

        if args.dry_run:
            print(f"(--dry-run 이라서 CapCut 프로젝트는 만들지 않았어요.)\n"
                  f"   이 계획 그대로 만들기: python auto_edit.py {video.name} --plan {name}.plan.json --name {name}")
            return 0

        template = cd.resolve_draft(args.template, args.projects_dir and Path(args.projects_dir))
        target_dir = build_project(template, name, video, info, ranges, lines, titles)
        print(f"✅ CapCut 프로젝트를 만들었어요: {target_dir}")
        print("   CapCut을 완전히 껐다가 다시 켜면 목록에 보여요.")
    except cd.DraftError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
