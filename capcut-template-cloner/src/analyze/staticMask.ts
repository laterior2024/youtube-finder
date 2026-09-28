/** 여러 프레임에서 "안 변하는 픽셀"(= 고정 틀)을 찾는다. */
import type { Frame } from './frames';

export interface Mask {
  width: number;
  height: number;
  bits: Uint8Array; // 1 = 고정
}

export interface Component {
  x0: number; y0: number; x1: number; y1: number; // 포함 좌표
  count: number;
}

/** 프레임 간 채널별 (최대-최소) 차이가 threshold 미만이면 고정 픽셀 */
export function staticMask(frames: Frame[], threshold = 28): Mask {
  const { width, height } = frames[0];
  const bits = new Uint8Array(width * height);
  for (let p = 0; p < width * height; p++) {
    let maxRange = 0;
    for (let c = 0; c < 3; c++) {
      let lo = 255, hi = 0;
      for (const f of frames) {
        const v = f.data[p * 4 + c];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      maxRange = Math.max(maxRange, hi - lo);
    }
    bits[p] = maxRange < threshold ? 1 : 0;
  }
  return { width, height, bits };
}

/** 작은 잡음 제거: 침식 후 팽창 (반지름 r) */
export function openMask(m: Mask, r = 1): Mask {
  return morph(morph(m, r, 'erode'), r, 'dilate');
}

export function dilateMask(m: Mask, r: number): Mask {
  return morph(m, r, 'dilate');
}

function morph(m: Mask, r: number, op: 'erode' | 'dilate'): Mask {
  const { width, height, bits } = m;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = op === 'erode' ? 1 : 0;
      for (let dy = -r; dy <= r && (op === 'erode' ? v === 1 : v === 0); dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          const b = bits[yy * width + xx];
          if (op === 'erode' && b === 0) { v = 0; break; }
          if (op === 'dilate' && b === 1) { v = 1; break; }
        }
      }
      out[y * width + x] = v;
    }
  }
  return { width, height, bits: out };
}

/** 4방향 연결 덩어리 */
export function components(m: Mask, value = 1): { list: Component[]; labels: Int32Array } {
  const { width, height, bits } = m;
  const labels = new Int32Array(width * height).fill(-1);
  const list: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (bits[start] !== value || labels[start] !== -1) continue;
    const id = list.length;
    const c: Component = { x0: width, y0: height, x1: 0, y1: 0, count: 0 };
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      c.count++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      const nbrs = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const q of nbrs) {
        if (q >= 0 && bits[q] === value && labels[q] === -1) {
          labels[q] = id;
          stack.push(q);
        }
      }
    }
    list.push(c);
  }
  return { list, labels };
}

/** 움직이는 픽셀이 많은 가장 긴 가로줄 구간 × 세로줄 구간 = 영상이 나오는 영역 */
export function dynamicArea(m: Mask, density = 0.5): Component | null {
  const { width, height, bits } = m;
  const rowDyn = (y: number) => {
    let n = 0;
    for (let x = 0; x < width; x++) n += bits[y * width + x] === 0 ? 1 : 0;
    return n / width;
  };
  const rows = longestRun(height, (y) => rowDyn(y) >= density);
  if (!rows) return null;
  const colDyn = (x: number) => {
    let n = 0;
    for (let y = rows[0]; y <= rows[1]; y++) n += bits[y * width + x] === 0 ? 1 : 0;
    return n / (rows[1] - rows[0] + 1);
  };
  const cols = longestRun(width, (x) => colDyn(x) >= density) ?? [0, width - 1];
  return { x0: cols[0], x1: cols[1], y0: rows[0], y1: rows[1], count: 0 };
}

export function longestRun(n: number, ok: (i: number) => boolean): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && ok(i)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      if (!best || i - 1 - start > best[1] - best[0]) best = [start, i - 1];
      start = -1;
    }
  }
  return best;
}
