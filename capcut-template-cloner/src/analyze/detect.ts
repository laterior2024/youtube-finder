/** 스크린샷 여러 장 → TemplateSpec 초안. 숫자는 모두 픽셀에서 잰 값. */
import type {
  BoxLayer, CaptionLayer, FontGuess, Layer, LogoLayer, Rect, TemplateSpec, TextSlotLayer, TextStyle, VideoAreaLayer,
} from '../../spec/template-spec';
import { type RGB, hexToRgb, luma, medianRgb, rgbToHex, snapColor } from '../lib/color';
import { detectCaptionBand } from './captions';
import { type Frame, canvasFor, downscale, px } from './frames';
import { measureText, type PxRect, type TextMeasure } from './measureText';
import { type Component, components, dilateMask, dynamicArea, openMask, staticMask } from './staticMask';

export const DEFAULT_FONT: FontGuess = { family: '캡컷 기본 폰트', weight: 700, similarity: 0, capcutBuiltIn: true };

export interface AnalyzeResult {
  spec: TemplateSpec;
  notes: string[];
}

/** frames는 모두 같은 표준 캔버스 크기(예: 1080×1920)여야 한다 */
export function analyzeFrames(frames: Frame[]): AnalyzeResult {
  const { width: W, height: H } = frames[0];
  const canvas = canvasFor(W, H);
  const notes: string[] = [];
  const layers: Layer[] = [];
  const toRect = (r: PxRect): Rect => ({ x: r.left / W, y: r.top / H, w: r.width / W, h: r.height / H });

  if (frames.length < 2) {
    notes.push('스크린샷이 1장이라 "안 변하는 부분"을 찾을 수 없어요. 장면이 다른 스크린샷을 3장 이상 올리면 자동으로 찾아요. 지금은 직접 그려 주세요.');
    layers.push(videoLayer({ x: 0, y: 0, w: 1, h: 1 }, 0.3));
    return { spec: makeSpec(canvas, layers), notes };
  }

  const factor = 4;
  const small = frames.map((f) => downscale(f, factor));
  const sw = small[0].width, sh = small[0].height;
  const mask = openMask(staticMask(small), 1);
  const { list, labels } = components(mask, 1);

  const dyn = dynamicArea(mask);
  const videoPx: PxRect = dyn
    ? { left: dyn.x0 * factor, top: dyn.y0 * factor, width: (dyn.x1 - dyn.x0 + 1) * factor, height: (dyn.y1 - dyn.y0 + 1) * factor }
    : { left: 0, top: 0, width: W, height: H };
  if (!dyn) notes.push('움직이는 영역을 찾지 못했어요. 스크린샷들이 거의 같은 장면이면 서로 다른 장면으로 바꿔 올려 주세요.');
  layers.push(videoLayer(toRect(snapToEdges(videoPx, W, H)), dyn ? 0.85 : 0.3));

  const textRects: PxRect[] = [];
  const minCount = sw * sh * 0.001;
  const sorted = list.map((c, i) => ({ c, i })).filter(({ c }) => c.count >= minCount).sort((a, b) => b.c.count - a.c.count);

  for (const { c, i } of sorted) {
    const bboxPx: PxRect = { left: c.x0 * factor, top: c.y0 * factor, width: (c.x1 - c.x0 + 1) * factor, height: (c.y1 - c.y0 + 1) * factor };
    const bboxArea = bboxPx.width * bboxPx.height;
    const overlap = intersectArea(bboxPx, videoPx) / bboxArea;
    // 영상 영역 안의 큰 고정 덩어리는 우연히 안 변한 배경일 가능성이 높다
    if (overlap > 0.5 && bboxArea > videoPx.width * videoPx.height * 0.15) continue;

    const { color, uniformity } = regionColor(small[0], labels, i, c);
    const isBig = bboxArea >= W * H * 0.03;

    if (isBig && uniformity >= 0.55) {
      const rect = toRect(snapToEdges(bboxPx, W, H));
      layers.push(boxLayer(rect, rgbToHex(snapColor(color)), boxLabel(rect), Math.min(0.95, 0.5 + uniformity / 2)));
      const textObjs: PxRect[] = [];
      for (const obj of innerObjects(small[0], c, snapColor(color), factor)) {
        const ocx = (obj.left + obj.width / 2) / W;
        const ocy = (obj.top + obj.height / 2) / H;
        const aspect = obj.width / obj.height;
        if ((ocx < 0.3 || ocx > 0.7) && aspect > 0.5 && aspect < 2 && obj.width * obj.height < W * H * 0.03) {
          layers.push(logoLayer(toRect(obj), ocx, ocy));
        } else {
          textObjs.push(obj);
        }
      }
      for (const obj of mergeTextLines(textObjs)) {
        const m = measureText([frames[0]], pad(obj, factor * 2, bboxPx), snapColor(color));
        if (m && m.inkBox) {
          const textRect = pad(m.inkBox, Math.round(m.sizePx * 0.25), bboxPx);
          textRects.push(textRect);
          layers.push(textSlotLayer(toRect(textRect), m, '제목', 0.8));
        }
      }
      continue;
    }

    const cx = (bboxPx.left + bboxPx.width / 2) / W;
    const cy = (bboxPx.top + bboxPx.height / 2) / H;
    const nearCorner = (cx < 0.3 || cx > 0.7) && (cy < 0.25 || cy > 0.75);
    if (nearCorner && bboxArea < W * H * 0.03) {
      layers.push(logoLayer(toRect(bboxPx), cx, cy));
      continue;
    }
    const m = measureText([frames[0]], bboxPx, uniformity > 0.4 ? snapColor(color) : undefined);
    if (m && m.inkBox) {
      textRects.push(bboxPx);
      layers.push(textSlotLayer(toRect(pad(m.inkBox, Math.round(m.sizePx * 0.25), { left: 0, top: 0, width: W, height: H })), m, '고정 글자', 0.6));
    } else if (uniformity >= 0.7) {
      const rect = toRect(bboxPx);
      layers.push(boxLayer(rect, rgbToHex(snapColor(color)), '작은 박스', 0.6));
    }
  }

  const cap = detectCaptionBand(frames, textRects);
  if (cap) {
    const m = measureText(cap.frames.map((i) => frames[i]), cap.rect);
    if (m) layers.push(captionLayer(toRect(cap.rect), m, 0.75));
  } else {
    notes.push('자막(장면마다 바뀌는 흰 글자) 위치를 찾지 못했어요. 필요하면 "자막" 레이어를 직접 추가해 주세요.');
  }

  return { spec: makeSpec(canvas, layers), notes };
}

