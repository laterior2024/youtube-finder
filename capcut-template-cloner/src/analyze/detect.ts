/** 스크린샷 여러 장 → TemplateSpec 초안. 숫자는 모두 픽셀에서 잰 값. */
import type {
  BoxLayer, CaptionLayer, FontGuess, Layer, LogoLayer, Rect, TemplateSpec, TextSlotLayer, TextStyle, VideoAreaLayer,
} from '../../spec/template-spec';
import { type RGB, hexToRgb, luma, medianRgb, rgbToHex, snapColor } from '../lib/color';
import { type Band, bandsToRect, captionBandsPerFrame, detectCaptionBand } from './captions';
import { type Frame, canvasFor, downscale, px } from './frames';
import { measureText, type PxRect, type TextMeasure } from './measureText';
import { type Component, components, dilateMask, dynamicArea, type Mask, openMask, staticMask } from './staticMask';

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
  const toRect = (r: PxRect): Rect => pxToRect(r, W, H);

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
  const exclude: PxRect[] = [];
  const bands = dyn ? analyzeBands(frames, small, mask, dyn, factor, notes) : null;
  const minCount = sw * sh * 0.001;
  const sorted = bands ? [] : list.map((c, i) => ({ c, i })).filter(({ c }) => c.count >= minCount).sort((a, b) => b.c.count - a.c.count);
  if (bands) {
    layers.push(...bands.layers);
    textRects.push(...bands.textRects);
    exclude.push(...bands.bandRects);
  }

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

  // 자막 찾기: 위아래 띠(박스)와 화면 맨 위 플레이어 버튼 줄은 빼고 찾는다
  const chrome: PxRect = { left: 0, top: 0, width: W, height: Math.round(H * CHROME_BAND) };
  const capExclude = [...textRects, ...exclude, chrome];
  const cap = detectCaptionBand(frames, capExclude) ?? captionByStyle(frames, capExclude, notes);
  if (cap) {
    const m = measureText(cap.frames.map((i) => frames[i]), cap.rect);
    if (m) layers.push(captionLayer(toRect(cap.rect), m, 'confidence' in cap ? (cap.confidence as number) : 0.75));
  } else {
    notes.push('자막(장면마다 바뀌는 흰 글자) 위치를 찾지 못했어요. 필요하면 "자막" 레이어를 직접 추가해 주세요.');
  }

  return { spec: makeSpec(canvas, layers), notes };
}

/** 화면 맨 위 이 비율 안에 있는 작은 고정 물체는 플레이어 버튼·채널명으로 보고 뺀다 */
const CHROME_BAND = 0.09;

const pxToRect = (r: PxRect, W: number, H: number): Rect => ({ x: r.left / W, y: r.top / H, w: r.width / W, h: r.height / H });

/**
 * 쇼츠에서 가장 흔한 "위아래 띠 + 가운데 영상" 틀.
 * 띠 = 박스, 띠 안에서 영상마다 바뀌는 글자 = 제목, 늘 같은 것 = 브랜드(로고 자리).
 */
