/** 장면마다 바뀌는 자막 줄(테두리 있는 밝은 글자)이 늘 같은 높이에 나오는 구간을 찾는다. */
import type { Frame } from './frames';
import { isOutlinedBright, type PxRect } from './measureText';

interface Band { top: number; bottom: number; left: number; right: number; frame: number }

export function detectCaptionBand(frames: Frame[], exclude: PxRect[] = []): { rect: PxRect; frames: number[] } | null {
  const { width, height } = frames[0];
  const excluded = (x: number, y: number) =>
    exclude.some((r) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height);

  const bands: Band[] = [];
  frames.forEach((f, fi) => {
    const rows = new Float32Array(height);
    const minX = new Int32Array(height).fill(width);
    const maxX = new Int32Array(height).fill(-1);
    for (let y = 3; y < height - 3; y++) {
      for (let x = 3; x < width - 3; x += 2) {
        if (excluded(x, y) || !isOutlinedBright(f, x, y)) continue;
        rows[y]++;
        if (x < minX[y]) minX[y] = x;
        if (x > maxX[y]) maxX[y] = x;
      }
    }
    const threshold = Math.max(4, width * 0.006);
    const mergeGap = Math.round(height * 0.02);
    const valid = (b: Band) => b.bottom - b.top >= height * 0.012 && b.bottom - b.top <= height * 0.2;
    let best: Band | null = null;
    let bestScore = 0;
    let cur: Band | null = null;
    let score = 0, gap = 0;
    const close = () => {
      // 너무 크거나 작은 구간(영상 속 무늬 등)은 버리고 남은 것 중 가장 강한 구간
      if (cur && valid(cur) && score > bestScore) { best = cur; bestScore = score; }
      cur = null; score = 0; gap = 0;
    };
    for (let y = 0; y < height; y++) {
      if (rows[y] >= threshold) {
        if (!cur) cur = { top: y, bottom: y, left: minX[y], right: maxX[y], frame: fi };
        cur.bottom = y;
        cur.left = Math.min(cur.left, minX[y]);
        cur.right = Math.max(cur.right, maxX[y]);
        score += rows[y];
        gap = 0;
      } else if (cur && ++gap > mergeGap) {
        close();
      }
    }
    close();
    const found = best as Band | null;
    if (found) bands.push(found);
  });

  const need = Math.max(2, Math.ceil(frames.length / 2));
  if (bands.length < need) return null;
  const centers = bands.map((b) => (b.top + b.bottom) / 2).sort((a, b) => a - b);
  const median = centers[centers.length >> 1];
  const kept = bands.filter((b) => Math.abs((b.top + b.bottom) / 2 - median) < height * 0.08);
  if (kept.length < need) return null;

  const pad = Math.round(height * 0.012);
  const top = Math.max(0, Math.min(...kept.map((b) => b.top)) - pad);
  const bottom = Math.min(height - 1, Math.max(...kept.map((b) => b.bottom)) + pad);
  // 자막은 보통 가운데 정렬 → 가장 넓은 폭을 화면 가운데 기준으로 좌우 대칭
  const halfSpan = Math.max(...kept.map((b) => Math.max(width / 2 - b.left, b.right - width / 2))) + pad;
  const left = Math.max(0, Math.round(width / 2 - halfSpan));
  const right = Math.min(width - 1, Math.round(width / 2 + halfSpan));
  return { rect: { left, top, width: right - left + 1, height: bottom - top + 1 }, frames: kept.map((b) => b.frame) };
}
