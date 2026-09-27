import { useState } from 'react';
import type { Align, TextBlock, WorkingSlide } from '../types';
import { FONTS, fontOption } from '../lib/countries';
import { fileToDataUrl } from '../lib/files';

interface Props {
  slide: WorkingSlide;
  lang: 'ko' | 'ja' | 'es';
  onChange: (s: WorkingSlide) => void;
  onRegenerate: () => void;
}

const Slider = ({
  label,
  value,
  min,
  max,
  step = 0.5,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) => (
  <label className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2 text-xs">
    <span className="text-white/60">{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    <span className="text-right tabular-nums text-white/60">{Math.round(value * 10) / 10}</span>
  </label>
);

function BlockEditor({
  block,
  lang,
  onChange,
  onDelete,
}: {
  block: TextBlock;
  lang: 'ko' | 'ja' | 'es';
  onChange: (b: TextBlock) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<TextBlock>) => onChange({ ...block, ...patch });
  const opt = fontOption(lang, block.fontFamily);

  return (
    <div className="rounded-xl bg-black/30 p-3 ring-1 ring-white/10">
      <div className="mb-1 flex items-center justify-between text-xs text-white/50">
        <span className="rounded bg-white/10 px-1.5 py-0.5">{block.role}</span>
        <button onClick={onDelete} className="text-red-300/80 hover:text-red-300">
          삭제
        </button>
      </div>
      <textarea
        value={block.text}
        onChange={(e) => set({ text: e.target.value })}
        rows={Math.min(5, Math.max(2, block.text.split('\n').length))}
        className="w-full rounded-lg bg-black/40 px-2 py-1.5 text-sm ring-1 ring-white/10 outline-none focus:ring-pink-400"
      />
      {block.originalText && <p className="mt-1 line-clamp-2 text-[11px] text-white/40">원문: {block.originalText}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <select
          value={opt.family}
          onChange={(e) => set({ fontFamily: e.target.value })}
          className="rounded bg-black/40 px-2 py-1 ring-1 ring-white/10"
        >
          {FONTS[lang].map((f) => (
            <option key={f.family} value={f.family}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={block.fontWeight}
          onChange={(e) => set({ fontWeight: Number(e.target.value) })}
          className="rounded bg-black/40 px-2 py-1 ring-1 ring-white/10"
        >
          {[300, 400, 500, 600, 700, 800, 900].map((w) => (
            <option key={w} value={w} disabled={!opt.weights.includes(w)}>
              굵기 {w}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1" title="글자 색">
          🎨
          <input type="color" value={block.color.slice(0, 7)} onChange={(e) => set({ color: e.target.value })} />
        </label>
        {(['left', 'center', 'right'] as Align[]).map((a) => (
          <button
            key={a}
            onClick={() => set({ align: a })}
            className={`rounded px-2 py-1 ${block.align === a ? 'bg-pink-500' : 'bg-white/10'}`}
          >
            {a === 'left' ? '왼쪽' : a === 'center' ? '가운데' : '오른쪽'}
          </button>
        ))}
      </div>

      <div className="mt-2">
        <Slider label="글자 크기" value={block.fontSizePct} min={1} max={20} step={0.1} onChange={(v) => set({ fontSizePct: v })} />
      </div>

      <button onClick={() => setOpen(!open)} className="mt-2 text-xs text-pink-300">
        {open ? '▲ 세부 설정 닫기' : '▼ 위치·꾸미기 세부 설정'}
      </button>
      {open && (
        <div className="mt-2 grid gap-1.5">
          <Slider label="가로 위치" value={block.x} min={0} max={100} onChange={(v) => set({ x: v })} />
          <Slider label="세로 위치" value={block.y} min={0} max={100} onChange={(v) => set({ y: v })} />
          <Slider label="상자 너비" value={block.w} min={5} max={100} onChange={(v) => set({ w: v })} />
          <Slider label="상자 높이" value={block.h} min={2} max={100} onChange={(v) => set({ h: v })} />
          <Slider label="줄 간격" value={block.lineHeight} min={0.9} max={2} step={0.05} onChange={(v) => set({ lineHeight: v })} />
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!block.highlightColor}
                onChange={(e) => set({ highlightColor: e.target.checked ? '#ffe14d' : '' })}
              />
              형광펜 배경
              {block.highlightColor && (
                <input type="color" value={block.highlightColor.slice(0, 7)} onChange={(e) => set({ highlightColor: e.target.value })} />
              )}
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={!!block.strokeColor}
                onChange={(e) => set({ strokeColor: e.target.checked ? '#000000' : '' })}
              />
              외곽선
              {block.strokeColor && (
                <input type="color" value={block.strokeColor.slice(0, 7)} onChange={(e) => set({ strokeColor: e.target.value })} />
              )}
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={block.shadow} onChange={(e) => set({ shadow: e.target.checked })} />
              그림자
            </label>
            {lang === 'es' && (
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={block.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} />
                대문자
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SlideEditor({ slide, lang, onChange, onRegenerate }: Props) {
  const set = (patch: Partial<WorkingSlide>) => onChange({ ...slide, ...patch });

  const addBlock = () =>
    set({
      textBlocks: [
        ...slide.textBlocks,
        {
          id: `s${slide.index}-new${Date.now()}`,
          role: 'body',
          text: '새 글자',
          originalText: '',
          x: 10,
          y: 45,
          w: 80,
          h: 10,
          fontStyle: 'sans',
          fontFamily: FONTS[lang][0].family,
          fontWeight: 700,
          fontSizePct: 5,
          color: '#ffffff',
          align: 'center',
          lineHeight: 1.25,
          italic: false,
          uppercase: false,
          strokeColor: '',
          shadow: true,
          highlightColor: '',
        },
      ],
    });

  return (
    <div className="grid gap-4">
      <section className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/10">
        <h4 className="mb-2 font-bold">🖼️ 배경 이미지</h4>
        {slide.bgStatus === 'loading' && <p className="text-sm text-amber-300">AI가 이미지를 그리는 중… (10~30초)</p>}
        {slide.bgStatus === 'error' && <p className="text-sm text-red-300">{slide.bgError}</p>}
        <label className="mt-1 block text-xs text-white/60">이미지 설명 (영어로 쓰면 가장 정확해요 · 고친 뒤 다시 만들기를 누르세요)</label>
        <textarea
          value={slide.imagePrompt}
          onChange={(e) => set({ imagePrompt: e.target.value })}
          rows={4}
          className="mt-1 w-full rounded-lg bg-black/40 px-2 py-1.5 text-xs ring-1 ring-white/10 outline-none focus:ring-pink-400"
        />
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <button
            onClick={onRegenerate}
            disabled={slide.bgStatus === 'loading'}
            className="rounded-lg bg-pink-500 px-3 py-1.5 font-semibold disabled:opacity-40"
          >
            🔄 {slide.background ? '다시 만들기' : 'AI로 만들기'}
          </button>
          <label className="cursor-pointer rounded-lg bg-white/10 px-3 py-1.5">
            📁 내 사진 쓰기
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) set({ background: await fileToDataUrl(f), bgStatus: 'done', bgError: '' });
                e.target.value = '';
              }}
            />
          </label>
          {slide.background && (
            <button onClick={() => set({ background: null, bgStatus: 'idle' })} className="rounded-lg bg-white/10 px-3 py-1.5">
              🎨 원본 색 배경으로
            </button>
          )}
        </div>
        <div className="mt-3">
          <Slider label="어둡게" value={slide.overlay} min={0} max={0.7} step={0.05} onChange={(v) => set({ overlay: v })} />
          <p className="mt-1 text-[11px] text-white/40">사진 위 글자가 잘 안 보이면 &quot;어둡게&quot;를 올려 보세요.</p>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-white/60">배경색</span>
          {slide.backgroundColors.map((c, i) => (
            <input
              key={i}
              type="color"
              value={c.slice(0, 7)}
              onChange={(e) => {
                const next = [...slide.backgroundColors];
                next[i] = e.target.value;
                set({ backgroundColors: next });
              }}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold">✏️ 글자</h4>
          <button onClick={addBlock} className="rounded-lg bg-white/10 px-3 py-1 text-sm">
            + 글자 추가
          </button>
        </div>
        {slide.textBlocks.length === 0 && <p className="text-sm text-white/50">이 슬라이드에는 글자가 없어요.</p>}
        {slide.textBlocks.map((b, i) => (
          <BlockEditor
            key={b.id}
            block={b}
            lang={lang}
            onChange={(nb) => set({ textBlocks: slide.textBlocks.map((x, j) => (j === i ? nb : x)) })}
            onDelete={() => set({ textBlocks: slide.textBlocks.filter((_, j) => j !== i) })}
          />
        ))}
      </section>
    </div>
  );
}
