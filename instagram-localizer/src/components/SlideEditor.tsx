import { useState } from 'react';
import type { Align, GradientPosition, GradientSettings, TextBlock, WorkingSlide } from '../types';
import { GRADIENT_PRESETS } from '../lib/gradient';
import { FONTS, fontOption } from '../lib/countries';
import { fileToDataUrl } from '../lib/files';

interface Props {
  slide: WorkingSlide;
  lang: 'ko' | 'ja' | 'es';
  onChange: (s: WorkingSlide) => void;
  onRegenerate: () => void;
  onApplyGradientToAll: (g: GradientSettings) => void;
  slideCount: number;
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
        <label className="flex items-center gap-1" title="글자 기본 색">
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

      <LineColors block={block} onChange={set} />

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

/** 글자 칸에서 Enter로 나눈 줄마다 다른 색을 고르는 곳 */
function LineColors({ block, onChange }: { block: TextBlock; onChange: (patch: Partial<TextBlock>) => void }) {
  const lines = block.text.split('\n');
  const on = !!block.lineColors?.length;
  const colorOf = (i: number) => (block.lineColors?.[i] || block.color).slice(0, 7);

  const setLine = (i: number, color: string) => {
    const next = lines.map((_, j) => block.lineColors?.[j] || block.color);
    next[i] = color;
    onChange({ lineColors: next });
  };

  return (
    <div className="mt-2 rounded-lg bg-white/[0.03] p-2 text-xs">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange({ lineColors: e.target.checked ? lines.map(() => block.color) : [] })}
        />
        🌈 줄마다 다른 색 쓰기
      </label>
      {on && (
        <div className="mt-2 grid gap-1.5">
          {lines.map((line, i) => (
            <label key={i} className="flex items-center gap-2">
              <input type="color" value={colorOf(i)} onChange={(e) => setLine(i, e.target.value)} />
              <span className="w-10 shrink-0 text-white/50">{i + 1}번째 줄</span>
              <span className="truncate rounded bg-black/40 px-1.5 py-0.5" style={{ color: colorOf(i) }}>
                {line.trim() || '(빈 줄)'}
              </span>
            </label>
          ))}
          <p className="text-[11px] text-white/40">
            {lines.length < 2
              ? '위 글자 칸에서 Enter를 눌러 줄을 나누면, 나눈 줄마다 색을 바꿀 수 있어요.'
              : '줄을 더 나누고 싶으면 위 글자 칸에서 Enter를 누르세요. 자동으로 넘어간 줄은 윗줄과 같은 색이에요.'}
          </p>
        </div>
      )}
    </div>
  );
}

function GradientPanel({
  gradient,
  onChange,
  onApplyToAll,
  slideCount,
}: {
  gradient: GradientSettings;
  onChange: (g: GradientSettings) => void;
  onApplyToAll: () => void;
  slideCount: number;
}) {
  const [applied, setApplied] = useState(false);
  const set = (patch: Partial<GradientSettings>) => onChange({ ...gradient, ...patch, enabled: patch.enabled ?? true });
  const positions: { id: GradientPosition; label: string }[] = [
    { id: 'bottom', label: '⬇️ 아래' },
    { id: 'top', label: '⬆️ 위' },
    { id: 'both', label: '↕️ 위+아래' },
  ];

  return (
    <section className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/10">
      <div className="flex items-center justify-between">
        <h4 className="font-bold">🌫️ 그라데이션</h4>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={gradient.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          켜기
        </label>
      </div>
      <p className="mt-1 text-[11px] text-white/40">사진 가장자리를 점점 어둡게 깔아서, 그 위의 글자가 또렷하게 보이게 해요.</p>

      <div className={`mt-3 grid gap-2 ${gradient.enabled ? '' : 'pointer-events-none opacity-40'}`}>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="w-[4.5rem] text-white/60">빠른 설정</span>
          {GRADIENT_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => set(p.value)}
              className="rounded bg-white/10 px-2 py-1 hover:bg-white/20"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="w-[4.5rem] text-white/60">위치</span>
          {positions.map((p) => (
            <button
              key={p.id}
              onClick={() => set({ position: p.id })}
              className={`rounded px-2 py-1 ${gradient.position === p.id ? 'bg-pink-500' : 'bg-white/10'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-[4.5rem] text-white/60">색</span>
          <input type="color" value={gradient.color.slice(0, 7)} onChange={(e) => set({ color: e.target.value })} />
          {['#000000', '#ffffff', '#1a1033', '#3b1d0f'].map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => set({ color: c })}
              className="h-5 w-5 rounded-full ring-1 ring-white/30"
              style={{ background: c }}
            />
          ))}
        </label>
        <Slider label="높이 (%)" value={gradient.height} min={10} max={100} step={1} onChange={(v) => set({ height: v })} />
        <Slider label="진하기" value={gradient.opacity} min={0} max={1} step={0.05} onChange={(v) => set({ opacity: v })} />
        <Slider label="부드러움" value={gradient.softness} min={0.1} max={1} step={0.05} onChange={(v) => set({ softness: v })} />
        <p className="text-[11px] text-white/40">
          높이: 얼마나 넓게 깔지 · 진하기: 가장 어두운 곳의 농도 · 부드러움: 클수록 자연스럽게, 작을수록 또렷한 띠처럼
        </p>
        <p className="text-[11px] text-amber-200/70">💡 글자가 검정처럼 어두운 색이면, 그라데이션 색을 흰색으로 바꿔야 글자가 잘 보여요.</p>
      </div>

      {slideCount > 1 && (
        <button
          onClick={() => {
            onApplyToAll();
            setApplied(true);
            setTimeout(() => setApplied(false), 1500);
          }}
          className="mt-3 w-full rounded-lg bg-white/10 py-1.5 text-sm hover:bg-white/15"
        >
          {applied ? '✅ 모든 장에 적용했어요' : `📑 이 설정을 모든 장(${slideCount}장)에 똑같이 적용`}
        </button>
      )}
    </section>
  );
}

export default function SlideEditor({ slide, lang, onChange, onRegenerate, onApplyGradientToAll, slideCount }: Props) {
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

      <GradientPanel
        gradient={slide.gradient}
        onChange={(gradient) => set({ gradient })}
        onApplyToAll={() => onApplyGradientToAll(slide.gradient)}
        slideCount={slideCount}
      />

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