// ── 레이어 만들기 ──────────────────────────────────────────────

export function videoLayer(rect: Rect, confidence: number): VideoAreaLayer {
  return { id: 'video', kind: 'video-area', label: '메인 영상', rect, zIndex: 0, confidence, fit: 'cover' };
}

export function boxLayer(rect: Rect, color: string, label: string, confidence: number): BoxLayer {
  return {
    id: `box_${Math.random().toString(36).slice(2, 7)}`, kind: 'box', label, rect, zIndex: 1, confidence,
    fill: { type: 'solid', colors: [color as `#${string}`], opacity: 1 }, radiusPx: 0,
  };
}

function logoLayer(rect: Rect, cx: number, cy: number): LogoLayer {
  const corner = `${cy < 0.5 ? 'top' : 'bottom'}-${cx < 0.5 ? 'left' : 'right'}` as LogoLayer['corner'];
  return { id: `logo_${Math.random().toString(36).slice(2, 7)}`, kind: 'logo', label: '로고 자리', rect, zIndex: 5, confidence: 0.6, corner, opacity: 1 };
}

export function styleFrom(m: Pick<TextMeasure, 'color' | 'highlightColor' | 'strokeColor' | 'strokePx' | 'sizePx' | 'align'>): TextStyle {
  return {
    font: DEFAULT_FONT, alternatives: [], sizePx: m.sizePx, lineHeight: 1.2, letterSpacing: 0, align: m.align,
    color: m.color, highlightColor: m.highlightColor,
    stroke: m.strokeColor ? { color: m.strokeColor, widthPx: m.strokePx } : undefined,
  };
}

function textSlotLayer(rect: Rect, m: TextMeasure, label: string, confidence: number): TextSlotLayer {
  return {
    id: `title_${Math.random().toString(36).slice(2, 7)}`, kind: 'text-slot', role: 'title', label, rect, zIndex: 3, confidence,
    style: styleFrom(m), maxLines: Math.max(1, m.lines), sampleText: m.lines > 1 ? '여기에 제목을\n두 줄로 쓰세요' : '여기에 제목을 쓰세요',
  };
}

function captionLayer(rect: Rect, m: TextMeasure, confidence: number): CaptionLayer {
  const charsPerLine = Math.max(6, Math.round((rect.w * 1080) / Math.max(10, m.sizePx)));
  return {
    id: 'caption', kind: 'caption', label: '자막', rect, zIndex: 4, confidence, style: styleFrom(m),
    maxCharsPerLine: charsPerLine, maxLines: Math.max(1, m.lines), emphasisRule: m.highlightColor ? 'keyword-color' : 'none',
  };
}

export function makeSpec(canvas: ReturnType<typeof canvasFor>, layers: Layer[]): TemplateSpec {
  const boxes = layers.filter((l): l is BoxLayer => l.kind === 'box');
  const texts = layers.filter((l): l is TextSlotLayer | CaptionLayer => l.kind === 'text-slot' || l.kind === 'caption');
  const primary = boxes[0]?.fill.colors[0] ?? '#000000';
  const accent = texts.find((t) => t.style.highlightColor)?.style.highlightColor ?? '#FFD400';
  return {
    version: 1,
    id: `tpl_${Date.now().toString(36)}`,
    name: '새 틀',
    canvas: { aspect: canvas.aspect, widthPx: canvas.w, heightPx: canvas.h },
    layers,
    palette: {
      primary,
      secondary: boxes[1]?.fill.colors[0] ?? primary,
      accent,
      text: texts[0]?.style.color ?? '#FFFFFF',
      background: luma(hexToRgb(primary)) < 128 ? '#000000' : '#FFFFFF',
    },
    source: { type: 'screenshots', analyzedAt: new Date().toISOString() },
    checks: { minContrastRatio: 4.5, shortsSafeArea: true },
  };
}

