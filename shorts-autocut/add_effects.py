#!/usr/bin/env python3
"""6주차: 완성된 CapCut 프로젝트에 효과음과 장면 전환을 성공공식 규칙대로 자동으로 넣는 도구.

순서:
  1. 5주차에서 만든 프로젝트를 복사해서 '이름_효과' 프로젝트를 만들어요. (원래 프로젝트는 그대로)
  2. 공식 카드의 효과음 규칙(예: "컷 바뀔 때 → whoosh", "반전 순간 → 쿵")을 읽어요.
  3. 컷, 자막, 반전 장면 같은 '순간'을 찾아서, 내 효과음 폴더에서 맞는 소리를 골라 오디오 줄에 넣어요.
  4. 장면 전환은 틀에 넣어 둔 전환 효과를 복사해서, 이야기 구간이 바뀌는 곳에 넣어요.

틀 프로젝트 준비 (CapCut에서 한 번만):
  - 내 PC의 효과음 파일 하나를 틀의 타임라인에 끌어다 놓기 (오디오 줄이 생겨요)
  - 영상을 둘로 자르고(분할) 그 사이에 원하는 전환 효과 하나 넣기

사용 예:
  python add_effects.py 편집1 --formula 공식_생활.json --sfx 효과음 --dry-run
"""

from __future__ import annotations

import argparse
import copy
import json
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

import capcut_draft as cd
import silence_cut as sc

US = cd.MICROSECONDS
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}
MAX_AUDIO_TRACKS = 3

# 규칙의 '언제' 글자 → 어떤 순간인지
EVENT_WORDS = {
    "cut": ["컷", "전환", "장면", "화면", "넘어"],
    "caption": ["자막", "키워드", "텍스트", "글자"],
    "climax": ["반전", "클라이맥스", "임팩트", "충격", "하이라이트", "결정적", "감정"],
    "hook": ["훅", "시작", "도입", "오프닝", "첫"],
    "title": ["제목", "타이틀"],
    "end": ["마지막", "엔딩", "참여", "결말", "끝"],
}
EVENT_NAMES = {"cut": "컷", "caption": "자막", "climax": "반전/클라이맥스", "hook": "시작",
               "title": "제목", "end": "마지막"}
ROLE_CLIMAX = ("반전", "클라이맥스", "결정적", "하이라이트")

# 규칙의 '종류' 글자 → 파일 이름에서 찾을 말
SOUND_ALIASES = [
    ["whoosh", "swoosh", "swish", "스우시", "휙", "슉", "쉭"],
    ["impact", "hit", "boom", "bass", "쿵", "붐", "둥"],
    ["pop", "뿅", "팝", "뽁"],
    ["ding", "chime", "bell", "띵", "팅", "띠링", "딩"],
    ["click", "클릭", "딸깍"],
    ["shutter", "camera", "찰칵", "셔터"],
    ["laugh", "웃음"],
    ["clap", "applause", "박수"],
    ["riser", "rise", "라이저"],
    ["glitch", "글리치"],
]


class EffectError(sc.CutError):
    pass


@dataclass
class Placement:
    time: float        # 완성본에서 소리가 시작하는 초
    file: Path
    duration: float    # 실제로 쓸 길이(초)
    reason: str
    file_duration: float = 0.0  # 효과음 파일 전체 길이(초)


# ---------------------------------------------------------------------------
# 규칙 읽기
# ---------------------------------------------------------------------------

def rule_events(when: str) -> list[str]:
    return [event for event, words in EVENT_WORDS.items() if any(w in when for w in words)]


def rule_step(freq: str) -> int:
    """'매번' 은 모든 순간, '가끔' 은 두 번에 한 번."""
    return 2 if any(w in (freq or "") for w in ("가끔", "선택", "때때로")) else 1


def sound_words(kind: str) -> list[str]:
    low = (kind or "").lower()
    for group in SOUND_ALIASES:
        if any(a in low for a in group):
            return group
    return [w for w in low.replace("(", " ").replace(")", " ").replace("/", " ").split() if len(w) >= 2]


def match_files(kind: str, files: list[Path]) -> list[Path]:
    words = sound_words(kind)
    return [f for f in files if any(w in f.stem.lower() for w in words)]


def formula_rules(formula: dict) -> list[dict]:
    rules = (formula.get("효과음") or {}).get("규칙") or []
    return [r for r in rules if isinstance(r, dict)]


