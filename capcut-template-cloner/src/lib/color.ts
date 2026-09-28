import type { Hex } from '../../spec/template-spec';

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

export function rgbToHex([r, g, b]: RGB): Hex {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function hexToRgb01(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
}

export function luma([r, g, b]: RGB): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 흰색/검정 근처 값은 정확히 #FFFFFF/#000000으로 맞춘다 (압축 노이즈 제거) */
export function snapColor(rgb: RGB, tolerance = 14): RGB {
  if (rgb.every((v) => v >= 255 - tolerance)) return [255, 255, 255];
  if (rgb.every((v) => v <= tolerance)) return [0, 0, 0];
  return rgb;
}

export function medianRgb(samples: RGB[]): RGB {
  if (samples.length === 0) return [0, 0, 0];
  const pick = (i: 0 | 1 | 2) => {
    const arr = samples.map((s) => s[i]).sort((a, b) => a - b);
    return arr[arr.length >> 1];
  };
  return [pick(0), pick(1), pick(2)];
}

/** WCAG 대비율 */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = hexToRgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
