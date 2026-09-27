#!/usr/bin/env python3
"""2주차: 원본 영상의 무음 부분을 찾아서 잘라내고, 남은 조각들을 CapCut 프로젝트에 넣는 도구.

순서:
  1. ffmpeg 로 영상 길이, 크기, 무음 구간을 알아내요.
  2. 무음이 아닌 부분(말하거나 소리가 나는 부분)만 골라요.
  3. 틀 프로젝트를 복사하고, 영상 줄에 그 조각들을 순서대로 붙여요.

필요한 것: ffmpeg (PC에 설치되어 있거나, `pip install imageio-ffmpeg`)
"""

from __future__ import annotations

import argparse
import copy
import re
import shutil
import subprocess
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

import capcut_draft as cd

US = cd.MICROSECONDS
SHORTS_MIN, SHORTS_MAX = 8.0, 35.0


class CutError(cd.DraftError):
    pass


# ---------------------------------------------------------------------------
# ffmpeg
# ---------------------------------------------------------------------------

def find_ffmpeg() -> str:
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg  # type: ignore
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        raise CutError(
            "ffmpeg를 찾을 수 없어요. 검은 창에 아래를 입력해서 설치해 주세요.\n"
            "    python -m pip install imageio-ffmpeg"
        ) from None


def run_ffmpeg(args: list[str]) -> str:
    """ffmpeg 를 실행하고, 정보가 담긴 stderr 글자를 돌려줘요."""
    proc = subprocess.run(
        [find_ffmpeg(), "-hide_banner", "-nostats", *args],
        capture_output=True,
    )
    return proc.stderr.decode("utf-8", errors="replace")


@dataclass
class VideoInfo:
    duration: float
    width: int
    height: int
    has_audio: bool


def parse_video_info(log: str) -> VideoInfo:
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", log)
    if not m:
        raise CutError("영상 길이를 알 수 없어요. 영상 파일이 맞는지 확인해 주세요.")
    duration = int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])

    width = height = 0
    v = re.search(r"Stream #\S+.*?Video:.*?[\s,](\d{2,5})x(\d{2,5})[\s,\[]", log)
    if v:
        width, height = int(v[1]), int(v[2])
    # 휴대폰 영상은 '돌려서 보여줘' 정보가 따로 있어서 가로/세로를 바꿔야 할 때가 있어요.
    rot = re.search(r"rotat(?:e|ion of)\s*:?\s*(-?\d+(?:\.\d+)?)", log)
    if rot and round(abs(float(rot[1]))) % 180 == 90:
        width, height = height, width

    has_audio = re.search(r"Stream #\S+.*?Audio:", log) is not None
    return VideoInfo(duration, width, height, has_audio)


def probe(video: Path) -> VideoInfo:
    return parse_video_info(run_ffmpeg(["-i", str(video)]))


def parse_silences(log: str, duration: float) -> list[tuple[float, float]]:
    """ffmpeg silencedetect 결과에서 (무음 시작, 무음 끝) 목록을 꺼내요."""
    silences = []
    start = None
    for line in log.splitlines():
        s = re.search(r"silence_start:\s*(-?\d+(?:\.\d+)?)", line)
        if s:
            start = max(0.0, float(s[1]))
            continue
        e = re.search(r"silence_end:\s*(\d+(?:\.\d+)?)", line)
        if e and start is not None:
            silences.append((start, min(float(e[1]), duration)))
            start = None
    if start is not None:  # 영상이 무음으로 끝나면 끝 표시가 없어요.
        silences.append((start, duration))
    return silences


def detect_silences(video: Path, duration: float, threshold_db: float, min_silence: float) -> list[tuple[float, float]]:
    log = run_ffmpeg([
        "-i", str(video), "-vn",
        "-af", f"silencedetect=noise={threshold_db}dB:d={min_silence}",
        "-f", "null", "-",
    ])
    return parse_silences(log, duration)


# ---------------------------------------------------------------------------
# 남길 구간 계산
# ---------------------------------------------------------------------------

def keep_ranges(
    duration: float,
    silences: list[tuple[float, float]],
    padding: float = 0.1,
    min_keep: float = 0.3,
) -> list[tuple[float, float]]:
    """무음이 아닌 구간을 구해요.

    padding: 말 앞뒤로 조금 여유를 남겨서 말이 뚝 끊기지 않게 해요.
    min_keep: 이보다 짧은 조각은 버려요 (잡음일 가능성이 높아요).
    """
    sounds = []
    cursor = 0.0
    for start, end in sorted(silences):
        if start > cursor:
            sounds.append((cursor, start))
        cursor = max(cursor, end)
    if cursor < duration:
        sounds.append((cursor, duration))

    padded = [(max(0.0, s - padding), min(duration, e + padding)) for s, e in sounds]
    merged: list[tuple[float, float]] = []
    for s, e in padded:
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return [(s, e) for s, e in merged if e - s >= min_keep]


# ---------------------------------------------------------------------------
# CapCut 프로젝트에 넣기
# ---------------------------------------------------------------------------