function analyzeBands(frames: Frame[], small: Frame[], mask: Mask, dyn: Component, factor: number, notes: string[]) {
  const { width: W, height: H } = frames[0];
  const sw = small[0].width, sh = small[0].height;
  const bandSpecs = [
    { name: '상단 박스', y0: 0, y1: dyn.y0 - 1, top: true },
    { name: '하단 박스', y0: dyn.y1 + 1, y1: sh - 1, top: false },
  ].filter((b) => b.y1 - b.y0 + 1 >= sh * 0.03);
  if (bandSpecs.length === 0) return null;

  const layers: Layer[] = [];
  const textRects: PxRect[] = [];
  const bandRects: PxRect[] = [];
  const need = Math.min(2, frames.length);
  let droppedChrome = false;

  for (const band of bandSpecs) {
    const bandPx: PxRect = { left: 0, top: band.y0 * factor, width: W, height: (band.y1 - band.y0 + 1) * factor };
    const snapped = snapToEdges(bandPx, W, H);
    bandRects.push(snapped);

    // 띠 색: 고정 픽셀의 중앙값
    const samples: RGB[] = [];
    for (let y = band.y0; y <= band.y1; y++) {
      for (let x = 0; x < sw; x++) if (mask.bits[y * sw + x]) samples.push(px(small[0], x, y));
    }
    const bandColor = snapColor(medianRgb(samples.length > 20 ? samples : allPixels(small[0], band.y0, band.y1)));
    layers.push(boxLayer(pxToRect(snapped, W, H), rgbToHex(bandColor), band.name, 0.9));

    // 띠 색과 다른 픽셀(어느 장면에서든) → 물체
    const bh = band.y1 - band.y0 + 1;
    const diff = new Uint8Array(sw * bh);
    const differs = (f: Frame, x: number, y: number) => {
      const c = px(f, x, y);
      return Math.hypot(c[0] - bandColor[0], c[1] - bandColor[1], c[2] - bandColor[2]) > 60;
    };
    // 스크린샷 가장자리의 얇은 테두리(캡처할 때 딸려온 선)는 무시
    const edge = Math.max(1, Math.round(sw * 0.015));
    let chromeFree = snapped;
    for (let y = 0; y < bh; y++) {
      for (let x = edge; x < sw - edge; x++) {
        if (small.some((f) => differs(f, x, band.y0 + y))) diff[y * sw + x] = 1;
      }
    }
    // 플레이어 구분선(맨 위 12% 안의 가로로 꽉 찬 줄)이 있으면 그 위(버튼·채널명)는 통째로 뺀다.
    // 스크린샷마다 위치가 조금씩 달라서 장면별로 찾고 가장 아래 것을 쓴다
    if (band.top) {
      // 구분선 = 거의 전체 폭(85%+)을 채우는 얇은 줄(1~2px). 굵은 제목 줄은 여러 줄 연속이라 제외된다
      let cut = -1;
      for (const f of small) {
        const full = (y: number) => {
          if (y < 0 || y >= bh) return false;
          let n = 0;
          for (let x = edge; x < sw - edge; x++) if (differs(f, x, band.y0 + y)) n++;
          return n >= (sw - edge * 2) * 0.85;
        };
        for (let y = 0; y < bh && (band.y0 + y) * factor < H * 0.12; y++) {
          if (!full(y)) continue;
          let end = y;
          while (full(end + 1)) end++;
          if (end - y + 1 <= 2) cut = Math.max(cut, end);
          y = end;
        }
      }
      if (cut >= 0) {
        diff.fill(0, 0, Math.min(bh, cut + 2) * sw);
        const cutPx = (band.y0 + cut + 2) * factor;
        chromeFree = { ...snapped, top: cutPx, height: snapped.top + snapped.height - cutPx };
        droppedChrome = true;
      }
    }
    const objs = components(dilateMask({ width: sw, height: bh, bits: diff }, 3), 1).list.filter((o) => o.count >= 12);

    const varying: PxRect[] = [];
    const brand: PxRect[] = [];
    for (const o of objs) {
      const x0 = Math.max(0, o.x0 + 3), x1 = Math.min(sw - 1, o.x1 - 3);
      const y0 = Math.max(0, o.y0 + 3), y1 = Math.min(bh - 1, o.y1 - 3);
      if (x1 < x0 || y1 < y0) continue;
      const rect: PxRect = { left: x0 * factor, top: (band.y0 + y0) * factor, width: (x1 - x0 + 1) * factor, height: (y1 - y0 + 1) * factor };
      // 플레이어 버튼·구분선 (화면 맨 위의 작은 것, 가늘고 긴 선)
      if (band.top && rect.top + rect.height <= H * (CHROME_BAND + 0.01)) { droppedChrome = true; continue; }
      if (rect.height <= H * 0.008 && rect.width > W * 0.5) { droppedChrome = true; continue; }

      let diffCount = 0, staticDiff = 0;
      const perFrame = small.map(() => 0);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!diff[y * sw + x]) continue;
          diffCount++;
          // 스크린샷 크기가 조금씩 달라 몇 px 어긋나도 같은 것으로 본다
          if (differs(small[0], x, band.y0 + y) && sameAcross(small, x, band.y0 + y)) staticDiff++;
          small.forEach((f, i) => { if (differs(f, x, band.y0 + y)) perFrame[i]++; });
        }
      }
      const present = perFrame.filter((n) => n >= Math.max(6, (x1 - x0 + 1) * (y1 - y0 + 1) * 0.02)).length;
      // 브랜드: 모든 장면에 있고, 장면끼리 같은 모양
      if (present === frames.length && staticDiff / Math.max(1, diffCount) >= 0.5) brand.push(rect);
      else if (present >= need) varying.push(rect);
    }

    // 바뀌는 글자 → 제목 (가장 큰 덩어리)
    const titles = mergeTextLines(varying).sort((a, b) => b.width * b.height - a.width * a.height);
    let titleFound = false;
    if (titles.length) {
      const m = measureAcross(frames, pad(titles[0], factor * 6, chromeFree), bandColor);
      if (m) {
        const rect = pad(m.union, Math.round(m.best.sizePx * 0.2), snapped);
        textRects.push(rect);
        layers.push(textSlotLayer(pxToRect(rect, W, H), m.best, band.top ? '제목' : '하단 글자', 0.85));
        titleFound = true;
      }
    }
    // 늘 같은 것 → 브랜드. 단, 위 띠에 바뀌는 제목이 없고 넓은 글자면 (한 영상 스크린샷) 고정 제목
    for (const obj of mergeNearby(brand, Math.round(W * 0.06))) {
      const cx = (obj.left + obj.width / 2) / W, cy = (obj.top + obj.height / 2) / H;
      if (band.top && !titleFound && obj.width > W * 0.4) {
        const m = measureText([frames[0]], pad(obj, factor * 2, snapped), bandColor);
        if (m && m.inkBox) {
          const rect = pad(m.inkBox, Math.round(m.sizePx * 0.2), snapped);
          textRects.push(rect);
          layers.push(textSlotLayer(pxToRect(rect, W, H), m, '제목', 0.8));
          titleFound = true;
          continue;
        }
      }
      layers.push(logoLayer(pxToRect(obj, W, H), cx, cy));
    }
  }
  if (droppedChrome) notes.push('화면 맨 위의 플레이어 버튼·채널명·구분선으로 보이는 것은 틀에서 뺐어요. 틀에 필요한 거라면 직접 추가해 주세요.');
  return { layers, textRects, bandRects };
}

