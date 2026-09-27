import type { AspectRatio, TextBlock, WorkingSlide } from '../types';
import { fontOption, nearestWeight } from './countries';
import { loadImage } from './files';

export const CANVAS_SIZES: Record<AspectRatio, [number, number]> = {
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
};

type Lang = 'ko' | 'ja' | 'es';

const imageCache = new Map<string, Promise<HTMLImageElement>>();
function cachedImage(src: string) {
  let p = imageCache.get(src);
  if (!p) {
    p = loadImage(src);
    imageCache.set(src, p);
  }
  return p;
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function drawColorBackground(ctx: CanvasRenderingContext2D, colors: string[], W: number, H: number) {
  const list = colors.length ? colors : ['#f4f1ea'];
  if (list.length === 1) {
    ctx.fillStyle = list[0];
  } else {
    const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    list.forEach((c, i) => g.addColorStop(i / (list.length - 1), c));
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);
}

// 일본어 줄바꿈 규칙(금칙): 이 글자들은 줄 맨 앞에 오면 안 됩니다.
const NO_LINE_START = new Set('、。，．・：；？！ー～）」』】〕〉》’”ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ%!?.,)]}'.split(''));

function tokenize(text: string, lang: Lang): string[] {
  if (lang === 'ja') {
    const chars = Array.from(text);
    const tokens: string[] = [];
    for (const ch of chars) {
      if (tokens.length && NO_LINE_START.has(ch)) tokens[tokens.length - 1] += ch;
      else if (tokens.length && /[A-Za-z0-9]/.test(ch) && /[A-Za-z0-9]$/.test(tokens[tokens.length - 1]))
        tokens[tokens.length - 1] += ch;
      else tokens.push(ch);
    }
    return tokens;
  }
  return text.split(/(\s+)/).filter((t) => t.length > 0);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, lang: Lang): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const token of tokenize(paragraph, lang)) {
      const candidate = line + token;
      if (ctx.measureText(candidate).width <= maxW || line.trim() === '') {
        // 한 단어가 너무 길면 글자 단위로 자릅니다.
        if (ctx.measureText(candidate).width > maxW && line.trim() === '') {
          let piece = '';
          for (const ch of Array.from(token)) {
            if (ctx.measureText(piece + ch).width > maxW && piece) {
              lines.push(piece);
              piece = ch;
            } else piece += ch;
          }
          line = piece;
        } else line = candidate;
      } else {
        lines.push(line.trimEnd());
        line = token.trimStart();
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function fontString(b: TextBlock, lang: Lang, size: number) {
  const opt = fontOption(lang, b.fontFamily);
  const weight = nearestWeight(opt, b.fontWeight);
  const fallback = opt.style === 'serif' ? 'serif' : 'sans-serif';
  return `${b.italic ? 'italic ' : ''}${weight} ${Math.round(size)}px "${opt.family}", ${fallback}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

async function drawTextBlock(ctx: CanvasRenderingContext2D, b: TextBlock, lang: Lang, W: number, H: number) {
  const text = b.uppercase ? b.text.toUpperCase() : b.text;
  if (!text.trim()) return;

  const boxX = (b.x / 100) * W;
  const boxY = (b.y / 100) * H;
  const boxW = (b.w / 100) * W;
  const boxH = (b.h / 100) * H;
  const base = (b.fontSizePct / 100) * H;

  await document.fonts.load(fontString(b, lang, base), text).catch(() => undefined);

  // 번역하면 줄 수가 늘 수 있어서, 상자 높이를 최대 2.2배까지 먼저 늘려 봅니다.
  // 그래도 안 들어가면 글자 크기를 조금씩 줄입니다 (최소 원래 크기의 35%).
  const maxH = Math.min(boxH * 2.2, H * 0.9);
  let size = base;
  let lines: string[] = [];
  for (let i = 0; i < 30; i++) {
    ctx.font = fontString(b, lang, size);
    lines = wrapText(ctx, text, boxW, lang);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const total = lines.length * size * b.lineHeight;
    if ((total <= maxH && widest <= boxW * 1.02) || size <= base * 0.35) break;
    size *= 0.94;
  }
  ctx.font = fontString(b, lang, size);

  const lh = size * b.lineHeight;
  const total = lines.length * lh;
  let y = Math.min(Math.max(H * 0.02, boxY + (boxH - total) / 2), H * 0.98 - total);
  ctx.textBaseline = 'middle';
  ctx.textAlign = b.align;
  const anchorX = b.align === 'left' ? boxX : b.align === 'right' ? boxX + boxW : boxX + boxW / 2;

  for (const line of lines) {
    const cy = y + lh / 2;
    if (b.highlightColor && line.trim()) {
      const w = ctx.measureText(line).width;
      const padX = size * 0.25;
      const padY = size * 0.12;
      const left = b.align === 'left' ? anchorX : b.align === 'right' ? anchorX - w : anchorX - w / 2;
      ctx.save();
      ctx.fillStyle = b.highlightColor;
      roundRect(ctx, left - padX, cy - size / 2 - padY, w + padX * 2, size + padY * 2, size * 0.18);
      ctx.restore();
    }
    ctx.save();
    if (b.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = size * 0.18;
      ctx.shadowOffsetY = size * 0.06;
    }
    if (b.strokeColor) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, size * 0.14);
      ctx.strokeStyle = b.strokeColor;
      ctx.strokeText(line, anchorX, cy);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = b.color;
    ctx.fillText(line, anchorX, cy);
    ctx.restore();
    y += lh;
  }
}

/** 슬라이드 한 장을 캔버스에 그립니다 (배경 → 어둡게 덮기 → 글자). */
export async function renderSlide(canvas: HTMLCanvasElement, slide: WorkingSlide, lang: Lang, aspect: AspectRatio) {
  const [W, H] = CANVAS_SIZES[aspect];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  if (slide.background) {
    try {
      drawCover(ctx, await cachedImage(slide.background), W, H);
    } catch {
      drawColorBackground(ctx, slide.backgroundColors, W, H);
    }
  } else {
    drawColorBackground(ctx, slide.backgroundColors, W, H);
  }

  if (slide.overlay > 0) {
    ctx.fillStyle = `rgba(0,0,0,${slide.overlay})`;
    ctx.fillRect(0, 0, W, H);
  }

  for (const b of slide.textBlocks) await drawTextBlock(ctx, b, lang, W, H);
}

export async function slideToBlob(slide: WorkingSlide, lang: Lang, aspect: AspectRatio): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await renderSlide(canvas, slide, lang, aspect);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 저장 실패'))), 'image/png'),
  );
}
