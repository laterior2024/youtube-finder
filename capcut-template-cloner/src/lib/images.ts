import type { Frame } from '../analyze/frames';
import { canvasFor } from '../analyze/frames';

export interface Shot {
  name: string;
  url: string; // 표준 캔버스 크기로 맞춘 이미지 (data URL)
  frame: Frame;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 열 수 없어요'));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * 스크린샷들을 첫 장 비율 기준의 표준 캔버스(예: 1080×1920)로 맞춘다.
 * 비율이 조금 다르면 가운데 기준으로 잘라서(cover) 맞춘다.
 */
export async function loadShots(files: File[]): Promise<Shot[]> {
  const imgs = await Promise.all(files.map(async (f) => ({ name: f.name, img: await loadImage(await fileToDataUrl(f)) })));
  if (imgs.length === 0) return [];
  const { w, h } = canvasFor(imgs[0].img.naturalWidth, imgs[0].img.naturalHeight);
  return imgs.map(({ name, img }) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const data = ctx.getImageData(0, 0, w, h);
    return { name, url: c.toDataURL('image/jpeg', 0.9), frame: { width: w, height: h, data: data.data } };
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