# ---------------------------------------------------------------------------
# 순간 찾기
# ---------------------------------------------------------------------------

def text_tracks(draft: dict) -> list[dict]:
    return [t for t in draft.get("tracks") or [] if t.get("type") == "text"]


def starts(track: dict | None) -> list[float]:
    if not track:
        return []
    return sorted((s.get("target_timerange") or {}).get("start", 0) / US for s in track.get("segments") or [])


def find_moments(draft: dict, timeline: dict | None) -> dict[str, list[float]]:
    total = (draft.get("duration") or 0) / US
    video = next((t for t in draft.get("tracks") or [] if t.get("type") == "video"), None)
    texts = text_tracks(draft)
    captions = texts[0] if texts else None
    titles = texts[1] if len(texts) > 1 else None

    scenes = (timeline or {}).get("장면") or []
    climax = [s["시작"] for s in scenes if any(r in str(s.get("역할", "")) for r in ROLE_CLIMAX)]
    return {
        "cut": [t for t in starts(video) if t > 0.05],
        "caption": starts(captions),
        "climax": climax,
        "hook": [0.0],
        "title": starts(titles)[:1],
        "end": [max(0.0, total - 2.5)] if total > 4 else [],
    }


def plan_sfx(rules: list[dict], moments: dict[str, list[float]], files: list[Path],
             durations: dict[Path, float], total: float, min_gap: float = 0.8) -> tuple[list[Placement], list[str]]:
    placements: list[Placement] = []
    notes: list[str] = []
    for rule in rules:
        when, kind = str(rule.get("언제") or ""), str(rule.get("종류") or "")
        events = rule_events(when)
        matched = match_files(kind, files)
        if not events:
            notes.append(f"'{when}' 이 언제인지 몰라서 건너뛰었어요.")
            continue
        if not matched:
            notes.append(f"'{kind}' 효과음 파일이 폴더에 없어요. 파일 이름에 {sound_words(kind)[:3]} 중 하나를 넣어 주세요.")
            continue
        times = sorted({round(t, 3) for e in events for t in moments.get(e, [])})
        step = rule_step(str(rule.get("빈도") or ""))
        for i, t in enumerate(times[::step]):
            if t >= total - 0.2:
                continue
            if any(abs(t - p.time) < min_gap for p in placements):
                continue
            f = matched[i % len(matched)]
            length = min(durations.get(f, 1.0), 2.0, total - t)
            placements.append(Placement(t, f, length, f"{when} → {kind}", durations.get(f, length)))
    return sorted(placements, key=lambda p: p.time), notes


def transition_points(draft: dict, timeline: dict | None, mode: str) -> list[int]:
    """전환을 넣을 영상 조각 번호들 (그 조각과 다음 조각 사이에 들어가요)."""
    video = next((t for t in draft.get("tracks") or [] if t.get("type") == "video"), None)
    segs = (video or {}).get("segments") or []
    if mode == "none" or len(segs) < 2:
        return []
    if mode == "all":
        return list(range(len(segs) - 1))
    # clips: 이야기 구간(5주차 장면)이 바뀌는 곳에만
    bounds = [s["시작"] for s in ((timeline or {}).get("장면") or [])][1:]
    points = []
    for b in bounds:
        for i, seg in enumerate(segs[:-1]):
            tr = seg.get("target_timerange") or {}
            end = (tr.get("start", 0) + tr.get("duration", 0)) / US
            if abs(end - b) < 0.05:
                points.append(i)
                break
    return points


# ---------------------------------------------------------------------------
# CapCut 프로젝트에 쓰기
# ---------------------------------------------------------------------------

def copy_material(src: dict, dst: dict, material_id: str) -> str | None:
    """틀(src)의 재료 하나를 새 id 로 프로젝트(dst)에 복사해요."""
    found = sc.find_material(src, material_id)
    if not found:
        return None
    _, item = found
    key = next(k for k, v in src["materials"].items() if isinstance(v, list) and item in v)
    dup = copy.deepcopy(item)
    dup["id"] = sc.new_id()
    dst.setdefault("materials", {}).setdefault(key, []).append(dup)
    return dup["id"]


def audio_prototype(template: dict) -> tuple[dict, dict, dict]:
    for track in template.get("tracks") or []:
        if track.get("type") == "audio" and track.get("segments"):
            seg = track["segments"][0]
            found = sc.find_material(template, seg.get("material_id", ""))
            if found:
                return track, seg, found[1]
    raise EffectError(
        "틀 프로젝트에 효과음(오디오)이 없어요. CapCut에서 틀을 열고 내 PC의 효과음 파일 하나를 타임라인에 "
        "끌어다 놓은 뒤 저장해 주세요."
    )


