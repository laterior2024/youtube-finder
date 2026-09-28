/** 사각형 안 글자의 색·테두리·크기·줄 수를 픽셀에서 직접 잰다. */
import type { Hex } from '../../spec/template-spec';
import { type RGB, luma, medianRgb, rgbToHex, snapColor } from '../lib/color';
import { type Frame, px } from './frames';

export interface PxRect { left: number; top: number; width: number; height: number }

export interface TextMeasure {
  color: Hex;
  highlightColor?: Hex;
  strokeColor?: Hex;
  strokePx: number;
  sizePx: number;
  lines: number;
  inkBox: PxRect | null;
  align: 'left' | 'center' | 'right';
  fillCount: number;
}

/** 한글 굵은 고딕 기준, 글자 잉크 높이 ≈ 글자 크기(em)의 0.85 */
const INK_TO_EM = 0.85;
const DARK = 80;

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const saturation = ([r, g, b]: RGB) => Math.max(r, g, b) - Math.min(r, g, b);

const isBright = (c: RGB) => luma(c) > 190 || (Math.max(...c) > 200 && saturation(c) > 80 && luma(c) > 120);

/** 테두리 있는 밝은 글자(자막) 판정: 밝거나 선명한 색 + 3px 안에 어두운 픽셀 */
export function isOutlinedBright(f: Frame, x: number, y: number): boolean {
  if (!isBright(px(f, x, y))) return false;
  for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2]]) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= f.width || yy >= f.height) continue;
    if (luma(px(f, xx, yy)) < 60) return true;
  }
  return false;
}