def new_id() -> str:
    return str(uuid.uuid4()).upper()


def find_material(draft: dict, material_id: str) -> tuple[list, dict] | None:
    for items in (draft.get("materials") or {}).values():
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict) and item.get("id") == material_id:
                    return items, item
    return None


def clone_extra_materials(draft: dict, refs: list[str]) -> list[str]:
    """조각마다 속도·캔버스 같은 부속 재료를 따로 갖도록 복사해요."""
    new_refs = []
    for ref in refs:
        found = find_material(draft, ref)
        if not found:
            new_refs.append(ref)
            continue
        items, item = found
        dup = copy.deepcopy(item)
        dup["id"] = new_id()
        items.append(dup)
        new_refs.append(dup["id"])
    return new_refs


def remove_materials(draft: dict, ids: set[str]) -> None:
    for key, items in (draft.get("materials") or {}).items():
        if isinstance(items, list):
            draft["materials"][key] = [
                i for i in items if not (isinstance(i, dict) and i.get("id") in ids)
            ]


def fit_track_to(track: dict, total_us: int) -> None:
    """전체 길이를 넘어가는 조각은 자르거나 빼요 (예: 틀에 있던 자막)."""
    kept = []
    for seg in track.get("segments") or []:
        tr = seg.get("target_timerange") or {}
        start, dur = tr.get("start", 0), tr.get("duration", 0)
        if start >= total_us:
            continue
        if start + dur > total_us:
            new_dur = total_us - start
            tr["duration"] = new_dur
            src = seg.get("source_timerange")
            if isinstance(src, dict) and src.get("duration"):
                src["duration"] = new_dur
        kept.append(seg)
    track["segments"] = kept


def apply_cuts(draft: dict, video: Path, info: VideoInfo, ranges: list[tuple[float, float]]) -> int:
    """틀의 영상 줄을 비우고, 원본 영상 조각들로 다시 채워요. 전체 길이(마이크로초)를 돌려줘요."""
    tracks = draft.get("tracks") or []
    video_track = next((t for t in tracks if t.get("type") == "video" and t.get("segments")), None)
    if video_track is None:
        raise CutError("틀 프로젝트에 영상 줄이 없어요. CapCut에서 영상 1개를 올린 틀을 써 주세요.")

    prototype = video_track["segments"][0]
    found = find_material(draft, prototype.get("material_id", ""))
    if not found:
        raise CutError("틀의 영상 조각이 가리키는 영상 재료를 찾을 수 없어요.")
    _, old_video = found

    # 1) 영상 재료를 새 원본 영상으로 바꿔요.
    video_mat = copy.deepcopy(old_video)
    video_mat["id"] = new_id()
    video_mat["path"] = video.resolve().as_posix()
    video_mat["material_name"] = video.name
    video_mat["duration"] = int(round(info.duration * US))
    if info.width and info.height:
        video_mat["width"], video_mat["height"] = info.width, info.height
    draft["materials"].setdefault("videos", []).append(video_mat)

    # 2) 예전 영상 조각들과 그 부속 재료를 지워요.
    old_ids = {old_video["id"]}
    for seg in video_track["segments"]:
        old_ids.update(seg.get("extra_material_refs") or [])
    # 장면 전환(transition)은 틀에서 복사하지 않아요. 6주차 도구가 규칙대로 따로 넣어요.
    transition_ids = {t.get("id") for t in (draft.get("materials") or {}).get("transitions") or []}
    old_refs = [r for r in prototype.get("extra_material_refs") or [] if r not in transition_ids]

    # 3) 조각을 순서대로 붙여요.
    segments = []
    cursor = 0
    for start, end in ranges:
        src_start = int(round(start * US))
        dur = int(round(end * US)) - src_start
        seg = copy.deepcopy(prototype)
        seg["id"] = new_id()
        seg["material_id"] = video_mat["id"]
        seg["source_timerange"] = {"start": src_start, "duration": dur}
        seg["target_timerange"] = {"start": cursor, "duration": dur}
        seg["speed"] = 1.0
        seg["extra_material_refs"] = clone_extra_materials(draft, old_refs)
        segments.append(seg)
        cursor += dur

    video_track["segments"] = segments
    # 다른 줄에서 아직 쓰는 재료는 지우지 않아요.
    for track in tracks:
        if track is video_track:
            continue
        for seg in track.get("segments") or []:
            old_ids.discard(seg.get("material_id"))
            old_ids.difference_update(seg.get("extra_material_refs") or [])
    remove_materials(draft, old_ids)

    # 4) 틀의 효과음(오디오 줄)은 6주차가 본보기로만 쓰는 거라 빼요.
    audio_ids = set()
    for track in tracks:
        if track.get("type") == "audio":
            for seg in track.get("segments") or []:
                audio_ids.add(seg.get("material_id"))
                audio_ids.update(seg.get("extra_material_refs") or [])
    tracks[:] = [t for t in tracks if t.get("type") != "audio"]
    still_used = {r for t in tracks for seg in t.get("segments") or []
                  for r in [seg.get("material_id"), *(seg.get("extra_material_refs") or [])]}
    remove_materials(draft, audio_ids - still_used)

    # 5) 다른 줄(자막 등)이 영상보다 길면 맞춰 줘요.
    for track in tracks:
        if track is not video_track:
            fit_track_to(track, cursor)
    draft["duration"] = cursor
    return cursor


