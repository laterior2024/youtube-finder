import { useState } from 'react';
import JSZip from 'jszip';
import type { AspectRatio, CountryCode, CountryResult, Localization, TextBlock, WorkingSlide } from '../types';
import { COUNTRIES, FONTS } from '../lib/countries';
import { slideToBlob } from '../lib/render';
import { HASHTAG_COUNT, cleanHashtags, finalCaption, friendlyError } from '../lib/gemini';
import { downloadBlob, toSrt } from '../lib/files';
import SlideCanvas from './SlideCanvas';
import SlideEditor from './SlideEditor';

interface Props {
  country: CountryCode;
  result: CountryResult;
  aspect: AspectRatio;
  onUpdateSlide: (index: number, slide: WorkingSlide) => void;
  onUpdateLocalization: (loc: Localization) => void;
  onRegenerate: (index: number) => void;
  onGenerateMissing: () => void;
  onRewriteCaption: () => Promise<void>;
  onApplyGradientToAll: (g: WorkingSlide['gradient']) => void;
}

function CopyButton({ text, label = '복사' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt('아래 글을 복사해 주세요 (Ctrl+C)', text);
        }
      }}
      className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
    >
      {done ? '✅ 복사됨' : `📋 ${label}`}
    </button>
  );
}

function CtaField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string, options: string[]) => void;
}) {
  return (
    <div className="rounded-lg bg-black/30 p-2.5 ring-1 ring-white/10">
      <div className="mb-1 text-xs font-semibold text-white/70">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value, options)}
        placeholder="비워 두면 설명글에 들어가지 않아요"
        className="w-full rounded-md bg-black/40 px-2.5 py-1.5 text-sm ring-1 ring-white/10 outline-none focus:ring-pink-400"
      />
      {options.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {options.map((o, i) => (
            <button
              key={i}
              title="누르면 이 문구로 바꿔요 (지금 문구는 후보로 옮겨져요)"
              onClick={() => {
                const next = [...options];
                next[i] = value;
                onChange(o, next.filter((x) => x.trim()));
              }}
              className="rounded-full bg-white/5 px-2.5 py-1 text-left text-xs text-white/75 ring-1 ring-white/10 hover:bg-pink-500/20 hover:text-white"
            >
              ↔ {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 배경색이 밝으면 어두운 글자, 어두우면 흰 글자 */
function readableTextColor(bg: string | undefined): string {
  const h = (bg ?? '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  if (Number.isNaN(n)) return '#ffffff';
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff';
}

const CTA_BLOCK_ID = 'cta-auto';

export default function CountryWorkspace({
  country,
  result,
  aspect,
  onUpdateSlide,
  onUpdateLocalization,
  onRegenerate,
  onGenerateMissing,
  onRewriteCaption,
  onApplyGradientToAll,
}: Props) {
  const info = COUNTRIES[country];
  const { localization: loc, slides } = result;
  const [selected, setSelected] = useState(0);
  const [zipping, setZipping] = useState(false);
  const current = slides[Math.min(selected, slides.length - 1)];
  const fullCaption = finalCaption(loc);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState('');
  const rewrite = async () => {
    setRewriting(true);
    setRewriteError('');
    try {
      await onRewriteCaption();
    } catch (e) {
      setRewriteError(friendlyError(e));
    } finally {
      setRewriting(false);
    }
  };
  const needsImage = (s: WorkingSlide) =>
    !s.background && s.bgStatus !== 'loading' && (s.backgroundType === 'photo' || s.backgroundType === 'illustration');
  const missing = slides.filter(needsImage).length;
  const loading = slides.filter((s) => s.bgStatus === 'loading').length;

  const fileBase = `${country}_slide`;

  const downloadOne = async (s: WorkingSlide) => {
    downloadBlob(await slideToBlob(s, info.lang, aspect), `${fileBase}_${String(s.index + 1).padStart(2, '0')}.png`);
  };

  const downloadZip = async () => {
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const s of slides) {
        zip.file(`${fileBase}_${String(s.index + 1).padStart(2, '0')}.png`, await slideToBlob(s, info.lang, aspect));
      }
      zip.file('caption.txt', fullCaption);
      if (loc.videoSubtitles.length) zip.file('subtitles.srt', toSrt(loc.videoSubtitles));
      if (loc.videoScenePrompts.length)
        zip.file('video_scene_prompts.txt', loc.videoScenePrompts.map((p, i) => `Scene ${i + 1}\n${p}`).join('\n\n'));
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `instagram_${country}.zip`);
    } finally {
      setZipping(false);
    }
  };

  /** 댓글·공유 CTA를 마지막 장 아래쪽에 글자로 넣습니다 (이미 넣었으면 문구만 바꿔요). */
  const addCtaToLastSlide = () => {
    const last = slides[slides.length - 1];
    const text = [loc.ctaComment, loc.ctaShare].map((l) => l.trim()).filter(Boolean).join('\n');
    if (!last || !text) return;
    const isPhoto = !!last.background || last.backgroundType === 'photo' || last.backgroundType === 'illustration';
    const existing = last.textBlocks.find((b) => b.id === CTA_BLOCK_ID);
    const textBlocks: TextBlock[] = existing
      ? last.textBlocks.map((b) => (b.id === CTA_BLOCK_ID ? { ...b, text, lineColors: [] } : b))
      : [
          ...last.textBlocks,
          {
            id: CTA_BLOCK_ID,
            role: 'cta',
            text,
            originalText: '',
            x: 8,
            y: 80,
            w: 84,
            h: 12,
            fontStyle: 'sans',
            fontFamily: FONTS[info.lang][0].family,
            fontWeight: 700,
            fontSizePct: 3.2,
            color: isPhoto ? '#ffffff' : readableTextColor(last.backgroundColors[0]),
            align: 'center',
            lineHeight: 1.4,
            italic: false,
            uppercase: false,
            strokeColor: '',
            shadow: isPhoto,
            highlightColor: '',
          },
        ];
    onUpdateSlide(last.index, {
      ...last,
      textBlocks,
      // 사진 배경이면 글자가 잘 보이도록 아래쪽 그라데이션을 켜 둡니다.
      gradient:
        isPhoto && !last.gradient.enabled ? { ...last.gradient, enabled: true, position: 'bottom' } : last.gradient,
    });
    setSelected(slides.length - 1);
  };

  const applyHook = (hook: string) => {
    const first = slides[0];
    if (!first?.textBlocks.length) return;
    const target =
      first.textBlocks.find((b) => b.role === 'headline') ??
      first.textBlocks.reduce((a, b) => (b.fontSizePct > a.fontSizePct ? b : a));
    onUpdateSlide(0, { ...first, textBlocks: first.textBlocks.map((b) => (b.id === target.id ? { ...b, text: hook } : b)) });
    setSelected(0);
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {slides.length > 0 && (
          <>
            <button
              onClick={downloadZip}
              disabled={zipping}
              className="rounded-xl bg-gradient-to-r from-pink-500 to-orange-400 px-4 py-2 font-bold disabled:opacity-50"
            >
              {zipping ? '묶는 중…' : '⬇️ 전체 다운로드 (ZIP)'}
            </button>
            {missing > 0 && (
              <button onClick={onGenerateMissing} className="rounded-xl bg-white/10 px-4 py-2 font-semibold hover:bg-white/15">
                🎨 빈 배경 {missing}장 AI로 만들기
              </button>
            )}
            {loading > 0 && <span className="text-sm text-amber-300">이미지 {loading}장 만드는 중…</span>}
          </>
        )}
      </div>

      {current && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div>
            <div className="relative mx-auto max-w-[520px] overflow-hidden rounded-xl ring-1 ring-white/10">
              <SlideCanvas slide={current} lang={info.lang} aspect={aspect} />
              {current.bgStatus === 'loading' && (
                <div className="absolute inset-x-0 top-0 bg-amber-500/90 py-1 text-center text-xs font-bold text-black">
                  배경 이미지 만드는 중…
                </div>
              )}
            </div>
            <div className="mt-2 flex justify-center">
              <button onClick={() => downloadOne(current)} className="text-sm text-pink-300 underline">
                이 장만 PNG로 저장
              </button>
            </div>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {slides.map((s, i) => (
                <button
                  key={s.index}
                  onClick={() => setSelected(i)}
                  className={`relative w-24 shrink-0 overflow-hidden rounded-lg ring-2 ${
                    i === selected ? 'ring-pink-400' : 'ring-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <SlideCanvas slide={s} lang={info.lang} aspect={aspect} />
                  <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-bold">{i + 1}</span>
                  {s.bgStatus === 'loading' && <span className="absolute inset-0 animate-pulse bg-amber-400/30" />}
                  {s.bgStatus === 'error' && <span className="absolute right-1 top-1 text-xs">⚠️</span>}
                </button>
              ))}
            </div>
          </div>
          <SlideEditor
            slide={current}
            lang={info.lang}
            onChange={(s) => onUpdateSlide(current.index, s)}
            onRegenerate={() => onRegenerate(current.index)}
            onApplyGradientToAll={onApplyGradientToAll}
            slideCount={slides.length}
          />
        </div>
      )}

      <section className="grid gap-4 rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10 lg:grid-cols-2">
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold">📝 설명글</h4>
            <div className="flex gap-2">
              <button
                onClick={rewrite}
                disabled={rewriting}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-50"
              >
                {rewriting ? '다시 쓰는 중…' : '🔄 다른 표현으로 다시 쓰기'}
              </button>
              <CopyButton text={fullCaption} label="최종 설명글 복사" />
            </div>
          </div>
          <p className="mb-2 text-xs text-white/50">
            원본의 내용·취지는 그대로 두고, 문장 표현만 새로 쓴 {info.nameKo}용 {info.languageKo} 설명글이에요. 없는 내용은 지어내지 않아요.
          </p>
          {rewriteError && <p className="mb-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">❌ {rewriteError}</p>}
          <textarea
            value={loc.caption}
            onChange={(e) => onUpdateLocalization({ ...loc, caption: e.target.value })}
            rows={10}
            className="w-full rounded-lg bg-black/40 px-3 py-2 text-sm ring-1 ring-white/10 outline-none focus:ring-pink-400"
          />

          <h5 className="mt-3 text-sm font-bold">📣 댓글·공유를 부르는 문구 (CTA)</h5>
          <p className="mt-0.5 text-[11px] text-white/45">
            본문 바로 뒤에 붙어요. 인스타는 댓글이 많고 &apos;친구에게 보내기&apos;가 많은 게시물을 더 많은 사람에게 보여줘요. 아래 후보를 누르면 바꿔 끼울 수 있어요.
          </p>
          <div className="mt-2 grid gap-3">
            <CtaField
              label="💬 댓글 유도"
              value={loc.ctaComment}
              options={loc.ctaCommentOptions}
              onChange={(ctaComment, ctaCommentOptions) => onUpdateLocalization({ ...loc, ctaComment, ctaCommentOptions })}
            />
            <CtaField
              label="📤 공유·저장 유도"
              value={loc.ctaShare}
              options={loc.ctaShareOptions}
              onChange={(ctaShare, ctaShareOptions) => onUpdateLocalization({ ...loc, ctaShare, ctaShareOptions })}
            />
            {slides.length > 0 && (
              <button
                onClick={addCtaToLastSlide}
                className="rounded-lg bg-white/10 py-1.5 text-sm hover:bg-white/15"
              >
                🖼️ 이 CTA 문구를 마지막 장 이미지에도 넣기
              </button>
            )}
          </div>

          <h5 className="mt-3 text-sm font-bold">#️⃣ 노출용 해시태그 3개 (설명글 맨 끝에 붙어요)</h5>
          <div className="mt-2 grid gap-2">
            {Array.from({ length: HASHTAG_COUNT }, (_, i) => (
              <div key={i}>
                <input
                  value={loc.hashtags[i] ?? ''}
                  onChange={(e) => {
                    const next = Array.from({ length: HASHTAG_COUNT }, (_, j) => loc.hashtags[j] ?? '');
                    next[i] = e.target.value.replace(/\s+/g, '');
                    onUpdateLocalization({ ...loc, hashtags: next });
                  }}
                  onBlur={() => onUpdateLocalization({ ...loc, hashtags: cleanHashtags(loc.hashtags, { strict: false }) })}
                  placeholder={`#해시태그${i + 1}`}
                  className="w-full rounded-lg bg-black/40 px-3 py-1.5 text-sm text-sky-300 ring-1 ring-white/10 outline-none focus:ring-pink-400"
                />
                {loc.hashtagReasons[i] && <p className="mt-0.5 pl-1 text-[11px] text-white/45">{loc.hashtagReasons[i]}</p>}
              </div>
            ))}
          </div>

          <h5 className="mt-4 text-sm font-bold">👀 최종 설명글 미리보기 (이대로 인스타에 붙여넣기)</h5>
          <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-neutral-900">
            {[
              { text: loc.caption.trim(), cls: '' },
              { text: [loc.ctaComment, loc.ctaShare].map((l) => l.trim()).filter(Boolean).join('\n'), cls: 'font-semibold text-pink-700' },
              { text: loc.creditLine.trim(), cls: 'text-neutral-500' },
              { text: loc.hashtags.filter(Boolean).join(' '), cls: 'text-sky-700' },
            ]
              .filter((p) => p.text)
              .map((p, i) => (
                <span key={i} className={p.cls}>
                  {i > 0 ? '\n\n' : ''}
                  {p.text}
                </span>
              ))}
          </div>
          <p className="mt-1 text-[11px] text-white/40">순서: 본문 → <span className="text-pink-300">CTA</span> → 출처 → <span className="text-sky-300">해시태그 3개</span></p>
        </div>
        <div className="grid content-start gap-4 text-sm">
          {loc.captionCheck.length > 0 && (
            <div>
              <h4 className="mb-1 font-bold">✅ 원본 내용 대조표</h4>
              <p className="mb-2 text-xs text-white/50">원본 요점이 빠지거나 지어낸 내용이 없는지 여기서 확인하세요.</p>
              <ul className="list-disc space-y-1 pl-5 text-white/80">
                {loc.captionCheck.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {loc.hookAlternatives.length > 0 && (
            <div>
              <h4 className="mb-2 font-bold">🪝 첫 장 제목 다른 버전</h4>
              <ul className="grid gap-1.5">
                {loc.hookAlternatives.map((h, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-black/30 px-3 py-2">
                    <span>{h}</span>
                    {slides.length > 0 && (
                      <button onClick={() => applyHook(h)} className="shrink-0 rounded bg-pink-500/80 px-2 py-0.5 text-xs">
                        적용
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {loc.postingTip && (
            <div>
              <h4 className="mb-1 font-bold">⏰ 올리기 좋은 시간</h4>
              <p className="whitespace-pre-line text-white/80">{loc.postingTip}</p>
            </div>
          )}
          {loc.culturalNotes.length > 0 && (
            <div>
              <h4 className="mb-1 font-bold">🌏 현지화하면서 바꾼 점</h4>
              <ul className="list-disc space-y-1 pl-5 text-white/80">
                {loc.culturalNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {(loc.videoSubtitles.length > 0 || loc.videoScenePrompts.length > 0) && (
        <section className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold">🎬 영상(릴스)용 자료</h4>
            {loc.videoSubtitles.length > 0 && (
              <button
                onClick={() => downloadBlob(new Blob([toSrt(loc.videoSubtitles)], { type: 'text/plain' }), `subtitles_${country}.srt`)}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm"
              >
                ⬇️ 자막 파일(.srt) 저장
              </button>
            )}
          </div>
          <p className="mb-3 text-xs text-white/50">
            자막 파일은 CapCut(캡컷)·브루 같은 편집 앱에 불러오면 바로 자막이 들어가요. 장면 설명은 Veo·Kling 같은 AI 영상 도구에 붙여넣어 새 영상을 만들 때 쓰세요.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {loc.videoSubtitles.length > 0 && (
              <div className="max-h-80 overflow-y-auto rounded-lg bg-black/30 p-3 text-sm">
                {loc.videoSubtitles.map((s, i) => (
                  <p key={i} className="py-0.5">
                    <span className="mr-2 tabular-nums text-white/40">{s.start.toFixed(1)}s</span>
                    {s.text}
                  </p>
                ))}
              </div>
            )}
            {loc.videoScenePrompts.length > 0 && (
              <div className="grid max-h-80 gap-2 overflow-y-auto">
                {loc.videoScenePrompts.map((p, i) => (
                  <div key={i} className="rounded-lg bg-black/30 p-3 text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <b>장면 {i + 1}</b>
                      <CopyButton text={p} />
                    </div>
                    {p}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