export function measureText(frames: Frame[], rect: PxRect, bg?: RGB): TextMeasure | null {
  const isFill = (f: Frame, x: number, y: number) => {
    if (!bg) return isOutlinedBright(f, x, y);
    const c = px(f, x, y);
    if (dist(c, bg) < 90) return false;
    // 배경이 어두우면 밝은 글자, 밝으면 어두운 글자를 찾는다
    return luma(bg) < 128 ? luma(c) >= DARK : true;
  };

  let best: { f: Frame; mask: Uint8Array; count: number } | null = null;
  const samples: RGB[] = [];
  const x0 = Math.max(0, rect.left), y0 = Math.max(0, rect.top);
  const x1 = Math.min(frames[0].width, rect.left + rect.width), y1 = Math.min(frames[0].height, rect.top + rect.height);
  const w = x1 - x0, h = y1 - y0;
  if (w <= 2 || h <= 2) return null;

  for (const f of frames) {
    const mask = new Uint8Array(w * h);
    let count = 0;
    const stack: number[] = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (isFill(f, x, y)) {
          mask[(y - y0) * w + (x - x0)] = 1;
          stack.push((y - y0) * w + (x - x0));
        }
      }
    }
    // 배경 없는 자막: 테두리 옆 픽셀에서 시작해 이어진 밝은 픽셀까지 글자로 넓힌다
    while (!bg && stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p - x) / w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q < 0 || mask[q]) continue;
        const qx = q % w, qy = (q - qx) / w;
        if (isBright(px(f, x0 + qx, y0 + qy))) { mask[q] = 1; stack.push(q); }
      }
    }
    for (let p = 0; p < w * h; p++) {
      if (!mask[p]) continue;
      count++;
      const x = p % w, y = (p - x) / w;
      if ((x + y) % 3 === 0) samples.push(px(f, x0 + x, y0 + y));
    }
    if (!best || count > best.count) best = { f, mask, count };
  }
  if (!best || best.count < Math.max(20, w * h * 0.002)) return null;

  // 색: 무채색 무리 vs 유채색 무리 → 큰 쪽이 글자색, 작은 쪽(8% 이상)이 강조색
  const neutral = samples.filter((c) => saturation(c) < 60);
  const vivid = samples.filter((c) => saturation(c) >= 60);
  const [main, second] = neutral.length >= vivid.length ? [neutral, vivid] : [vivid, neutral];
  const color = rgbToHex(snapColor(medianRgb(main)));
  const highlightColor = second.length / samples.length >= 0.08 ? rgbToHex(snapColor(medianRgb(second))) : undefined;

  // 줄: 글자 픽셀이 있는 가로줄 구간 (간격 2px 이하는 이어 붙임)
  const rowHas = (yy: number) => {
    let n = 0;
    for (let xx = 0; xx < w; xx++) n += best!.mask[yy * w + xx];
    return n >= 2;
  };
  const runs: [number, number][] = [];
  let start = -1, gap = 0;
  for (let yy = 0; yy <= h; yy++) {
    if (yy < h && rowHas(yy)) {
      if (start < 0) start = yy;
      gap = 0;
    } else if (start >= 0) {
      if (yy < h && ++gap <= 2) continue;
      const end = yy - gap;
      if (end - start + 1 >= 4) runs.push([start, end]);
      start = -1; gap = 0;
    }
  }
  if (runs.length === 0) return null;
  const heights = runs.map(([a, b]) => b - a + 1).sort((a, b) => a - b);
  const inkHeight = heights[heights.length >> 1];

  // 잉크 영역
  let ix0 = w, ix1 = 0;
  for (let yy = runs[0][0]; yy <= runs[runs.length - 1][1]; yy++) {
    for (let xx = 0; xx < w; xx++) {
      if (best.mask[yy * w + xx]) { if (xx < ix0) ix0 = xx; if (xx > ix1) ix1 = xx; }
    }
  }
  const inkBox: PxRect = { left: x0 + ix0, top: y0 + runs[0][0], width: ix1 - ix0 + 1, height: runs[runs.length - 1][1] - runs[0][0] + 1 };

  // 테두리: 글자 → 바깥쪽으로 이어지는 어두운 픽셀 길이
  const strokeRuns: number[] = [];
  const strokeSamples: RGB[] = [];
  let transitions = 0;
  for (const [a, b] of runs) {
    for (let yy = a; yy <= b; yy += 2) {
      for (let xx = 1; xx < w; xx++) {
        const i = yy * w + xx;
        for (const dir of [1, -1]) {
          // dir=1: 글자(왼쪽) → 비글자(현재), dir=-1: 비글자(현재) ← 글자(오른쪽)
          const from = dir === 1 ? i - 1 : i + 1;
          if (dir === -1 && xx >= w - 1) continue;
          if (!(best.mask[from] && !best.mask[i])) continue;
          let run = 0;
          let hitLetter = false;
          const run0: RGB[] = [];
          for (let k = xx; k >= 0 && k < w && run < 40; k += dir) {
            if (best.mask[yy * w + k]) { hitLetter = true; break; }
            const c = px(best.f, x0 + k, y0 + yy);
            if (luma(c) >= DARK) break;
            run0.push(c);
            run++;
          }
          // 다른 글자에 닿은 구간은 테두리가 겹친 것이라 두께 계산에서 뺀다 (배경에 닿은 구간만 사용)
          if (!hitLetter) transitions++;
          if (run > 0 && run < 40 && !hitLetter) { strokeRuns.push(run); strokeSamples.push(...run0); }
        }
      }
    }
  }
  const medRun = modeWithin1(strokeRuns);
  const bgIsDark = bg ? luma(bg) < DARK : false;
  const hasStroke = !bgIsDark && transitions > 0 && strokeRuns.length / transitions >= 0.3 && medRun >= 2 && medRun <= 25;

  const inkCenter = inkBox.left + inkBox.width / 2;
  const rectCenter = rect.left + rect.width / 2;
  const align = inkCenter < rectCenter - rect.width * 0.12 ? 'left' : inkCenter > rectCenter + rect.width * 0.12 ? 'right' : 'center';

  return {
    color,
    highlightColor,
    strokeColor: hasStroke ? rgbToHex(snapColor(medianRgb(strokeSamples))) : undefined,
    strokePx: hasStroke ? medRun : 0,
    sizePx: Math.round(inkHeight / INK_TO_EM),
    lines: runs.length,
    inkBox,
    align,
    fillCount: best.count,
  };
}

/** 가장 자주 나오는 값 (±1 묶음). 테두리 두께는 반복되고, 어두운 배경에 이어진 잡음은 제각각이라 최빈값이 정확하다 */
function modeWithin1(values: number[]): number {
  if (values.length === 0) return 0;
  const hist = new Map<number, number>();
  for (const v of values) hist.set(v, (hist.get(v) ?? 0) + 1);
  let best = 0, bestScore = -1;
  for (const v of [...hist.keys()].sort((a, b) => a - b)) {
    const score = (hist.get(v - 1) ?? 0) + (hist.get(v) ?? 0) * 2 + (hist.get(v + 1) ?? 0);
    if (score > bestScore) { best = v; bestScore = score; }
  }
  return best;
}