def build_project(template: Path, name: str, video: Path, ranges: list[tuple[float, float]], info: VideoInfo) -> Path:
    target = cd.clone_draft(template, name, [])
    try:
        path = cd.content_path(target)
        draft = cd.load_json(path)
        apply_cuts(draft, video, info, ranges)
        cd.save_draft(target, path, draft)
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    return target


# ---------------------------------------------------------------------------
# 화면 출력
# ---------------------------------------------------------------------------

def fmt(sec: float) -> str:
    return f"{sec:6.2f}초"


def print_plan(info: VideoInfo, silences, ranges) -> float:
    total = sum(e - s for s, e in ranges)
    print(f"\n🎬 원본: {fmt(info.duration)}  ({info.width}x{info.height}, 소리 {'있음' if info.has_audio else '없음'})")
    print(f"🔇 무음 구간 {len(silences)}개")
    for s, e in silences:
        print(f"     {fmt(s)} ~ {fmt(e)}  ({e - s:.2f}초 삭제)")
    print(f"✂️  남길 조각 {len(ranges)}개")
    for i, (s, e) in enumerate(ranges, 1):
        print(f"   {i:>2}. {fmt(s)} ~ {fmt(e)}  ({e - s:.2f}초)")
    print(f"\n⏱️  결과 길이: {total:.2f}초  (원본보다 {info.duration - total:.2f}초 짧아짐)")
    if total < SHORTS_MIN:
        print(f"   ⚠️ {SHORTS_MIN:.0f}초보다 짧아요. --threshold 를 더 낮추거나(예: -45) --min-silence 를 늘려 보세요.")
    elif total > SHORTS_MAX:
        print(f"   ℹ️ {SHORTS_MAX:.0f}초보다 길어요. 좋은 장면만 고르는 건 다음 주차에서 할 거예요.")
    else:
        print(f"   ✅ 쇼츠 길이({SHORTS_MIN:.0f}~{SHORTS_MAX:.0f}초) 안에 들어와요.")
    return total


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(description="무음 자동 컷 → CapCut 프로젝트 (2주차)")
    parser.add_argument("video", help="원본 영상 파일 경로")
    parser.add_argument("--template", default="틀_쇼핑쇼츠", help="틀 프로젝트 이름 (기본: 틀_쇼핑쇼츠)")
    parser.add_argument("--name", help="새 프로젝트 이름 (기본: 영상파일이름_무음컷)")
    parser.add_argument("--projects-dir", help="CapCut 프로젝트 폴더 (기본: 자동으로 찾기)")
    parser.add_argument("--threshold", type=float, default=-35.0, help="이 소리 크기(dB)보다 작으면 무음 (기본 -35)")
    parser.add_argument("--min-silence", type=float, default=0.4, help="이 시간(초) 넘게 조용해야 무음으로 봐요 (기본 0.4)")
    parser.add_argument("--padding", type=float, default=0.1, help="소리 앞뒤로 남길 여유(초) (기본 0.1)")
    parser.add_argument("--min-keep", type=float, default=0.3, help="이보다 짧은 조각은 버려요 (기본 0.3)")
    parser.add_argument("--dry-run", action="store_true", help="프로젝트는 만들지 않고 자를 계획만 보여줘요")
    args = parser.parse_args(argv)

    try:
        video = Path(args.video.strip('"')).expanduser()
        if not video.is_file():
            raise CutError(f"'{video}' 영상 파일을 찾을 수 없어요.")
        info = probe(video)

        if info.has_audio:
            silences = detect_silences(video, info.duration, args.threshold, args.min_silence)
        else:
            print("ℹ️ 이 영상에는 소리가 없어서 무음 컷을 하지 않고 전체를 넣어요.")
            silences = []
        ranges = keep_ranges(info.duration, silences, args.padding, args.min_keep)
        if not ranges:
            raise CutError("남길 부분이 없어요. 전부 무음으로 판단됐어요. --threshold 를 낮춰 보세요 (예: -50).")
        print_plan(info, silences, ranges)

        if args.dry_run:
            print("\n(--dry-run 이라서 프로젝트는 만들지 않았어요.)")
            return 0

        template = cd.resolve_draft(args.template, args.projects_dir and Path(args.projects_dir))
        name = args.name or f"{video.stem}_무음컷"
        target = build_project(template, name, video, ranges, info)
        print(f"\n✅ CapCut 프로젝트를 만들었어요: {target}")
        print("   CapCut을 완전히 껐다가 다시 켜면 목록에 보여요.")
        print("   ⚠️ 원본 영상 파일을 옮기거나 지우면 CapCut에서 영상이 안 보여요.")
    except cd.DraftError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
