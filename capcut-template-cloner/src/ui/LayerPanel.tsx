/** 레이어 목록 + 선택한 레이어 속성 편집 */
import type { CaptionLayer, Layer, TextSlotLayer, TextStyle } from '../../spec/template-spec';
import { boxLayer, DEFAULT_FONT } from '../analyze/detect';
import { contrastRatio } from '../lib/color';
import { KIND_COLOR } from './Stage';

const KIND_NAME: Record<Layer['kind'], string> = {
  box: '박스', 'video-area': '영상 자리', 'text-slot': '고정 글자', caption: '자막', logo: '로고 자리',
};

interface Props {
  layers: Layer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Layer>) => void;
  onAdd: (layer: Layer) => void;
  onDelete: (id: string) => void;
  /** 스포이드: 원본에서 찍은 색을 cb로 넘긴다 */
  onPick: (cb: (hex: string) => void) => void;
  picking: boolean;
}

export function LayerPanel({ layers, selectedId, onSelect, onChange, onAdd, onDelete, onPick, picking }: Props) {
  const selected = layers.find((l) => l.id === selectedId) ?? null;
  const sorted = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-300">레이어</h3>
          <span className="text-[11px] text-neutral-500">점선 = 자동 분석 확신 낮음</span>
        </div>
        <ul className="space-y-1">
          {sorted.map((l) => (
            <li key={l.id}>
              <button
                onClick={() => onSelect(l.id)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${l.id === selectedId ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
              >
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: KIND_COLOR[l.kind] }} />
                <span className="flex-1 truncate">{l.label}</span>
                <span className="text-[11px] text-neutral-500">{KIND_NAME[l.kind]}</span>
                {l.confidence < 0.6 && <span title="확인 필요">⚠️</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-1">
          {([
            ['+ 박스', () => boxLayer({ x: 0.1, y: 0.1, w: 0.8, h: 0.1 }, '#000000', '새 박스', 1)],
            ['+ 제목', () => newText('text-slot')],
            ['+ 자막', () => newText('caption')],
            ['+ 로고', () => ({ id: uid('logo'), kind: 'logo', label: '로고 자리', rect: { x: 0.8, y: 0.03, w: 0.15, h: 0.08 }, zIndex: 5, confidence: 1, corner: 'top-right', opacity: 1 }) as Layer],
          ] as const).map(([label, make]) => (
            <button key={label} onClick={() => onAdd(make())} className="rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700">
              {label}
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="space-y-3 rounded-lg border border-neutral-700 p-3">
          <div className="flex items-center gap-2">
            <input
              value={selected.label}
              onChange={(e) => onChange(selected.id, { label: e.target.value })}
              className="flex-1 rounded bg-neutral-800 px-2 py-1 text-sm"
            />
            {selected.kind !== 'video-area' && (
              <button onClick={() => onDelete(selected.id)} className="rounded bg-red-900/60 px-2 py-1 text-xs hover:bg-red-800">삭제</button>
            )}
          </div>

          <RectFields layer={selected} onChange={(rect) => onChange(selected.id, { rect })} />

          {selected.kind === 'box' && (
            <>
              <ColorField label="박스 색" value={selected.fill.colors[0]} picking={picking}
                onChange={(c) => onChange(selected.id, { fill: { ...selected.fill, colors: [c, ...selected.fill.colors.slice(1)] } } as Partial<Layer>)}
                onPick={onPick} />
              <NumField label="불투명도 %" value={Math.round(selected.fill.opacity * 100)} min={0} max={100}
                onChange={(v) => onChange(selected.id, { fill: { ...selected.fill, opacity: v / 100 } } as Partial<Layer>)} />
              <NumField label="모서리 둥글기 px" value={selected.radiusPx} min={0} max={200}
                onChange={(v) => onChange(selected.id, { radiusPx: v } as Partial<Layer>)} />
            </>
          )}

          {selected.kind === 'logo' && (
            <NumField label="불투명도 %" value={Math.round(selected.opacity * 100)} min={0} max={100}
              onChange={(v) => onChange(selected.id, { opacity: v / 100 } as Partial<Layer>)} />
          )}

          {(selected.kind === 'text-slot' || selected.kind === 'caption') && (
            <TextFields layer={selected} picking={picking} onPick={onPick}
              onStyle={(style) => onChange(selected.id, { style } as Partial<Layer>)}
              onChange={(patch) => onChange(selected.id, patch as Partial<Layer>)} />
          )}
        </div>
      )}
    </div>
  );
}

function TextFields({ layer, onStyle, onChange, picking, onPick }: {
  layer: TextSlotLayer | CaptionLayer;
  onStyle: (s: TextStyle) => void;
  onChange: (patch: Partial<TextSlotLayer>) => void;
  picking: boolean;
  onPick: Props['onPick'];
}) {
  const s = layer.style;
  const set = (patch: Partial<TextStyle>) => onStyle({ ...s, ...patch });
  return (
    <>
      {layer.kind === 'text-slot' && (
        <label className="block text-xs text-neutral-400">
          예시 문구 (줄바꿈 가능)
          <textarea value={layer.sampleText} rows={2} onChange={(e) => onChange({ sampleText: e.target.value })}
            className="mt-1 w-full rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100" />
        </label>
      )}
      <NumField label="글자 크기 px (1080 기준)" value={s.sizePx} min={8} max={400} onChange={(v) => set({ sizePx: v })} />
      {s.lineColors?.length ? (
        <div className="space-y-1">
          {s.lineColors.map((c, i) => (
            <ColorField key={i} label={`${i + 1}번째 줄 색`} value={c} picking={picking} onPick={onPick}
              onChange={(v) => set({ lineColors: s.lineColors!.map((x, k) => (k === i ? (v as TextStyle['color']) : x)) })} />
          ))}
          <button type="button" onClick={() => set({ lineColors: undefined })} className="text-[11px] text-neutral-400 underline">모든 줄 같은 색으로</button>
        </div>
      ) : (
        <>
          <ColorField label="글자 색" value={s.color} onChange={(c) => set({ color: c as TextStyle['color'] })} picking={picking} onPick={onPick} />
          <button type="button" onClick={() => set({ lineColors: [s.highlightColor ?? '#FFD400', s.color] })} className="text-[11px] text-neutral-400 underline">줄마다 다른 색 쓰기</button>
        </>
      )}
      <ColorField label="강조색" value={s.highlightColor ?? '#FFD400'} onChange={(c) => set({ highlightColor: c as TextStyle['color'] })} picking={picking} onPick={onPick} />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="테두리 px" value={s.stroke?.widthPx ?? 0} min={0} max={40}
          onChange={(v) => set({ stroke: v > 0 ? { color: s.stroke?.color ?? '#000000', widthPx: v } : undefined })} />
        <ColorField label="테두리 색" value={s.stroke?.color ?? '#000000'} picking={picking} onPick={onPick}
          onChange={(c) => set({ stroke: { color: c as TextStyle['color'], widthPx: s.stroke?.widthPx || 6 } })} />
      </div>
      <label className="block text-xs text-neutral-400">
        정렬
        <select value={s.align} onChange={(e) => set({ align: e.target.value as TextStyle['align'] })}
          className="mt-1 w-full rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100">
          <option value="left">왼쪽</option><option value="center">가운데</option><option value="right">오른쪽</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-neutral-400">
        <input type="checkbox" checked={s.font.weight >= 700} onChange={(e) => set({ font: { ...s.font, weight: e.target.checked ? 800 : 400 } })} />
        굵게
      </label>
      <ContrastHint fg={s.color} stroke={s.stroke?.color} />
    </>
  );
}

function ContrastHint({ fg, stroke }: { fg: string; stroke?: string }) {
  if (!stroke) return null;
  const r = contrastRatio(fg, stroke);
  return (
    <p className={`text-[11px] ${r >= 4.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
      글자-테두리 대비 {r.toFixed(1)} : 1 {r >= 4.5 ? '✓ 잘 읽혀요' : '— 대비가 낮아요'}
    </p>
  );
}

function RectFields({ layer, onChange }: { layer: Layer; onChange: (r: Layer['rect']) => void }) {
  const r = layer.rect;
  const f = (k: keyof typeof r, label: string) => (
    <NumField label={label} value={Math.round(r[k] * 1000) / 10} min={0} max={100} step={0.1}
      onChange={(v) => onChange({ ...r, [k]: v / 100 })} />
  );
  return <div className="grid grid-cols-4 gap-1">{f('x', 'X %')}{f('y', 'Y %')}{f('w', '폭 %')}{f('h', '높이 %')}</div>;
}

function NumField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <label className="block text-[11px] text-neutral-400">
      {label}
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v))); }}
        className="mt-0.5 w-full rounded bg-neutral-800 px-1.5 py-1 text-sm text-neutral-100" />
    </label>
  );
}

function ColorField({ label, value, onChange, picking, onPick }: { label: string; value: string; onChange: (hex: string) => void; picking: boolean; onPick: Props['onPick'] }) {
  return (
    <label className="block text-[11px] text-neutral-400">
      {label}
      <div className="mt-0.5 flex items-center gap-1">
        <input type="color" value={value.toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-7 w-9 cursor-pointer rounded bg-transparent" />
        <input value={value} onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && onChange(e.target.value.toUpperCase())}
          className="w-20 rounded bg-neutral-800 px-1.5 py-1 font-mono text-xs text-neutral-100" />
        <button type="button" onClick={() => onPick(onChange)} title="원본에서 색 찍기"
          className={`rounded px-1.5 py-1 text-xs ${picking ? 'bg-amber-500 text-black' : 'bg-neutral-800 hover:bg-neutral-700'}`}>
          💧
        </button>
      </div>
    </label>
  );
}

function newText(kind: 'text-slot' | 'caption'): Layer {
  const style: TextStyle = {
    font: DEFAULT_FONT, alternatives: [], sizePx: kind === 'caption' ? 56 : 72, lineHeight: 1.2, letterSpacing: 0, align: 'center',
    color: '#FFFFFF', stroke: kind === 'caption' ? { color: '#000000', widthPx: 8 } : undefined,
  };
  if (kind === 'caption') {
    return { id: uid('caption'), kind, label: '자막', rect: { x: 0.08, y: 0.68, w: 0.84, h: 0.07 }, zIndex: 4, confidence: 1, style, maxCharsPerLine: 14, maxLines: 2, emphasisRule: 'none' };
  }
  return { id: uid('title'), kind, role: 'title', label: '제목', rect: { x: 0.06, y: 0.06, w: 0.88, h: 0.1 }, zIndex: 3, confidence: 1, style, maxLines: 2, sampleText: '여기에 제목을 쓰세요' };
}

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 7)}`;