def add_sfx(draft: dict, template: dict, placements: list[Placement], volume: float) -> int:
    if not placements:
        return 0
    proto_track, proto_seg, proto_mat = audio_prototype(template)
    if proto_mat.get("effect_id") or proto_mat.get("resource_id"):
        print("   ⚠️ 틀의 효과음이 CapCut 효과음 목록에서 넣은 것 같아요. 소리가 안 바뀌면 틀의 효과음을 지우고,"
              " 내 PC의 효과음 파일을 끌어다 놓아 주세요.")
    tracks: list[dict] = []
    added = 0
    for p in placements:
        start, dur = int(round(p.time * US)), int(round(p.duration * US))
        if dur <= 0:
            continue
        # 같은 줄에서 겹치면 안 돼서, 비어 있는 줄을 찾거나 새 줄을 만들어요.
        track = next((t for t in tracks if all(
            start >= s["target_timerange"]["start"] + s["target_timerange"]["duration"]
            or start + dur <= s["target_timerange"]["start"] for s in t["segments"])), None)
        if track is None:
            if len(tracks) >= MAX_AUDIO_TRACKS:
                continue
            track = copy.deepcopy({k: v for k, v in proto_track.items() if k != "segments"})
            track["id"] = sc.new_id()
            track["segments"] = []
            tracks.append(track)

        mat = copy.deepcopy(proto_mat)
        mat["id"] = sc.new_id()
        mat["path"] = p.file.resolve().as_posix()
        mat["name"] = p.file.name
        mat["duration"] = int(round(max(p.file_duration, p.duration) * US))
        if mat.get("music_id"):
            mat["music_id"] = sc.new_id()
        draft.setdefault("materials", {}).setdefault("audios", []).append(mat)

        seg = copy.deepcopy(proto_seg)
        seg["id"] = sc.new_id()
        seg["material_id"] = mat["id"]
        seg["source_timerange"] = {"start": 0, "duration": dur}
        seg["target_timerange"] = {"start": start, "duration": dur}
        seg["volume"] = volume
        seg["extra_material_refs"] = [
            new for ref in proto_seg.get("extra_material_refs") or []
            if (new := copy_material(template, draft, ref))
        ]
        track["segments"].append(seg)
        added += 1
    draft.setdefault("tracks", []).extend(tracks)
    return added


def add_transitions(draft: dict, template: dict, points: list[int], max_sec: float) -> int:
    if not points:
        return 0
    protos = (template.get("materials") or {}).get("transitions") or []
    if not protos:
        raise EffectError(
            "틀 프로젝트에 장면 전환이 없어요. CapCut에서 틀의 영상을 둘로 자르고(분할) 그 사이에 전환 효과를 "
            "하나 넣은 뒤 저장해 주세요. 전환 없이 하려면 --transitions none 을 붙이세요."
        )
    proto = protos[0]
    video = next(t for t in draft["tracks"] if t.get("type") == "video")
    segs = video["segments"]
    done = 0
    for i in points:
        a, b = segs[i]["target_timerange"]["duration"], segs[i + 1]["target_timerange"]["duration"]
        # 전환은 양쪽 조각 길이의 절반보다 길면 안 돼요.
        length = int(min(proto.get("duration") or 0.5 * US, max_sec * US, a / 2, b / 2))
        if length < 0.1 * US:
            continue
        mat = copy.deepcopy(proto)
        mat["id"] = sc.new_id()
        mat["duration"] = length
        draft["materials"].setdefault("transitions", []).append(mat)
        segs[i].setdefault("extra_material_refs", []).append(mat["id"])
        done += 1
    return done


# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------

