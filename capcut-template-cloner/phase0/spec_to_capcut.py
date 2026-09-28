"""TemplateSpec(0~1, 왼쪽 위 기준) → 캡컷 초안 값 변환.

이 파일은 pycapcut에 의존하지 않는 순수 계산만 담는다.
0단계에서 보정(calibration)이 끝나면 이 로직을 그대로 TypeScript로 옮긴다.

캡컷 좌표 규칙 (pycapcut 기준)
- transform_x: 화면 중앙이 0, 오른쪽 끝이 +1 (단위: 캔버스 너비의 절반)
- transform_y: 화면 중앙이 0, 위쪽 끝이 +1 (단위: 캔버스 높이의 절반)
- 이미지 소재는 먼저 캔버스 안에 "맞춤(contain)"으로 들어간 뒤 scale이 곱해진다고 가정한다. (T3에서 검증)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple

# ─────────────────────────────────────────────────────────────
# 보정값: 0단계 T3 결과로 채운다. calibrated=False인 값은 추정치.
# ─────────────────────────────────────────────────────────────
CALIBRATION = {
    "calibrated": False,
    # 1080px 너비 캔버스에서 캡컷 글자 크기 1단위가 몇 px 글자 높이(em)인지
    "px_per_size_unit": 5.0,
    # 캡컷 테두리 두께(UI 0~100) 1단위가 몇 px인지. 글자 크기에 비례하는지도 T3에서 확인
    "stroke_px_per_unit": 0.2,
}


@dataclass(frozen=True)
class Rect:
    x: float
    y: float
    w: float
    h: float

    @staticmethod
    def from_dict(d: dict) -> "Rect":
        return Rect(float(d["x"]), float(d["y"]), float(d["w"]), float(d["h"]))

    def to_px(self, canvas_w: int, canvas_h: int) -> Tuple[int, int, int, int]:
        """(left, top, width, height) 정수 px"""
        return (round(self.x * canvas_w), round(self.y * canvas_h),
                max(1, round(self.w * canvas_w)), max(1, round(self.h * canvas_h)))


def hex_to_rgb01(hex_color: str) -> Tuple[float, float, float]:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        raise ValueError(f"HEX 색 형식이 아님: {hex_color}")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore[return-value]


def hex_to_rgba255(hex_color: str, opacity: float = 1.0) -> Tuple[int, int, int, int]:
    r, g, b = (round(c * 255) for c in hex_to_rgb01(hex_color))
    return (r, g, b, round(max(0.0, min(1.0, opacity)) * 255))


def rect_center_transform(rect: Rect) -> Tuple[float, float]:
    """사각형 중심 → 캡컷 transform (x, y)"""
    cx = rect.x + rect.w / 2
    cy = rect.y + rect.h / 2
    return (cx * 2 - 1, 1 - cy * 2)


def image_scale_for_rect(rect: Rect, canvas_w: int, canvas_h: int, img_w: int, img_h: int) -> float:
    """이미지(img_w×img_h)를 rect 크기로 보이게 하는 캡컷 scale.

    캡컷이 이미지를 캔버스에 contain으로 먼저 맞춘다는 가정.
    이미지 비율과 rect 비율이 같다고 가정한다 (앱이 rect 크기로 PNG를 만들기 때문).
    """
    fit = min(canvas_w / img_w, canvas_h / img_h)
    return (rect.w * canvas_w) / (img_w * fit)


def text_size_units(size_px: float, canvas_w: int) -> float:
    """1080 기준 글자 px → 캡컷 글자 크기 값"""
    px_on_1080 = size_px * (1080 / canvas_w) if canvas_w != 1080 else size_px
    return round(px_on_1080 / CALIBRATION["px_per_size_unit"], 2)


def size_units_to_px(size_units: float) -> float:
    """캡컷 글자 크기 값 → 1080 기준 예상 px (T3 안내선 그리기용)"""
    return size_units * CALIBRATION["px_per_size_unit"]


def stroke_ui_width(stroke_px: float) -> float:
    """테두리 px → 캡컷 UI 테두리 값(0~100)"""
    return max(0.0, min(100.0, round(stroke_px / CALIBRATION["stroke_px_per_unit"], 1)))


ALIGN = {"left": 0, "center": 1, "right": 2}