/**
 * 자막 위치가 영상마다 다른 채널: 같은 스타일(색·테두리)의 자막 줄끼리 묶어서
 * 가장 많은 묶음의 가운데 위치를 자막 자리로 쓴다 (확신 낮음으로 표시)
 */
function captionByStyle(frames: Frame[], exclude: PxRect[], notes: string[]) {
  const { width: W, height: H } = frames[0];
  const bands = captionBandsPerFrame(frames, exclude);
  if (bands.length < 2) return null;
  const measured = bands.map((b) => ({ b, m: measureText([frames[b.frame]], bandsToRect([b], W, H)) }))
    .filter((x): x is { b: Band; m: TextMeasure } => !!x.m);
  const groups: { b: Band; m: TextMeasure }[][] = [];
  for (const x of measured) {
    const g = groups.find((g) => {
      const [c1, c2] = [hexToRgb(g[0].m.color), hexToRgb(x.m.color)];
      return Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]) < 70 && !!g[0].m.strokeColor === !!x.m.strokeColor;
    });
    if (g) g.push(x); else groups.push([x]);
  }
  const best = groups.sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < 2) return null;
  const centers = best.map((x) => (x.b.top + x.b.bottom) / 2).sort((a, b) => a - b);
  const mid = centers[(centers.length - 1) >> 1];
  const half = Math.max(...best.map((x) => (x.b.bottom - x.b.top) / 2));
  const merged: Band = {
    top: Math.round(mid - half), bottom: Math.round(mid + half),
    left: Math.min(...best.map((x) => x.b.left)), right: Math.max(...best.map((x) => x.b.right)), frame: best[0].b.frame,
  };
  notes.push('자막 위치가 영상마다 달라서, 같은 모양 자막들의 가운데 위치에 놓았어요. 원하는 위치로 옮겨 주세요.');
  return { rect: bandsToRect([merged], W, H), frames: best.map((x) => x.b.frame), confidence: 0.5 };
}

