"""테스트용 PNG 소재와 '예상 결과' 미리보기 이미지를 만든다 (Pillow)."""

from __future__ import annotations

import os
import sys
from typing import Iterable, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

from spec_to_capcut import Rect, hex_to_rgba255, size_units_to_px

# 운영체제별 한글 폰트 후보 (예상 미리보기와 폰트 테스트에 사용)
KOREAN_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\malgunbd.ttf",
    r"C:\Windows\Fonts\malgun.ttf",
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/Library/Fonts/AppleGothic.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
]


def find_korean_font() -> Optional[str]:
    for path in KOREAN_FONT_CANDIDATES:
        if os.path.exists(path):
            return path
    return None


def load_font(size_px: int) -> ImageFont.ImageFont:
    path = find_korean_font()
    if path:
        return ImageFont.truetype(path, size_px)
    try:
        return ImageFont.load_default(size=size_px)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def save(img: Image.Image, path: str) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return path


# ── 틀 요소 ──────────────────────────────────────────────────

def draw_box(draw: ImageDraw.ImageDraw, box: Tuple[int, int, int, int], layer: dict) -> None:
    left, top, w, h = box
    fill = layer["fill"]
    color = hex_to_rgba255(fill["colors"][0], fill.get("opacity", 1.0))
    radius = int(layer.get("radiusPx", 0))
    xy = (left, top, left + w - 1, top + h - 1)
    stroke = layer.get("stroke")
    outline = hex_to_rgba255(stroke["color"]) if stroke else None
    width = int(stroke["widthPx"]) if stroke else 0
    if radius > 0:
        draw.rounded_rectangle(xy, radius=radius, fill=color, outline=outline, width=width)
    else:
        draw.rectangle(xy, fill=color, outline=outline, width=width)


def full_canvas_box_png(canvas: Tuple[int, int], layer: dict, path: str) -> str:
    """박스 하나를 캔버스 크기 투명 PNG에 그린다. (위치 변환 없이 scale 1로 올리면 정확히 맞음)"""
    img = Image.new("RGBA", canvas, (0, 0, 0, 0))
    draw_box(ImageDraw.Draw(img), Rect.from_dict(layer["rect"]).to_px(*canvas), layer)
    return save(img, path)


