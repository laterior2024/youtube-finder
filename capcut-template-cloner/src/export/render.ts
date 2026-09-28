/** TemplateSpec을 캔버스에 그린다 (미리보기, 투명 PNG 틀, 캡컷 소재 모두 이 함수로). */
import type { BoxLayer, Rect, TemplateSpec, TextStyle } from '../../spec/template-spec';
import { CAPTION_SAMPLES } from '../capcut/draft';
import { rectToPx } from '../lib/capcutMath';

export const FONT_STACK = `'Pretendard Variable', Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 만들기 실패'))), 'image/png'));
}

export function drawBox(ctx: CanvasRenderingContext2D, layer: BoxLayer, W: number, H: number) {
  const { left, top, width, height } = rectToPx(layer.rect, W, H);
  ctx.save();
  ctx.globalAlpha = layer.fill.opacity;
  if (layer.fill.type === 'linear-gradient' && layer.fill.colors.length > 1) {
    const g = ctx.createLinearGradient(left, top, left, top + height);
    layer.fill.colors.forEach((c, i) => g.addColorStop(i / (layer.fill.colors.length - 1), c));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = layer.fill.colors[0];
  }
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, layer.radiusPx);
  ctx.fill();
  if (layer.stroke && layer.stroke.widthPx > 0) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = layer.stroke.color;
    ctx.lineWidth = layer.stroke.widthPx;
    ctx.stroke();
  }
  ctx.restore();
}

/** 영상/로고 자리표시 (원본 로고는 절대 쓰지 않음) */
export function drawPlaceholder(ctx: CanvasRenderingContext2D, left: number, top: number, w: number, h: number, label: string, bg: string, fg: string) {
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(left, top, w, h);
  ctx.strokeStyle = fg;
  ctx.lineWidth = Math.max(2, Math.min(w, h) / 60);
  ctx.strokeRect(left + ctx.lineWidth / 2, top + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(left, top); ctx.lineTo(left + w, top + h);
  ctx.moveTo(left + w, top); ctx.lineTo(left, top + h);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const size = Math.max(12, Math.min(w, h) / 5);
  ctx.font = `700 ${size}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = bg;
  ctx.fillRect(left + w / 2 - tw / 2 - 8, top + h / 2 - size * 0.7, tw + 16, size * 1.4);
  ctx.fillStyle = fg;
  ctx.fillText(label, left + w / 2, top + h / 2);
  ctx.restore();
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, rect: Rect, style: TextStyle, W: number, H: number) {
  const { left, top, width, height } = rectToPx(rect, W, H);
  const lines = text.split('\n');
  const lineH = style.sizePx * style.lineHeight;
  ctx.save();
  ctx.font = `${style.font.weight} ${style.sizePx}px ${FONT_STACK}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = style.align;
  const x = style.align === 'left' ? left : style.align === 'right' ? left + width : left + width / 2;
  const startY = top + height / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((line, i) => {
    const y = startY + i * lineH;
    if (style.stroke && style.stroke.widthPx > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = style.stroke.widthPx * 2;
      ctx.strokeStyle = style.stroke.color;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}

export interface RenderOptions {
  video?: 'placeholder' | 'none';
  boxes?: boolean;
  logo?: 'placeholder' | 'none' | HTMLImageElement;
  text?: boolean;
  /** 자막 예시 몇 번째 문장을 그릴지 */
  captionIndex?: number;
}

export function renderSpec(ctx: CanvasRenderingContext2D, spec: TemplateSpec, opts: RenderOptions = {}) {
  const { widthPx: W, heightPx: H } = spec.canvas;
  const { video = 'placeholder', boxes = true, logo = 'placeholder', text = true, captionIndex = 0 } = opts;
  for (const layer of [...spec.layers].sort((a, b) => a.zIndex - b.zIndex)) {
    const p = rectToPx(layer.rect, W, H);
    if (layer.kind === 'video-area' && video === 'placeholder') drawPlaceholder(ctx, p.left, p.top, p.width, p.height, 'VIDEO', '#3A3A3A', '#9A9A9A');
    if (layer.kind === 'box' && boxes) drawBox(ctx, layer, W, H);
    if (layer.kind === 'logo' && logo !== 'none') {
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      if (logo === 'placeholder') drawPlaceholder(ctx, p.left, p.top, p.width, p.height, 'LOGO', '#FFFFFF', '#111111');
      else drawContain(ctx, logo, p.left, p.top, p.width, p.height);
      ctx.restore();
    }
    if (layer.kind === 'text-slot' && text) drawText(ctx, layer.sampleText, layer.rect, layer.style, W, H);
    if (layer.kind === 'caption' && text) drawText(ctx, CAPTION_SAMPLES[captionIndex % CAPTION_SAMPLES.length], layer.rect, layer.style, W, H);
  }
}

export function drawContain(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, left: number, top: number, w: number, h: number) {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, left + (w - dw) / 2, top + (h - dh) / 2, dw, dh);
}