// ── 보조 함수 ──────────────────────────────────────────────────

function regionColor(f: Frame, labels: Int32Array, label: number, c: Component): { color: RGB; uniformity: number } {
  const samples: RGB[] = [];
  for (let y = c.y0; y <= c.y1; y++) {
    for (let x = c.x0; x <= c.x1; x++) {
      if (labels[y * f.width + x] === label) samples.push(px(f, x, y));
    }
  }
  const color = medianRgb(samples);
  const close = samples.filter((s) => Math.hypot(s[0] - color[0], s[1] - color[1], s[2] - color[2]) < 30).length;
  // 덩어리 bbox 안에서 덩어리가 차지하는 비율도 반영 (글자가 든 박스는 bbox를 거의 꽉 채움)
  const fillRatio = c.count / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1));
  return { color, uniformity: (close / samples.length) * Math.min(1, fillRatio / 0.8) };
}

function intersectArea(a: PxRect, b: PxRect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 캔버스 가장자리에서 1.5% 안쪽이면 가장자리에 딱 붙인다 */
function snapToEdges(r: PxRect, W: number, H: number): PxRect {
  const tx = W * 0.015, ty = H * 0.015;
  let { left, top } = r;
  let right = r.left + r.width, bottom = r.top + r.height;
  if (left < tx) left = 0;
  if (top < ty) top = 0;
  if (W - right < tx) right = W;
  if (H - bottom < ty) bottom = H;
  return { left, top, width: right - left, height: bottom - top };
}

/** 위아래로 붙어 있고 가로로 겹치는 글자 줄은 한 덩어리(여러 줄 제목)로 합친다 */
export function mergeTextLines(objs: PxRect[]): PxRect[] {
  const list = [...objs].sort((a, b) => a.top - b.top);
  const out: PxRect[] = [];
  for (const o of list) {
    const prev = out[out.length - 1];
    const gap = prev ? o.top - (prev.top + prev.height) : Infinity;
    const overlapX = prev ? Math.min(prev.left + prev.width, o.left + o.width) - Math.max(prev.left, o.left) : 0;
    const lineH = prev ? Math.min(prev.height, o.height) : 0;
    if (prev && gap < lineH * 0.9 && overlapX > Math.min(prev.width, o.width) * 0.3) {
      const left = Math.min(prev.left, o.left), top = prev.top;
      const right = Math.max(prev.left + prev.width, o.left + o.width), bottom = Math.max(prev.top + prev.height, o.top + o.height);
      out[out.length - 1] = { left, top, width: right - left, height: bottom - top };
    } else {
      out.push(o);
    }
  }
  return out;
}

/** 박스 안에서 박스 색과 다른 덩어리(글자 줄, 로고 등). 가까운 글자끼리는 이어 붙인다. */
function innerObjects(f: Frame, box: Component, bg: RGB, factor: number): PxRect[] {
  const x0 = box.x0 + 1, y0 = box.y0 + 1;
  const w = box.x1 - box.x0 - 1, h = box.y1 - box.y0 - 1;
  if (w <= 2 || h <= 2) return [];
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = px(f, x0 + x, y0 + y);
      bits[y * w + x] = Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]) > 70 ? 1 : 0;
    }
  }
  const merged = dilateMask({ width: w, height: h, bits }, 3);
  return components(merged, 1).list
    .filter((o) => o.count >= 12)
    .map((o) => {
      // 팽창한 만큼(3) 되돌린다
      const left = Math.max(0, o.x0 + 3), top = Math.max(0, o.y0 + 3);
      const right = Math.min(w - 1, o.x1 - 3), bottom = Math.min(h - 1, o.y1 - 3);
      return { left: (x0 + left) * factor, top: (y0 + top) * factor, width: (right - left + 1) * factor, height: (bottom - top + 1) * factor };
    })
    .filter((r) => r.width > 0 && r.height > 0);
}

function pad(r: PxRect, by: number, within: PxRect): PxRect {
  const left = Math.max(within.left, r.left - by);
  const top = Math.max(within.top, r.top - by);
  const right = Math.min(within.left + within.width, r.left + r.width + by);
  const bottom = Math.min(within.top + within.height, r.top + r.height + by);
  return { left, top, width: right - left, height: bottom - top };
}

function boxLabel(rect: Rect): string {
  const cy = rect.y + rect.h / 2;
  return cy < 0.34 ? '상단 박스' : cy > 0.66 ? '하단 박스' : '가운데 박스';
}