def placeholder_png(size: Tuple[int, int], label: str, bg: str, fg: str, path: str) -> str:
    """영상 자리/로고 자리 표시용 이미지 (원본 로고는 절대 쓰지 않음)"""
    w, h = size
    img = Image.new("RGBA", size, hex_to_rgba255(bg))
    draw = ImageDraw.Draw(img)
    fg_rgba = hex_to_rgba255(fg)
    draw.rectangle((0, 0, w - 1, h - 1), outline=fg_rgba, width=max(2, min(w, h) // 60))
    draw.line((0, 0, w, h), fill=fg_rgba, width=2)
    draw.line((0, h, w, 0), fill=fg_rgba, width=2)
    font = load_font(max(12, min(w, h) // 5))
    tw, th = _text_size(draw, label, font)
    draw.rectangle(((w - tw) / 2 - 8, (h - th) / 2 - 6, (w + tw) / 2 + 8, (h + th) / 2 + 10), fill=hex_to_rgba255(bg))
    draw.text(((w - tw) / 2, (h - th) / 2), label, font=font, fill=fg_rgba)
    return save(img, path)


def solid_png(size: Tuple[int, int], color: str, path: str, opacity: float = 1.0) -> str:
    return save(Image.new("RGBA", size, hex_to_rgba255(color, opacity)), path)


# ── T3 보정용 격자 ────────────────────────────────────────────

def grid_png(canvas: Tuple[int, int], path: str,
             expected_rects: Iterable[Tuple[Rect, str]] = (),
             text_guides: Iterable[Tuple[float, float, str]] = ()) -> str:
    """5% 간격 격자 + '여기에 와야 함' 점선 박스 + 글자 높이 안내선.

    text_guides: (중심 y 비율, 캡컷 글자 크기 값, 라벨)
    """
    w, h = canvas
    img = Image.new("RGBA", canvas, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    small = load_font(max(14, w // 60))
    for i in range(1, 20):
        is_major = i % 2 == 0
        color = (0, 255, 255, 170) if is_major else (0, 255, 255, 70)
        x = round(w * i / 20)
        y = round(h * i / 20)
        d.line((x, 0, x, h), fill=color, width=2 if is_major else 1)
        d.line((0, y, w, y), fill=color, width=2 if is_major else 1)
        if is_major:
            d.text((4, y + 2), f"{i * 5}%", font=small, fill=(0, 255, 255, 230))
            d.text((x + 3, 4), f"{i * 5}", font=small, fill=(0, 255, 255, 230))
    for rect, label in expected_rects:
        l, t, rw, rh = rect.to_px(w, h)
        _dashed_rect(d, (l, t, l + rw - 1, t + rh - 1), (255, 0, 255, 255), 3)
        d.text((l + 4, t + rh + 4), label, font=small, fill=(255, 0, 255, 255))
    for cy, size_units, label in text_guides:
        px = size_units_to_px(size_units) * (w / 1080)
        top = cy * h - px / 2
        bottom = cy * h + px / 2
        d.line((0, top, w * 0.06, top), fill=(255, 128, 0, 255), width=3)
        d.line((0, bottom, w * 0.06, bottom), fill=(255, 128, 0, 255), width=3)
        d.text((w * 0.945, cy * h - 10), label, font=small, fill=(255, 128, 0, 255))
    return save(img, path)


def _dashed_rect(d: ImageDraw.ImageDraw, xy, color, width: int, dash: int = 14) -> None:
    x0, y0, x1, y1 = xy
    for x in range(int(x0), int(x1), dash * 2):
        d.line((x, y0, min(x + dash, x1), y0), fill=color, width=width)
        d.line((x, y1, min(x + dash, x1), y1), fill=color, width=width)
    for y in range(int(y0), int(y1), dash * 2):
        d.line((x0, y, x0, min(y + dash, y1)), fill=color, width=width)
        d.line((x1, y, x1, min(y + dash, y1)), fill=color, width=width)


# ── 예상 결과 미리보기 ─────────────────────────────────────────

def expected_preview(canvas: Tuple[int, int], image_layers: List[Tuple[str, Rect]],
                     texts: List[dict], path: str) -> str:
    """캡컷에서 이렇게 보여야 한다는 기준 이미지.

    image_layers: (png 경로, 놓일 rect) — 아래에서 위 순서
    texts: {text, rect, size_px, color, stroke_color, stroke_px, align}
    """
    w, h = canvas
    img = Image.new("RGBA", canvas, (0, 0, 0, 255))
    for png, rect in image_layers:
        l, t, rw, rh = rect.to_px(w, h)
        src = Image.open(png).convert("RGBA").resize((rw, rh))
        img.alpha_composite(src, (l, t))
    d = ImageDraw.Draw(img)
    for item in texts:
        font = load_font(int(item["size_px"]))
        rect: Rect = item["rect"]
        l, t, rw, rh = rect.to_px(w, h)
        kwargs = dict(font=font, align=item.get("align", "center"), spacing=int(item["size_px"] * 0.2),
                      stroke_width=int(item.get("stroke_px") or 0))
        bbox = d.multiline_textbbox((0, 0), item["text"], **kwargs)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        stroke_fill = hex_to_rgba255(item["stroke_color"]) if item.get("stroke_px") else None
        d.multiline_text((l + (rw - tw) / 2 - bbox[0], t + (rh - th) / 2 - bbox[1]), item["text"],
                         fill=hex_to_rgba255(item["color"]), stroke_fill=stroke_fill, **kwargs)
    return save(img.convert("RGB"), path)


def _text_size(draw: ImageDraw.ImageDraw, text: str, font) -> Tuple[int, int]:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


if __name__ == "__main__":
    print("한글 폰트:", find_korean_font() or "없음", file=sys.stderr)
