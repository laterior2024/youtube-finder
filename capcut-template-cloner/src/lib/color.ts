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

export type HSL = [number, number, number]; // h 0~360, s 0~1, l 0~1

export function hexToHsl(hex: string): HSL {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex([h, s, l]: HSL): Hex {
  const hue = ((h % 360) + 360) % 360 / 360;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  s = clamp(s); l = clamp(l);
  if (s === 0) return rgbToHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgbToHex([f(hue + 1 / 3) * 255, f(hue) * 255, f(hue - 1 / 3) * 255]);
}

/** 색이 무채색(흰·검·회색)에 가까운가 */
export function isNeutral(hex: string): boolean {
  const [, s, l] = hexToHsl(hex);
  return s < 0.15 || l < 0.04 || l > 0.97;
}
