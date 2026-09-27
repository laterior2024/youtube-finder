import type { AspectRatio, GradientSettings, TextBlock, WorkingSlide } from '../types';
import { CJK_LANGS, fontOption, nearestWeight, type Lang } from './countries';
import { loadImage } from './files';

export const CANVAS_SIZES: Record<AspectRatio, [number, number]> = {
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
};

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

// 일본어·중국어 줄바꿈 규칙(금칙): 이 글자들은 줄 맨 앞에 오면 안 됩니다.
const NO_LINE_START = new Set('、。，．・：；？！ー～）」』】〕〉》’”﹐﹑﹒；：︰ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ%!?.,)]}'.split(''));

function tokenize(text: string, lang: Lang): string[] {
  if (CJK_LANGS.includes(lang)) {
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

interface WrappedLine {
  text: string;
  /** 사용자가 Enter로 나눈 몇 번째 줄에서 나온 것인지 (줄별 색 적용용) */
  para: number;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, lang: Lang): WrappedLine[] {
  const lines: WrappedLine[] = [];
  text.split('\n').forEach((paragraph, para) => {
    let line = '';
    for (const token of tokenize(paragraph, lang)) {
      const candidate = line + token;
      if (ctx.measureText(candidate).width <= maxW || line.trim() === '') {
        // 한 단어가 너무 길면 글자 단위로 자릅니다.
        if (ctx.measureText(candidate).width > maxW && line.trim() === '') {
          let piece = '';
          for (const ch of Array.from(token)) {
            if (ctx.measureText(piece + ch).width > maxW && piece) {
              lines.push({ text: piece, para });
              piece = ch;
            } else piece += ch;
          }
          line = piece;
        } else line = candidate;
      } else {
        lines.push({ text: line.trimEnd(), para });
        line = token.trimStart();
      }
    }
    lines.push({ text: line.trimEnd(), para });
  });
  return lines;
}

/** 줄별 색이 지정돼 있으면 그 색, 아니면 글자 상자의 기본 색 */
export function lineColor(b: TextBlock, para: number): string {
  return b.lineColors?.[para] || b.color;
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
  let lines: WrappedLine[] = [];
  for (let i = 0; i < 30; i++) {
    ctx.font = fontString(b, lang, size);
    lines = wrapText(ctx, text, boxW, lang);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l.text).width));
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

  for (const { text: line, para } of lines) {
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
    ctx.fillStyle = lineColor(b, para);
    ctx.fillText(line, anchorX, cy);
    ctx.restore();
    y += lh;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 사진 위(또는 아래)에 점점 진해지는 그라데이션을 깔아 글자가 잘 보이게 합니다.
 * 부드러움이 클수록 천천히 진해지고, 작을수록 금방 진해져요.
 */
function drawGradient(ctx: CanvasRenderingContext2D, g: GradientSettings | undefined, W: number, H: number) {
  if (!g?.enabled || g.opacity <= 0 || g.height <= 0) return;
  const [r, gr, b] = hexToRgb(g.color);
  const h = (Math.min(100, g.height) / 100) * H;
  const soft = Math.min(1, Math.max(0.1, g.softness));

  const paint = (edge: 'top' | 'bottom') => {
    // 0 = 안쪽(투명) → 1 = 가장자리(가장 진함)
    const inner = edge === 'bottom' ? H - h : h;
    const outer = edge === 'bottom' ? H : 0;
    const grad = ctx.createLinearGradient(0, inner, 0, outer);
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const k = Math.min(1, t / soft);
      const eased = k * k * (3 - 2 * k); // 부드러운 S자 곡선
      grad.addColorStop(t, `rgba(${r},${gr},${b},${(g.opacity * eased).toFixed(3)})`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, edge === 'bottom' ? H - h : 0, W, h);
  };

  if (g.position === 'bottom' || g.position === 'both') paint('bottom');
  if (g.position === 'top' || g.position === 'both') paint('top');
}

/** 슬라이드 한 장을 캔버스에 그립니다 (배경 → 어둡게 덮기 → 그라데이션 → 글자). */
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

  drawGradient(ctx, slide.gradient, W, H);

  for (const b of slide.textBlocks) await drawTextBlock(ctx, b, lang, W, H);
}

export async function slideToBlob(slide: WorkingSlide, lang: Lang, aspect: AspectRatio): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await renderSlide(canvas, slide, lang, aspect);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 저장 실패'))), 'image/png'),
  );
}
