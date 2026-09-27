#!/usr/bin/env python3
"""1주차: CapCut 프로젝트(초안) 파일을 우리 프로그램이 읽고 고칠 수 있는지 확인하는 도구.

파이썬 기본 기능만 사용해요. 따로 설치할 것이 없어요.

명령어 4가지:
  find     내 컴퓨터에서 CapCut 프로젝트 폴더를 찾아요.
  inspect  프로젝트 하나를 열어서 안에 무엇이 들어 있는지 보여줘요.
  clone    틀(템플릿) 프로젝트를 복사하고 자막 글자를 바꿔서 새 프로젝트로 저장해요.
  edit     프로젝트를 복사하지 않고 그 자리에서 자막 글자만 바꿔요 (백업을 먼저 만들어요).
  repair   한 번 열린 뒤 다시 안 열리는 프로젝트의 id를 고쳐요.
  diagnose 프로젝트 폴더 안 파일과 id를 자세히 보여줘요.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import sys
import time
import uuid
from pathlib import Path

# CapCut 버전에 따라 타임라인이 적힌 파일 이름이 달라요.
CONTENT_FILES = ("draft_content.json", "draft_info.json")
META_FILE = "draft_meta_info.json"
# 복사할 때 가져오면 안 되는 파일: 잠금 파일, 백업 파일
COPY_SKIP = ("*.lock", ".locked", "*.backup-*", "*.tmp")
MICROSECONDS = 1_000_000


class DraftError(Exception):
    """사용자에게 그대로 보여줄 수 있는 오류."""


# ---------------------------------------------------------------------------
# 폴더 찾기
# ---------------------------------------------------------------------------

def default_projects_dirs() -> list[Path]:
    """운영체제별로 CapCut이 프로젝트를 저장하는 기본 위치 후보."""
    home = Path.home()
    system = platform.system()
    if system == "Windows":
        local = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
        return [local / "CapCut" / "User Data" / "Projects" / "com.lveditor.draft"]
    if system == "Darwin":
        return [
            home / "Movies" / "CapCut" / "User Data" / "Projects" / "com.lveditor.draft",
            home / "Library" / "Containers" / "com.lemon.lvoverseas" / "Data" / "Movies"
            / "CapCut" / "User Data" / "Projects" / "com.lveditor.draft",
        ]
    return []


def list_drafts(projects_dir: Path) -> list[Path]:
    """프로젝트 폴더 안에서 CapCut 초안 폴더만 골라요."""
    if not projects_dir.is_dir():
        return []
    drafts = [
        p for p in projects_dir.iterdir()
        if p.is_dir() and any((p / name).exists() for name in CONTENT_FILES)
    ]
    return sorted(drafts, key=lambda p: p.stat().st_mtime, reverse=True)


# ---------------------------------------------------------------------------
# 초안 파일 읽기 / 쓰기
# ---------------------------------------------------------------------------

def content_path(draft_dir: Path) -> Path:
    for name in CONTENT_FILES:
        path = draft_dir / name
        if path.exists():
            return path
    raise DraftError(
        f"'{draft_dir}' 안에 {' 또는 '.join(CONTENT_FILES)} 파일이 없어요. "
        "CapCut 프로젝트 폴더가 맞는지 확인해 주세요."
    )


def load_json(path: Path) -> dict:
    raw = path.read_bytes()
    try:
        data = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise DraftError(
            f"'{path.name}' 파일을 JSON으로 읽을 수 없어요. "
            "이 CapCut 버전은 프로젝트 파일을 암호화하는 것 같아요.\n"
            "  → README의 '암호화되어 있을 때' 부분을 따라 CapCut 버전을 바꿔 보세요."
        ) from None
    if not isinstance(data, dict):
        raise DraftError(f"'{path.name}' 파일의 모양이 예상과 달라요.")
    return data


def save_json(path: Path, data: dict) -> None:
    # CapCut이 쓰는 방식처럼 한 줄로, 한글은 그대로 저장해요.
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------------------
# 자막(텍스트) 다루기
# ---------------------------------------------------------------------------

def read_text(material: dict) -> str:
    """텍스트 재료에서 사람이 읽는 글자만 꺼내요.

    새 버전: content = '{"text": "안녕", "styles": [...]}' (JSON 문자열)
    옛 버전: content = '<font ...>[안녕]</font>'
    """
    content = material.get("content", "")
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict) and "text" in parsed:
            return parsed["text"]
    except (json.JSONDecodeError, TypeError):
        pass
    if isinstance(content, str) and "[" in content and "]" in content:
        return content[content.index("[") + 1: content.rindex("]")]
    return str(content)


def write_text(material: dict, new_text: str) -> None:
    """글자만 바꾸고 폰트·색·크기 같은 스타일은 그대로 둬요."""
    content = material.get("content", "")
    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        parsed = None

    if isinstance(parsed, dict) and "text" in parsed:
        parsed["text"] = new_text
        # 스타일이 적용되는 글자 범위를 새 글자 길이에 맞춰요.
        # (여러 스타일이 섞여 있으면 첫 번째 스타일을 전체에 적용해요.)
        styles = parsed.get("styles") or []
        if styles:
            first = styles[0]
            first["range"] = [0, len(new_text)]
            parsed["styles"] = [first]
        material["content"] = json.dumps(parsed, ensure_ascii=False)
    elif isinstance(content, str) and "[" in content and "]" in content:
        start, end = content.index("["), content.rindex("]")
        material["content"] = content[: start + 1] + new_text + content[end:]
    else:
        material["content"] = new_text

    # 일부 버전은 글자를 다른 칸에도 한 번 더 적어 둬요.
    for key in ("recognize_text", "base_content"):
        if material.get(key):
            material[key] = new_text
    if isinstance(material.get("words"), dict):
        material["words"] = {"end_time": [], "start_time": [], "text": []}


def text_materials(draft: dict) -> list[dict]:
    return (draft.get("materials") or {}).get("texts") or []


# ---------------------------------------------------------------------------
# 요약 보기
# ---------------------------------------------------------------------------

def seconds(us: int | float | None) -> str:
    return f"{(us or 0) / MICROSECONDS:.2f}초"


def summarize(draft_dir: Path) -> dict:
    path = content_path(draft_dir)
    draft = load_json(path)
    materials = draft.get("materials") or {}
    canvas = draft.get("canvas_config") or {}

    tracks = []
    for track in draft.get("tracks") or []:
        segments = track.get("segments") or []
        tracks.append({
            "type": track.get("type", "?"),
            "segments": [
                {
                    "start": (seg.get("target_timerange") or {}).get("start", 0),
                    "duration": (seg.get("target_timerange") or {}).get("duration", 0),
                    "material_id": seg.get("material_id"),
                }
                for seg in segments
            ],
        })

    return {
        "file": path.name,
        "version": draft.get("version") or draft.get("new_version"),
        "app_version": (draft.get("last_modified_platform") or {}).get("app_version"),
        "duration": draft.get("duration", 0),
        "canvas": f"{canvas.get('width', '?')}x{canvas.get('height', '?')}",
        "material_counts": {
            key: len(value) for key, value in materials.items()
            if isinstance(value, list) and value
        },
        "texts": [read_text(m) for m in text_materials(draft)],
        "tracks": tracks,
    }


def print_summary(draft_dir: Path, info: dict) -> None:
    print(f"\n📂 프로젝트: {draft_dir.name}")
    print(f"   파일: {info['file']}  (포맷 버전 {info['version']}, CapCut {info['app_version'] or '알 수 없음'})")
    print(f"   전체 길이: {seconds(info['duration'])}   화면 크기: {info['canvas']}")

    print("\n🧺 재료(materials)")
    for key, count in sorted(info["material_counts"].items()):
        print(f"   - {key}: {count}개")

    print("\n🎞️  타임라인 줄(tracks)")
    if not info["tracks"]:
        print("   (비어 있어요)")
    for i, track in enumerate(info["tracks"], 1):
        print(f"   {i}. {track['type']} 줄 — 조각 {len(track['segments'])}개")
        for seg in track["segments"]:
            print(f"        · {seconds(seg['start'])}부터 {seconds(seg['duration'])} 동안")

    print("\n💬 자막 글자")
    if not info["texts"]:
        print("   (자막이 없어요. 틀 프로젝트에 자막을 1개 이상 넣어 주세요.)")
    for i, text in enumerate(info["texts"], 1):
        print(f"   {i}. {text!r}")
    print("\n✅ 읽기 성공! 이 CapCut 버전은 우리 프로그램이 다룰 수 있어요.\n")


# ---------------------------------------------------------------------------
# 복사 / 수정
# ---------------------------------------------------------------------------

def replace_texts(draft: dict, new_texts: list[str]) -> int:
    """자막을 순서대로 바꿔요. 바꾼 개수를 돌려줘요."""
    materials = text_materials(draft)
    if not materials:
        raise DraftError("이 프로젝트에는 자막이 없어요. CapCut에서 자막을 1개 이상 넣고 저장한 뒤 다시 해 보세요.")
    if len(new_texts) > len(materials):
        raise DraftError(
            f"자막을 {len(new_texts)}개 넣으려고 했지만 프로젝트에는 자막 자리가 {len(materials)}개뿐이에요."
        )
    for material, text in zip(materials, new_texts):
        write_text(material, text)
    return len(new_texts)


def update_meta(draft_dir: Path, name: str, draft_id: str) -> None:
    meta_path = draft_dir / META_FILE
    if not meta_path.exists():
        return
    meta = load_json(meta_path)
    now_us = int(time.time() * MICROSECONDS)
    meta["draft_name"] = name
    meta["draft_id"] = draft_id
    meta["draft_fold_path"] = str(draft_dir).replace("\\", "/")
    if "draft_root_path" in meta:
        meta["draft_root_path"] = str(draft_dir.parent).replace("\\", "/")
    meta["tm_draft_create"] = now_us
    meta["tm_draft_modified"] = now_us
    save_json(meta_path, meta)


def main_timeline_id(draft_dir: Path) -> str | None:
    """새 CapCut 버전은 Timelines/project.json 에 '진짜' 타임라인 id를 적어 둬요."""
    project = draft_dir / "Timelines" / "project.json"
    if not project.exists():
        return None
    return load_json(project).get("main_timeline_id") or None


def save_draft(draft_dir: Path, path: Path, draft: dict) -> None:
    """맨 위 파일과 Timelines/<id>/ 안의 복사본을 똑같이 저장해요.

    새 CapCut 버전은 두 곳에 같은 내용을 두고, 둘이 다르면 프로젝트가 안 열릴 수 있어요.
    """
    save_json(path, draft)
    copy = draft_dir / "Timelines" / str(draft.get("id", "")) / path.name
    if draft.get("id") and copy.exists():
        save_json(copy, draft)


def clone_draft(template_dir: Path, new_name: str, new_texts: list[str]) -> Path:
    content_path(template_dir)  # 틀이 맞는지 먼저 확인
    target = template_dir.parent / new_name
    if target.exists():
        raise DraftError(f"'{target}' 폴더가 이미 있어요. 다른 이름을 써 주세요.")

    shutil.copytree(template_dir, target, ignore=shutil.ignore_patterns(*COPY_SKIP))
    try:
        path = content_path(target)
        draft = load_json(path)
        # 타임라인 id(draft["id"])는 Timelines 폴더와 짝이 맞아야 해서 그대로 둬요.
        # 프로젝트 자체의 id(메타 파일의 draft_id)만 새로 만들어요.
        if new_texts:
            replace_texts(draft, new_texts)
        save_draft(target, path, draft)
        update_meta(target, new_name, str(uuid.uuid4()).upper())
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise
    return target


def edit_in_place(draft_dir: Path, new_texts: list[str]) -> Path:
    path = content_path(draft_dir)
    draft = load_json(path)
    backup = path.with_name(f"{path.name}.backup-{time.strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(path, backup)
    replace_texts(draft, new_texts)
    save_draft(draft_dir, path, draft)
    return backup


def repair_draft(draft_dir: Path) -> list[str]:
    """예전 clone 이 바꿔 버린 타임라인 id를 Timelines 폴더와 다시 맞춰요."""
    fixes = []
    path = content_path(draft_dir)
    draft = load_json(path)
    timeline_id = main_timeline_id(draft_dir)
    old_id = draft.get("id")

    if timeline_id and old_id != timeline_id:
        backup = path.with_name(f"{path.name}.backup-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(path, backup)
        fixes.append(f"타임라인 id {old_id} → {timeline_id} (Timelines 폴더와 맞춤)")
        draft["id"] = timeline_id
        save_draft(draft_dir, path, draft)

    meta_path = draft_dir / META_FILE
    if meta_path.exists():
        meta = load_json(meta_path)
        if meta.get("draft_id") in (None, "", timeline_id, old_id):
            meta["draft_id"] = str(uuid.uuid4()).upper()
            save_json(meta_path, meta)
            fixes.append("프로젝트 id(draft_id)를 타임라인 id와 다른 새 번호로 바꿈")

    lock = draft_dir / ".locked"
    if lock.exists():
        lock.unlink()
        fixes.append("남아 있던 잠금 파일(.locked) 삭제")
    return fixes


# ---------------------------------------------------------------------------
# 진단 (프로젝트가 안 열릴 때)
# ---------------------------------------------------------------------------

DIAG_KEY_HINTS = ("id", "name", "path", "version")


def diagnose(draft_dir: Path, max_depth: int = 3) -> list[dict]:
    """폴더 안 파일마다 크기, 읽기 가능 여부, 이름/id/경로 값을 모아요."""
    rows = []
    for path in sorted(draft_dir.rglob("*")):
        rel = path.relative_to(draft_dir)
        if len(rel.parts) > max_depth:
            continue
        row = {"path": rel.as_posix() + ("/" if path.is_dir() else ""), "size": None, "status": "", "keys": {}}
        if path.is_file():
            row["size"] = path.stat().st_size
            if path.suffix == ".json":
                try:
                    data = load_json(path)
                    row["status"] = "OK"
                    row["keys"] = {
                        k: v for k, v in data.items()
                        if isinstance(v, (str, int)) and not isinstance(v, bool)
                        and any(h in k.lower() for h in DIAG_KEY_HINTS)
                    }
                except DraftError:
                    row["status"] = "읽을 수 없음(암호화?)"
                except OSError as e:
                    row["status"] = f"열기 실패: {e}"
        rows.append(row)
    return rows


def print_diagnosis(draft_dir: Path, rows: list[dict]) -> None:
    print(f"\n🩺 진단: {draft_dir}")
    for row in rows:
        size = "" if row["size"] is None else f"{row['size']:,} bytes"
        print(f"   {row['path']:<55} {size:>16}  {row['status']}")
        for key, value in row["keys"].items():
            print(f"        {key} = {value}")
    print()


# ---------------------------------------------------------------------------
# 명령어
# ---------------------------------------------------------------------------

def resolve_draft(arg: str, projects_dir: Path | None) -> Path:
    """폴더 경로 또는 프로젝트 이름 둘 다 받아요."""
    path = Path(arg).expanduser()
    if path.is_dir():
        return path
    for base in ([projects_dir] if projects_dir else default_projects_dirs()):
        if base and (base / arg).is_dir():
            return base / arg
    raise DraftError(f"'{arg}' 프로젝트를 찾을 수 없어요. 먼저 'find' 명령으로 이름을 확인해 보세요.")


def cmd_find(args: argparse.Namespace) -> None:
    dirs = [Path(args.projects_dir)] if args.projects_dir else default_projects_dirs()
    if not dirs:
        raise DraftError("이 운영체제에서는 CapCut 기본 폴더를 몰라요. --projects-dir 로 직접 알려 주세요.")
    found_any = False
    for base in dirs:
        drafts = list_drafts(base)
        if not drafts:
            continue
        found_any = True
        print(f"\n📁 {base}")
        for d in drafts:
            modified = time.strftime("%Y-%m-%d %H:%M", time.localtime(d.stat().st_mtime))
            print(f"   - {d.name}   (마지막 수정 {modified})")
    if not found_any:
        print("CapCut 프로젝트를 찾지 못했어요. 찾아본 곳:")
        for base in dirs:
            print(f"   - {base}")
        print("CapCut 설정 → 프로젝트 저장 위치를 확인한 뒤 --projects-dir 로 알려 주세요.")


def cmd_inspect(args: argparse.Namespace) -> None:
    draft_dir = resolve_draft(args.draft, args.projects_dir and Path(args.projects_dir))
    info = summarize(draft_dir)
    if args.json:
        print(json.dumps(info, ensure_ascii=False, indent=2))
    else:
        print_summary(draft_dir, info)


def cmd_clone(args: argparse.Namespace) -> None:
    template = resolve_draft(args.template, args.projects_dir and Path(args.projects_dir))
    new_dir = clone_draft(template, args.name, args.text or [])
    print(f"✅ 새 프로젝트를 만들었어요: {new_dir}")
    print("   CapCut을 완전히 껐다가 다시 켜면 프로젝트 목록에 보여요.")


def cmd_edit(args: argparse.Namespace) -> None:
    draft_dir = resolve_draft(args.draft, args.projects_dir and Path(args.projects_dir))
    backup = edit_in_place(draft_dir, args.text)
    print(f"✅ 자막을 바꿨어요: {draft_dir}")
    print(f"   원래 파일은 여기에 백업했어요: {backup}")
    print("   CapCut을 완전히 껐다가 다시 켠 뒤 프로젝트를 열어 보세요.")


def cmd_repair(args: argparse.Namespace) -> None:
    draft_dir = resolve_draft(args.draft, args.projects_dir and Path(args.projects_dir))
    fixes = repair_draft(draft_dir)
    if not fixes:
        print(f"✅ '{draft_dir.name}'에서 고칠 곳을 찾지 못했어요.")
        return
    print(f"🔧 '{draft_dir.name}'을(를) 고쳤어요:")
    for fix in fixes:
        print(f"   - {fix}")
    print("   CapCut을 켜서 열기 → 나가기 → 다시 열기를 해 보세요.")


def cmd_diagnose(args: argparse.Namespace) -> None:
    projects_dir = args.projects_dir and Path(args.projects_dir)
    for name in args.drafts:
        draft_dir = resolve_draft(name, projects_dir)
        print_diagnosis(draft_dir, diagnose(draft_dir))
    print("위 내용을 전부 복사해서 알려 주세요. 어느 파일이 문제인지 찾을게요.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="CapCut 프로젝트 파일 읽기/복사/수정 도구 (1주차)")
    parser.add_argument("--projects-dir", help="CapCut 프로젝트들이 모여 있는 폴더 (기본: 자동으로 찾기)")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("find", help="CapCut 프로젝트 목록 보기")
    p.set_defaults(func=cmd_find)

    p = sub.add_parser("inspect", help="프로젝트 안을 들여다보기")
    p.add_argument("draft", help="프로젝트 이름 또는 폴더 경로")
    p.add_argument("--json", action="store_true", help="결과를 JSON으로 출력")
    p.set_defaults(func=cmd_inspect)

    p = sub.add_parser("clone", help="틀 프로젝트를 복사해서 새 프로젝트 만들기")
    p.add_argument("template", help="틀로 쓸 프로젝트 이름 또는 폴더 경로")
    p.add_argument("--name", required=True, help="새 프로젝트 이름")
    p.add_argument("--text", action="append", help="바꿀 자막 글자 (여러 번 쓰면 자막을 순서대로 바꿔요)")
    p.set_defaults(func=cmd_clone)

    p = sub.add_parser("edit", help="프로젝트 자막을 그 자리에서 바꾸기 (백업 생성)")
    p.add_argument("draft", help="프로젝트 이름 또는 폴더 경로")
    p.add_argument("--text", action="append", required=True, help="바꿀 자막 글자")
    p.set_defaults(func=cmd_edit)

    p = sub.add_parser("repair", help="한 번 열린 뒤 다시 안 열리는 프로젝트 고치기 (CapCut을 끄고 실행)")
    p.add_argument("draft", help="프로젝트 이름 또는 폴더 경로")
    p.set_defaults(func=cmd_repair)

    p = sub.add_parser("diagnose", help="프로젝트가 안 열릴 때 폴더 안을 자세히 보기")
    p.add_argument("drafts", nargs="+", help="프로젝트 이름들 (여러 개 쓰면 비교하기 좋아요)")
    p.set_defaults(func=cmd_diagnose)
    return parser


def main(argv: list[str] | None = None) -> int:
    # Windows 콘솔에서도 한글과 이모지가 깨지지 않게 해요.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    args = build_parser().parse_args(argv)
    try:
        args.func(args)
    except DraftError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