def sfx_files(folder: Path) -> list[Path]:
    if not folder.is_dir():
        raise EffectError(f"'{folder}' 효과음 폴더가 없어요. 폴더를 만들고 효과음 파일을 넣어 주세요.")
    files = sorted(f for f in folder.iterdir() if f.suffix.lower() in AUDIO_EXT)
    if not files:
        raise EffectError(f"'{folder}' 폴더에 효과음 파일(mp3, wav 등)이 없어요.")
    return files


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    p = argparse.ArgumentParser(description="CapCut 프로젝트에 효과음·장면 전환 자동 넣기 (6주차)")
    p.add_argument("project", help="5주차에서 만든 CapCut 프로젝트 이름 (예: 편집1)")
    p.add_argument("--formula", required=True, help="4주차 공식 카드 (.json)")
    p.add_argument("--sfx", default="효과음", help="효과음 파일이 든 폴더 (기본: 효과음)")
    p.add_argument("--name", help="새 프로젝트 이름 (기본: 프로젝트이름_효과)")
    p.add_argument("--template", default="틀_쇼핑쇼츠", help="효과음·전환을 복사해 올 틀 프로젝트 (기본: 틀_쇼핑쇼츠)")
    p.add_argument("--projects-dir", help="CapCut 프로젝트 폴더 (기본: 자동으로 찾기)")
    p.add_argument("--timeline", help="5주차가 만든 '이름.timeline.json' (기본: 자동으로 찾기)")
    p.add_argument("--transitions", choices=["clips", "all", "none"], default="clips",
                   help="전환 넣을 곳: clips=이야기 구간이 바뀔 때(기본), all=모든 컷, none=안 넣음")
    p.add_argument("--transition-max", type=float, default=0.4, help="전환 최대 길이(초) (기본 0.4)")
    p.add_argument("--sfx-volume", type=float, default=0.6, help="효과음 크기 0~1 (기본 0.6)")
    p.add_argument("--min-gap", type=float, default=0.8, help="효과음 사이 최소 간격(초) (기본 0.8)")
    p.add_argument("--dry-run", action="store_true", help="어디에 넣을지만 보여줘요")
    args = p.parse_args(argv)

    try:
        import auto_edit as ae  # 공식 카드 읽기 재사용
        projects_dir = args.projects_dir and Path(args.projects_dir)
        source = cd.resolve_draft(args.project, projects_dir)
        template = cd.resolve_draft(args.template, projects_dir)
        formula = ae.load_formula(Path(args.formula.strip('"')).expanduser())

        timeline = None
        tl_path = Path(args.timeline) if args.timeline else Path(f"{source.name}.timeline.json")
        if tl_path.is_file():
            timeline = json.loads(tl_path.read_text(encoding="utf-8"))
        else:
            print(f"ℹ️ '{tl_path.name}' 이 없어서 반전 장면·구간 전환은 건너뛰고, 컷·자막 기준으로만 넣어요.")

        draft = cd.load_json(cd.content_path(source))
        template_draft = cd.load_json(cd.content_path(template))
        total = (draft.get("duration") or 0) / US

        files = sfx_files(Path(args.sfx.strip('"')).expanduser())
        durations = {f: sc.probe(f).duration for f in files}
        moments = find_moments(draft, timeline)
        placements, notes = plan_sfx(formula_rules(formula), moments, files, durations, total, args.min_gap)
        mode = args.transitions if (timeline or args.transitions != "clips") else "none"
        points = transition_points(draft, timeline, mode)

        print(f"\n🔊 효과음 {len(placements)}개")
        for pl in placements:
            print(f"   {pl.time:5.1f}초  {pl.file.name:<24} ({pl.reason})")
        for note in notes:
            print(f"   ⚠️ {note}")
        print(f"\n🎞️  장면 전환 {len(points)}곳 ({args.transitions})")
        video = next((t for t in draft["tracks"] if t.get("type") == "video"), {"segments": []})
        for i in points:
            tr = video["segments"][i]["target_timerange"]
            print(f"   {(tr['start'] + tr['duration']) / US:5.1f}초")

        if args.dry_run:
            print("\n(--dry-run 이라서 프로젝트는 만들지 않았어요.)")
            return 0

        name = args.name or f"{source.name}_효과"
        target = cd.clone_draft(source, name, [])
        try:
            path = cd.content_path(target)
            new_draft = cd.load_json(path)
            n_sfx = add_sfx(new_draft, template_draft, placements, args.sfx_volume)
            n_tr = add_transitions(new_draft, template_draft, points, args.transition_max)
            cd.save_draft(target, path, new_draft)
        except Exception:
            shutil.rmtree(target, ignore_errors=True)
            raise
        print(f"\n✅ 효과음 {n_sfx}개, 전환 {n_tr}곳을 넣은 프로젝트를 만들었어요: {target}")
        print("   CapCut을 완전히 껐다가 다시 켜면 목록에 보여요.")
        print("   ⚠️ 효과음 파일을 옮기거나 지우면 CapCut에서 소리가 안 나요.")
    except cd.DraftError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
