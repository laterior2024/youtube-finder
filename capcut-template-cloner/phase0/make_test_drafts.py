"""0단계 캡컷 검증: 테스트용 캡컷 초안 5개를 만든다.

사용법 (자세한 설명은 README.md)
    python make_test_drafts.py                 # 캡컷 초안 폴더 자동 찾기
    python make_test_drafts.py --drafts "경로"  # 직접 지정
    python make_test_drafts.py --only T1,T2

만들어지는 초안
    틀복사_T1_기본열기   코드로 만든 초안이 열리기만 하는지
    틀복사_T2_틀재현     spec/example-template.json 틀을 그대로 재현 (색·위치·테두리)
    틀복사_T3_보정       격자 위에 이미지/글자를 올려 좌표·글자 크기·테두리 환산값 측정
    틀복사_T4_폴더이동   소재 경로를 '초안 폴더 기준'으로 적음 → 웹에서 zip으로 배포 가능한지
    틀복사_T5_폰트       내 PC에 있는 한글 폰트 파일을 직접 지정할 수 있는지
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
from importlib import metadata
from typing import Callable, Dict, List, Optional, Tuple

import pycapcut as cc

import assets
from spec_to_capcut import (ALIGN, CALIBRATION, Rect, hex_to_rgb01, image_scale_for_rect,
                            rect_center_transform, stroke_ui_width, text_size_units)

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SPEC = os.path.join(HERE, "..", "spec", "example-template.json")
DURATION_S = 9
PREFIX = "틀복사_"
ASSET_SUBDIR = "tbc_assets"
# 캡컷이 '초안 폴더 안의 소재'를 가리킬 때 쓰는 것으로 알려진 자리표시 문자열 (T4에서 검증)
DRAFT_PATH_PLACEHOLDER = "##_draftpath_placeholder_0E685133-18CE-45ED-8CB8-2904A212EC80_##"
FULL = Rect(0, 0, 1, 1)


def default_drafts_dirs() -> List[str]:
    home = os.path.expanduser("~")
    local = os.environ.get("LOCALAPPDATA", os.path.join(home, "AppData", "Local"))
    return [
        os.path.join(local, "CapCut", "User Data", "Projects", "com.lveditor.draft"),
        os.path.join(home, "Movies", "CapCut", "User Data", "Projects", "com.lveditor.draft"),
    ]


class DraftBuilder:
    """pycapcut ScriptFile을 감싸서 'rect 기반'으로 이미지/글자를 올린다."""

    def __init__(self, folder: cc.DraftFolder, name: str, canvas: Tuple[int, int]):
        self.name = name
        self.canvas = canvas
        self.dir = os.path.join(folder.folder_path, name)
        self.script = folder.create_draft(name, canvas[0], canvas[1], allow_replace=True)
        self.asset_dir = os.path.join(self.dir, ASSET_SUBDIR)
        os.makedirs(self.asset_dir, exist_ok=True)
        self._video_tracks = 0
        self._text_tracks = 0
        self.preview_images: List[Tuple[str, Rect]] = []
        self.preview_texts: List[dict] = []
        self.font_overrides: Dict[str, str] = {}  # 글자 내용 → 폰트 파일 경로

    def asset(self, filename: str) -> str:
        return os.path.join(self.asset_dir, filename)

    def add_image(self, png: str, rect: Rect = FULL, *, alpha: float = 1.0) -> None:
        """PNG를 rect 위치에 올린다. 한 이미지 = 한 트랙 (시간이 겹치므로)."""
        material = cc.VideoMaterial(png)
        w, h = self.canvas
        tx, ty = rect_center_transform(rect)
        scale = image_scale_for_rect(rect, w, h, material.width, material.height)
        track = f"img{self._video_tracks}"
        self.script.add_track(cc.TrackType.video, track, relative_index=self._video_tracks)
        self._video_tracks += 1
        self.script.add_segment(cc.VideoSegment(
            material, _trange(0, DURATION_S),
            clip_settings=cc.ClipSettings(transform_x=tx, transform_y=ty, scale_x=scale, scale_y=scale, alpha=alpha),
        ), track)
        self.preview_images.append((png, rect))

    def add_text_track(self) -> str:
        track = f"text{self._text_tracks}"
        self.script.add_track(cc.TrackType.text, track, relative_index=self._text_tracks)
        self._text_tracks += 1
        return track

    def add_text(self, track: Optional[str], text: str, rect: Rect, *, start: float = 0, duration: float = DURATION_S,
                 size_px: Optional[float] = None, size_units: Optional[float] = None,
                 color: str = "#FFFFFF", bold: bool = False, align: str = "center",
                 stroke_color: Optional[str] = None, stroke_px: Optional[float] = None,
                 stroke_units: Optional[float] = None, preview: bool = True) -> None:
        """track=None이면 새 텍스트 트랙을 만든다 (같은 시간에 겹치는 글자는 트랙이 달라야 함)."""
        track = track or self.add_text_track()
        w, _ = self.canvas
        size = size_units if size_units is not None else text_size_units(size_px or 40, w)
        tx, ty = rect_center_transform(rect)
        border = None
        if stroke_color and (stroke_px or stroke_units):
            width = stroke_units if stroke_units is not None else stroke_ui_width(stroke_px or 0)
            border = cc.TextBorder(color=hex_to_rgb01(stroke_color), width=width)
        self.script.add_segment(cc.TextSegment(
            text, _trange(start, duration),
            style=cc.TextStyle(size=size, bold=bold, color=hex_to_rgb01(color), align=ALIGN[align]),
            clip_settings=cc.ClipSettings(transform_x=tx, transform_y=ty),
            border=border,
        ), track)
        if preview and start == 0:
            self.preview_texts.append(dict(text=text, rect=rect, size_px=size_px or 40, color=color,
                                           align=align, stroke_color=stroke_color, stroke_px=stroke_px or 0))

    def save(self, *, placeholder_paths: bool = False) -> None:
        self.script.save()
        content_path = os.path.join(self.dir, "draft_content.json")
        with open(content_path, encoding="utf-8") as f:
            content = json.load(f)

        if placeholder_paths:
            for mat in content["materials"].get("videos", []):
                mat["path"] = _to_placeholder_path(mat["path"], self.dir)

        for mat in content["materials"].get("texts", []):
            inner = json.loads(mat["content"])
            font_path = self.font_overrides.get(inner.get("text", ""))
            if font_path:
                for style in inner["styles"]:
                    style["font"] = {"id": "", "path": font_path.replace("\\", "/")}
                mat["content"] = json.dumps(inner, ensure_ascii=False)

        data = json.dumps(content, ensure_ascii=False, indent=4)
        # 캡컷 버전/OS에 따라 draft_content.json 또는 draft_info.json을 읽으므로 둘 다 쓴다.
        for filename in ("draft_content.json", "draft_info.json"):
            with open(os.path.join(self.dir, filename), "w", encoding="utf-8") as f:
                f.write(data)
        self._write_meta(content)

    def _write_meta(self, content: dict) -> None:
        meta_path = os.path.join(self.dir, "draft_meta_info.json")
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
        now_us = int(time.time() * 1_000_000)
        meta.update({
            "draft_id": str(uuid.uuid4()).upper(),  # 템플릿 id를 그대로 쓰면 초안끼리 충돌할 수 있음
            "draft_name": self.name,
            "draft_fold_path": self.dir.replace("\\", "/"),
            "draft_root_path": os.path.dirname(self.dir).replace("\\", "/"),
            "tm_draft_create": now_us,
            "tm_draft_modified": now_us,
            "tm_duration": content.get("duration", 0),
        })
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=4)

    def write_expected(self, out_dir: str) -> str:
        return assets.expected_preview(self.canvas, self.preview_images, self.preview_texts,
                                       os.path.join(out_dir, f"{self.name}_예상결과.png"))


def _trange(start_s: float, duration_s: float) -> cc.Timerange:
    return cc.trange(round(start_s * cc.SEC), round(duration_s * cc.SEC))


def _to_placeholder_path(path: str, draft_dir: str) -> str:
    norm_path = os.path.normpath(path)
    norm_dir = os.path.normpath(draft_dir)
    if not norm_path.startswith(norm_dir):
        return path
    rel = os.path.relpath(norm_path, norm_dir).replace("\\", "/")
    return f"{DRAFT_PATH_PLACEHOLDER}/{rel}"


# ── 테스트 초안들 ─────────────────────────────────────────────

def build_t1(folder: cc.DraftFolder, out_dir: str) -> DraftBuilder:
    b = DraftBuilder(folder, PREFIX + "T1_기본열기", (1080, 1920))
    b.add_image(assets.solid_png((1080, 1920), "#2B2D42", b.asset("bg.png")))
    track = b.add_text_track()
    b.add_text(track, "틀복사 T1\n이 글자가 보이면 성공", Rect(0.1, 0.42, 0.8, 0.16), size_px=72, bold=True)
    b.save()
    b.write_expected(out_dir)
    return b


def build_t2(folder: cc.DraftFolder, out_dir: str, spec: dict) -> DraftBuilder:
    canvas = (int(spec["canvas"]["widthPx"]), int(spec["canvas"]["heightPx"]))
    b = DraftBuilder(folder, PREFIX + "T2_틀재현", canvas)
    layers = sorted(spec["layers"], key=lambda l: l["zIndex"])
    image_layers = [l for l in layers if l["kind"] in ("box", "video-area", "logo")]
    text_layers = [l for l in layers if l["kind"] in ("text-slot", "caption")]

    for layer in image_layers:
        rect = Rect.from_dict(layer["rect"])
        kind = layer["kind"]
        if kind == "box":
            png = assets.full_canvas_box_png(canvas, layer, b.asset(f"{layer['id']}.png"))
            b.add_image(png)
        elif kind == "video-area":
            size = rect.to_px(*canvas)[2:]
            b.add_image(assets.placeholder_png(size, "VIDEO", "#3A3A3A", "#9A9A9A", b.asset("video_area.png")), rect)
        elif kind == "logo":
            size = rect.to_px(*canvas)[2:]
            png = assets.placeholder_png(size, "LOGO", "#FFFFFF", "#111111", b.asset("logo.png"))
            b.add_image(png, rect, alpha=float(layer.get("opacity", 1.0)))

    for layer in text_layers:
        style = layer["style"]
        stroke = style.get("stroke") or {}
        common = dict(size_px=style["sizePx"], color=style["color"], align=style["align"],
                      bold=style["font"]["weight"] >= 700,
                      stroke_color=stroke.get("color"), stroke_px=stroke.get("widthPx") or None)
        rect = Rect.from_dict(layer["rect"])
        track = b.add_text_track()
        if layer["kind"] == "text-slot":
            b.add_text(track, layer["sampleText"], rect, **common)
        else:
            samples = ["자막 예시 첫 번째 줄", "여기에 대사가 들어가요", "강조 단어는 노란색"]
            step = DURATION_S / len(samples)
            for i, text in enumerate(samples):
                b.add_text(track, text, rect, start=i * step, duration=step, **common)
    b.save()
    b.write_expected(out_dir)
    return b


# T3에서 쓰는 측정 항목 (결과 해석 시 이 값을 기준으로 계산)
T3_IMAGE_TESTS = [  # (라벨, rect, 원본 PNG 크기)
    ("A", Rect(0.10, 0.05, 0.20, 0.1125), (216, 216)),
    ("B", Rect(0.40, 0.21, 0.20, 0.1125), (100, 100)),
    ("C", Rect(0.70, 0.05, 0.20, 0.1125), (400, 400)),
    ("D", Rect(0.05, 0.37, 0.90, 0.05), (972, 96)),
]
T3_SIZE_TESTS = [(5, 0.48), (10, 0.55), (15, 0.635), (20, 0.735)]  # (캡컷 크기 값, 중심 y)
T3_STROKE_TESTS = [  # (라벨, 중심 x, 중심 y, 크기 값, 테두리 값)
    ("S1", 0.25, 0.84, 10, 40),
    ("S2", 0.75, 0.84, 10, 80),
    ("S3", 0.50, 0.92, 20, 40),
]


def build_t3(folder: cc.DraftFolder, out_dir: str) -> DraftBuilder:
    canvas = (1080, 1920)
    b = DraftBuilder(folder, PREFIX + "T3_보정", canvas)
    b.add_image(assets.solid_png(canvas, "#202020", b.asset("bg.png")))
    for label, rect, size in T3_IMAGE_TESTS:
        b.add_image(assets.placeholder_png(size, label, "#E53935", "#FFFFFF", b.asset(f"img_{label}.png")), rect)
    grid = assets.grid_png(
        canvas, b.asset("grid.png"),
        expected_rects=[(rect, label) for label, rect, _ in T3_IMAGE_TESTS],
        text_guides=[(cy, units, f"{units}") for units, cy in T3_SIZE_TESTS],
    )
    b.add_image(grid)

    for units, cy in T3_SIZE_TESTS:
        b.add_text(None, f"가나다ABC {units}", Rect(0.1, cy - 0.02, 0.8, 0.04), size_units=units, preview=False)
    for label, cx, cy, units, stroke in T3_STROKE_TESTS:
        b.add_text(None, f"{label} 가A", Rect(cx - 0.2, cy - 0.02, 0.4, 0.04), size_units=units,
                   color="#FFD400", stroke_color="#000000", stroke_units=stroke, preview=False)
    b.save()
    shutil.copy(grid, os.path.join(out_dir, f"{b.name}_격자.png"))
    return b


def build_t4(folder: cc.DraftFolder, out_dir: str) -> DraftBuilder:
    b = DraftBuilder(folder, PREFIX + "T4_폴더이동", (1080, 1920))
    b.add_image(assets.solid_png((1080, 1920), "#6A1B9A", b.asset("bg.png")))
    track = b.add_text_track()
    b.add_text(track, "T4\n배경이 보라색이면 성공", Rect(0.1, 0.42, 0.8, 0.16), size_px=72, bold=True)
    b.save(placeholder_paths=True)
    b.write_expected(out_dir)
    return b


def build_t5(folder: cc.DraftFolder, out_dir: str) -> Optional[DraftBuilder]:
    font_path = assets.find_korean_font()
    if not font_path:
        print("  ! T5 건너뜀: 이 PC에서 한글 폰트 파일을 찾지 못했어요.")
        return None
    b = DraftBuilder(folder, PREFIX + "T5_폰트", (1080, 1920))
    b.add_image(assets.solid_png((1080, 1920), "#1B5E20", b.asset("bg.png")))
    default_text = "위: 캡컷 기본 폰트"
    local_text = "아래: " + os.path.basename(font_path)
    b.add_text(None, default_text, Rect(0.1, 0.38, 0.8, 0.08), size_px=64, preview=False)
    b.add_text(None, local_text, Rect(0.1, 0.54, 0.8, 0.08), size_px=64, preview=False)
    b.font_overrides[local_text] = font_path
    b.save()
    return b


BUILDERS: Dict[str, Callable[..., Optional[DraftBuilder]]] = {
    "T1": build_t1, "T2": build_t2, "T3": build_t3, "T4": build_t4, "T5": build_t5,
}


def main() -> int:
    parser = argparse.ArgumentParser(description="틀복사 0단계: 캡컷 검증용 초안 만들기")
    parser.add_argument("--drafts", help="캡컷 초안 폴더 (캡컷 설정 → 초안 위치)")
    parser.add_argument("--spec", default=DEFAULT_SPEC, help="T2에 쓸 TemplateSpec JSON")
    parser.add_argument("--only", help="예: T1,T3")
    parser.add_argument("--out", default=os.path.join(HERE, "phase0_output"), help="예상결과·리포트 저장 폴더")
    args = parser.parse_args()

    drafts_dir = args.drafts or next((d for d in default_drafts_dirs() if os.path.isdir(d)), None)
    if not drafts_dir or not os.path.isdir(drafts_dir):
        print("캡컷 초안 폴더를 찾지 못했어요.\n"
              "캡컷 PC → 오른쪽 위 설정(⚙) → '초안 위치(Drafts location)' 경로를 복사해서\n"
              '  python make_test_drafts.py --drafts "복사한 경로"\n'
              "로 다시 실행해 주세요.")
        return 1

    with open(args.spec, encoding="utf-8") as f:
        spec = json.load(f)
    os.makedirs(args.out, exist_ok=True)
    selected = [t.strip().upper() for t in args.only.split(",")] if args.only else list(BUILDERS)
    folder = cc.DraftFolder(drafts_dir)

    made: List[dict] = []
    for key in selected:
        print(f"- {key} 만드는 중…")
        builder = BUILDERS[key]
        b = builder(folder, args.out, spec) if key == "T2" else builder(folder, args.out)
        if b:
            made.append({"test": key, "name": b.name, "path": b.dir})
            print(f"  ✓ {b.name}")

    report = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "os": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
        "pycapcut": _pkg_version("pycapcut"),
        "drafts_dir": drafts_dir,
        "korean_font": assets.find_korean_font(),
        "calibration_used": CALIBRATION,
        "t3": {
            "image_tests": [{"label": l, "rect": r.__dict__, "src_px": s} for l, r, s in T3_IMAGE_TESTS],
            "size_tests": [{"size_units": u, "center_y": y} for u, y in T3_SIZE_TESTS],
            "stroke_tests": [{"label": l, "size_units": u, "stroke_units": s} for l, _, _, u, s in T3_STROKE_TESTS],
        },
        "drafts": made,
    }
    with open(os.path.join(args.out, "phase0_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("\n완료! 캡컷을 완전히 껐다가 다시 켜면 초안 목록에 '틀복사_'로 시작하는 초안이 보여요.")
    print(f"예상 결과 이미지와 리포트: {os.path.abspath(args.out)}")
    print("README.md의 체크리스트대로 확인하고 RESULTS.md에 적어 주세요.")
    return 0


def _pkg_version(name: str) -> str:
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return "unknown"


if __name__ == "__main__":
    sys.exit(main())
