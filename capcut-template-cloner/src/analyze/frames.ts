/** 분석용 프레임 표현. 브라우저 ImageData와 같은 모양이라 Node 테스트에서도 그대로 쓸 수 있다. */
import type { RGB } from '../lib/color';

export interface Frame {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export function px(f: Frame, x: number, y: number): RGB {
  const i = (y * f.width + x) * 4;
  return [f.data[i], f.data[i + 1], f.data[i + 2]];
}

/** 표준 캔버스 크기 (세로 영상 1080×1920, 가로 영상 1920×1080, 정사각 1080×1080) */
export function canvasFor(width: number, height: number): { w: number; h: number; aspect: '9:16' | '16:9' | '1:1' | '4:5' } {
  const r = width / height;
  if (r < 0.7) return { w: 1080, h: 1920, aspect: '9:16' };
  if (r < 0.9) return { w: 1080, h: 1350, aspect: '4:5' };
  if (r < 1.2) return { w: 1080, h: 1080, aspect: '1:1' };
  return { w: 1920, h: 1080, aspect: '16:9' };
}

/** 가로·세로를 factor로 줄인 프레임 (박스 평균) */
export function downscale(f: Frame, factor: number): Frame {
  const w = Math.floor(f.width / factor);
  const h = Math.floor(f.height / factor);
  const out = new Uint8ClampedArray(w * h * 4);
  const n = factor * factor;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * f.width + (x * factor + dx)) * 4;
          r += f.data[i]; g += f.data[i + 1]; b += f.data[i + 2];
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}
