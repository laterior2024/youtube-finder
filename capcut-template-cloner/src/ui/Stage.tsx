/** 원본 스크린샷 위에 틀 레이어를 겹쳐 보여주고, 드래그로 옮기고 크기를 바꾼다. */
import { useEffect, useRef } from 'react';
import type { Layer, Rect, TemplateSpec } from '../../spec/template-spec';
import { px } from '../analyze/frames';
import { rgbToHex } from '../lib/color';
import type { Shot } from '../lib/images';
import { renderSpec } from '../export/render';

export const KIND_COLOR: Record<Layer['kind'], string> = {
  box: '#38bdf8',
  'video-area': '#a3a3a3',
  'text-slot': '#f472b6',
  caption: '#facc15',
  logo: '#4ade80',
};

interface Props {
  spec: TemplateSpec;
  shot: Shot | null;
  mix: number; // 0 = 원본만, 1 = 재현만
  showFrames: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRect: (id: string, rect: Rect) => void;
  picking: boolean;
  onPick: (hex: string) => void;
  logo: HTMLImageElement | null;
  captionIndex: number;
}

export function Stage({ spec, shot, mix, showFrames, selectedId, onSelect, onRect, picking, onPick, logo, captionIndex }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { widthPx: W, heightPx: H } = spec.canvas;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    if (!shot) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    }
    renderSpec(ctx, spec, { video: shot ? 'none' : 'placeholder', logo: logo ?? 'placeholder', captionIndex });
  }, [spec, W, H, shot, logo, captionIndex]);

  const startDrag = (e: React.PointerEvent, layer: Layer, mode: 'move' | 'resize') => {
    if (picking) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(layer.id);
    const box = stageRef.current!.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, rect: { ...layer.rect } };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / box.width;
      const dy = (ev.clientY - start.y) / box.height;
      const r = start.rect;
      const next = mode === 'move'
        ? { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) }
        : { ...r, w: clamp(r.w + dx, 0.01, 1 - r.x), h: clamp(r.h + dy, 0.005, 1 - r.y) };
      onRect(layer.id, snap(next));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const pick = (e: React.MouseEvent) => {
    if (!picking || !shot) return;
    const box = stageRef.current!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - box.left) / box.width) * shot.frame.width);
    const y = Math.floor(((e.clientY - box.top) / box.height) * shot.frame.height);
    onPick(rgbToHex(px(shot.frame, clamp(x, 0, shot.frame.width - 1), clamp(y, 0, shot.frame.height - 1))));
  };

  return (
    <div
      ref={stageRef}
      className={`relative w-full select-none overflow-hidden rounded-lg bg-black ${picking ? 'cursor-crosshair' : ''}`}
      style={{ aspectRatio: `${W} / ${H}` }}
      onPointerDown={() => !picking && onSelect(null)}
      onClick={pick}
    >
      {shot && <img src={shot.url} alt="" className="absolute inset-0 h-full w-full" draggable={false} />}
      <canvas ref={canvasRef} width={W} height={H} className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: shot ? mix : 1 }} />
      {showFrames && !picking &&
        [...spec.layers].sort((a, b) => a.zIndex - b.zIndex).map((layer) => {
          const sel = layer.id === selectedId;
          const color = KIND_COLOR[layer.kind];
          return (
            <div
              key={layer.id}
              data-layer={layer.id}
              onPointerDown={(e) => startDrag(e, layer, 'move')}
              className="absolute cursor-move"
              style={{
                left: `${layer.rect.x * 100}%`, top: `${layer.rect.y * 100}%`,
                width: `${layer.rect.w * 100}%`, height: `${layer.rect.h * 100}%`,
                outline: `${sel ? 3 : 1.5}px ${layer.confidence < 0.6 ? 'dashed' : 'solid'} ${color}`,
                background: sel ? `${color}22` : 'transparent',
                zIndex: sel ? 50 : layer.zIndex + 10,
              }}
            >
              <span className="absolute left-0 top-0 rounded-br px-1 text-[10px] font-bold text-black" style={{ background: color }}>
                {layer.label}
              </span>
              {sel && (
                <div
                  onPointerDown={(e) => startDrag(e, layer, 'resize')}
                  className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-black"
                  style={{ background: color }}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** 0.1% 단위로 반올림 */
const snap = (r: Rect): Rect => ({ x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) });
const round = (v: number) => Math.round(v * 1000) / 1000;