/** 여러 장면에서 같은 자리 글자를 재서, 가장 선명한 측정값 + 모든 장면을 덮는 영역 */
function measureAcross(frames: Frame[], rect: PxRect, bg: RGB) {
  const { width: W } = frames[0];
  const edge = Math.round(W * 0.015);
  const left = Math.max(rect.left, edge), right = Math.min(rect.left + rect.width, W - edge);
  const inner = { ...rect, left, width: right - left };
  const ms = frames.map((f) => measureText([f], inner, bg)).filter((m): m is TextMeasure => !!m && !!m.inkBox);
  if (ms.length === 0) return null;
  const best = ms.reduce((a, b) => (b.fillCount > a.fillCount ? b : a));
  const boxes = ms.map((m) => m.inkBox!);
  const l = Math.min(...boxes.map((b) => b.left)), top = Math.min(...boxes.map((b) => b.top));
  const r = Math.max(...boxes.map((b) => b.left + b.width)), bottom = Math.max(...boxes.map((b) => b.top + b.height));
  // 글자 크기: 줄이 제대로 나뉜 장면들의 중앙값 (줄이 붙어서 재진 장면은 크게 나온다)
  const maxLines = Math.max(...ms.map((m) => m.lines));
  const sizes = ms.filter((m) => m.lines === maxLines).map((m) => m.sizePx).sort((a, b) => a - b);
  return { best: { ...best, sizePx: sizes[(sizes.length - 1) >> 1], lines: maxLines }, union: { left: l, top, width: r - l, height: bottom - top } };
}

/** 가까운 사각형끼리 합친다 (로고 아이콘 + 로고 글자) */
function mergeNearby(rects: PxRect[], gap: number): PxRect[] {
  const out = rects.map((r) => ({ ...r }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.left + a.width, b.left + b.width));
        const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.top + a.height, b.top + b.height));
        if (dx <= gap && dy <= gap) {
          const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
          out[i] = { left, top, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top };
          out.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return out;
}

/** 모든 장면에서 이 픽셀이 (±2px 안에서) 같은 색인가 — 스크린샷마다 크기·위치가 조금씩 달라도 됨 */
function sameAcross(frames: Frame[], x: number, y: number): boolean {
  const c = px(frames[0], x, y);
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    let best = Infinity;
    for (let dy = -2; dy <= 2 && best >= 45; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= f.width || yy >= f.height) continue;
        const d = px(f, xx, yy);
        best = Math.min(best, Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]));
      }
    }
    if (best >= 45) return false;
  }
  return true;
}

function allPixels(f: Frame, y0: number, y1: number): RGB[] {
  const out: RGB[] = [];
  for (let y = y0; y <= y1; y++) for (let x = 0; x < f.width; x++) out.push(px(f, x, y));
  return out;
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
  const corner = cx > 0.3 && cx < 0.7 ? 'custom' : (`${cy < 0.5 ? 'top' : 'bottom'}-${cx < 0.5 ? 'left' : 'right'}` as LogoLayer['corner']);
  return { id: `logo_${Math.random().toString(36).slice(2, 7)}`, kind: 'logo', label: '로고 자리', rect, zIndex: 5, confidence: 0.6, corner, opacity: 1 };
}

export function styleFrom(m: Pick<TextMeasure, 'color' | 'highlightColor' | 'lineColors' | 'strokeColor' | 'strokePx' | 'sizePx' | 'align'>): TextStyle {
  return {
    font: DEFAULT_FONT, alternatives: [], sizePx: m.sizePx, lineHeight: 1.2, letterSpacing: 0, align: m.align,
    color: m.color, highlightColor: m.highlightColor, lineColors: m.lineColors,
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
