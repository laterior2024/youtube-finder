import type { AspectRatio, SourceImage, Subtitle } from '../types';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했어요.'));
    img.src = src;
  });
}

/** 업로드한 이미지를 AI에 보내기 좋은 크기(긴 변 1536px)의 WebP로 줄입니다. */
export async function fileToSourceImage(file: File, maxSide = 1536): Promise<SourceImage> {
  if (file.size > 20 * 1024 * 1024) throw new Error('사진 한 장은 20MB 이하로 올려 주세요.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.round(img.naturalWidth * scale);
    const height = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/webp', 0.88), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function splitDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error('잘못된 이미지 데이터예요.');
  return { mimeType: match[1], data: match[2] };
}

/** 원본 비율에 가장 가까운 인스타그램 비율을 고릅니다. */
export function detectAspect(width: number, height: number): AspectRatio {
  const r = width / height;
  const options: [AspectRatio, number][] = [
    ['1:1', 1],
    ['4:5', 0.8],
    ['9:16', 9 / 16],
  ];
  return options.reduce((best, cur) => (Math.abs(cur[1] - r) < Math.abs(best[1] - r) ? cur : best))[0];
}

const downloads = new Set<() => void>();
export function clearDownloads() { for (const dispose of downloads) dispose(); }

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  const notice = document.createElement('div');
  notice.setAttribute('role', 'status');
  notice.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:1000;max-width:calc(100vw - 48px);padding:16px;border-radius:12px;background:#29243c;color:white;box-shadow:0 4px 24px #0005;font-size:14px';
  const label = document.createElement('span');
  label.textContent = '파일 준비 완료 · ';
  a.textContent = filename + ' 다시 받기';
  a.style.cssText = 'text-decoration:underline;color:#f9a8d4;overflow-wrap:anywhere';
  const close = document.createElement('button');
  close.textContent = '닫기';
  close.style.cssText = 'margin-left:16px';
  let timer: ReturnType<typeof setTimeout>;
  const dispose = () => { clearTimeout(timer); URL.revokeObjectURL(url); notice.remove(); downloads.delete(dispose); };
  downloads.add(dispose);
  close.onclick = dispose;
  notice.append(label, a, close);
  document.body.appendChild(notice);
  timer = setTimeout(dispose, 5 * 60 * 1000);
}

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

export function toSrt(subs: Subtitle[]): string {
  return subs.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}\n`).join('\n');
}
