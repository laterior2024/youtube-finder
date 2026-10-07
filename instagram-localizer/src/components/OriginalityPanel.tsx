import { useEffect, useMemo, useState } from 'react';
import type { CountryResult } from '../types';
import { friendlyError, type OriginalityCheck } from '../lib/gemini';
import {
  VERDICT_LABEL,
  compareImages,
  compareTexts,
  verdictFromSimilarity,
  type ImageSimilarity,
  type TextOverlap,
  type Verdict,
} from '../lib/similarity';
import { loadImage } from '../lib/files';

export interface AiCheckInput {
  originalCaption: string;
  newCaption: string;
  originalSlideTexts: string[];
  newSlideTexts: string[];
  imagePairs: { index: number; original: string; generated: string }[];
}

interface Props {
  result: CountryResult;
  originalCaption: string;
  /** AI 정밀 점검 실행 (Gemini) */
  onRunAi: (input: AiCheckInput) => Promise<OriginalityCheck>;
}

interface LocalCheck {
  images: { index: number; sim: ImageSimilarity | null; note: string }[];
  caption: TextOverlap;
  slideText: TextOverlap;
}

/** AI에 보낼 사진은 작게 줄여서 보내요 (요금·속도 절약). */
async function shrink(dataUrl: string, max = 768): Promise<string> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

function Badge({ verdict }: { verdict: Verdict }) {
  const v = VERDICT_LABEL[verdict];
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${v.cls}`}>
      {v.icon} {v.text}
    </span>
  );
}

function Bar({ value, verdict }: { value: number; verdict: Verdict }) {
  const color = verdict === 'safe' ? 'bg-emerald-400' : verdict === 'caution' ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(2, value)}%` }} />
    </div>
  );
}

function Row({
  icon,
  label,
  similarity,
  verdict,
  detail,
  children,
}: {
  icon: string;
  label: string;
  similarity: number | null;
  verdict: Verdict;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-black/30 p-3 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{icon}</span>
        <span className="min-w-0 flex-1 basis-40 text-sm font-semibold">{label}</span>
        {similarity !== null && <span className="tabular-nums text-sm text-white/70">유사도 {similarity}%</span>}
        <Badge verdict={verdict} />
      </div>
      {similarity !== null && (
        <div className="mt-2">
          <Bar value={similarity} verdict={verdict} />
        </div>
      )}
      {detail && <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">{detail}</p>}
      {children}
    </div>
  );
}

export default function OriginalityPanel({ result, originalCaption, onRunAi }: Props) {
  const { slides, localization: loc } = result;
  const [local, setLocal] = useState<LocalCheck | null>(null);
  const [ai, setAi] = useState<OriginalityCheck | null>(null);
  const [aiSignature, setAiSignature] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState('');

  const newCaption = [loc.caption, loc.ctaShare, loc.ctaComment].filter(Boolean).join('\n\n');
  const originalSlideTexts = slides.map((s) => s.textBlocks.map((b) => b.originalText).filter(Boolean).join(' / '));
  const newSlideTexts = slides.map((s) => s.textBlocks.map((b) => b.text).filter(Boolean).join(' / '));

  // 결과물이 바뀌었는지 알아보는 표시 (바뀌면 다시 점검해요)
  const signature = useMemo(
    () => JSON.stringify([newCaption, newSlideTexts, slides.map((s) => [s.sourceImage, s.background])]),
    [newCaption, newSlideTexts.join('|'), slides], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 무료 점검은 결과가 바뀔 때마다 자동으로 다시 해요.
  useEffect(() => {
    let cancelled = false;
    setLocal(null);
    const t = setTimeout(async () => {
      const images = await Promise.all(
        slides.map(async (s) => {
          if (!s.sourceImage) return { index: s.index, sim: null, note: '원본 사진 없음' };
          if (!s.background) return { index: s.index, sim: null, note: '사진 없이 원본 색 배경만 사용' };
          try {
            return { index: s.index, sim: await compareImages(s.sourceImage, s.background), note: '' };
          } catch {
            return { index: s.index, sim: null, note: '사진을 비교하지 못했어요' };
          }
        }),
      );
      if (cancelled) return;
      setLocal({
        images,
        caption: compareTexts(originalCaption, newCaption),
        slideText: compareTexts(originalSlideTexts.join('\n'), newSlideTexts.join('\n')),
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAi = async () => {
    setAiRunning(true);
    setAiError('');
    try {
      const pairs = slides.filter((s) => s.sourceImage && s.background).slice(0, 6);
      const imagePairs = await Promise.all(
        pairs.map(async (s) => ({ index: s.index, original: await shrink(s.sourceImage!), generated: await shrink(s.background!) })),
      );
      const out = await onRunAi({ originalCaption, newCaption, originalSlideTexts, newSlideTexts, imagePairs });
      // AI가 돌려준 순서대로 슬라이드 번호를 맞춰요.
      setAi({ ...out, images: out.images.slice(0, imagePairs.length).map((im, i) => ({ ...im, index: imagePairs[i].index })) });
      setAiSignature(signature);
    } catch (e) {
      setAiError(friendlyError(e));
    } finally {
      setAiRunning(false);
    }
  };

  const aiStale = !!ai && aiSignature !== signature;
  const aiNow = ai && !aiStale ? ai : null;

  // ───── 항목별 점수 계산 ─────
  type Item = { key: string; icon: string; label: string; similarity: number | null; verdict: Verdict; detail?: string; extra?: React.ReactNode };
  const items: Item[] = [];
  const weighted: { value: number; weight: number }[] = [];

  if (local) {
    const imageScores: number[] = [];
    for (const im of local.images) {
      const slide = slides.find((s) => s.index === im.index)!;
      const aiIm = aiNow?.images.find((x) => x.index === im.index);
      if (!im.sim) {
        items.push({
          key: `img${im.index}`,
          icon: '🖼️',
          label: `사진 ${im.index + 1}장`,
          similarity: null,
          verdict: 'unknown',
          detail: `${im.note} — 비교할 자료가 없어 판단을 보류해요.`,
        });
        continue;
      }
      const combined = aiIm ? Math.round((im.sim.total + aiIm.similarity) / 2) : im.sim.total;
      let verdict = verdictFromSimilarity(combined);
      const notes: string[] = [`구도 ${im.sim.structure}% · 밝기 흐름 ${im.sim.hash}% · 색 ${im.sim.color}%`];
      if (aiIm) notes.push(`AI 판단 ${aiIm.similarity}%`);
      if (slide.bgSource === 'ai-cleanup') {
        verdict = 'risk';
        notes.push('"원본에서 글자만 지우기"로 만든 사진이라 원본과 거의 같아요. 원작자 허락이 있을 때만 쓰세요');
      }
      if (slide.bgSource === 'upload') notes.push('직접 올린 사진이에요');
      if (aiIm?.sameIdentifiablePerson) {
        verdict = 'risk';
        notes.push('원본과 같은 실제 인물이 보여요 (초상권 주의)');
      }
      if (aiIm?.watermarkOrLogo) {
        if (verdict === 'safe') verdict = 'caution';
        notes.push('워터마크·로고·계정 이름이 보여요');
      }
      if (aiIm?.copiedElements.length) notes.push(`그대로 가져온 요소: ${aiIm.copiedElements.join(', ')}`);
      imageScores.push(combined);
      items.push({
        key: `img${im.index}`,
        icon: '🖼️',
        label: `사진 ${im.index + 1}장 (원본 ↔ 새 사진)`,
        similarity: combined,
        verdict,
        detail: notes.join(' · '),
        extra: (
          <div className="mt-2 flex items-center gap-2">
            <img src={slide.sourceImage!} className="h-16 w-12 rounded object-cover opacity-80" title="원본" />
            <span className="text-white/40">↔</span>
            <img src={slide.background!} className="h-16 w-12 rounded object-cover" title="새 사진" />
          </div>
        ),
      });
    }
    if (imageScores.length) weighted.push({ value: imageScores.reduce((a, b) => a + b, 0) / imageScores.length, weight: 0.5 });

    const textRow = (key: string, icon: string, label: string, overlap: TextOverlap, aiCloseness: number | undefined, weight: number, hasOriginal: boolean) => {
      if (!hasOriginal) {
        items.push({ key, icon, label, similarity: null, verdict: 'unknown', detail: '비교할 원본 글이 없어요.' });
        return;
      }
      const sim = aiCloseness !== undefined ? Math.max(overlap.overlap, aiCloseness) : overlap.overlap;
      const detail = [
        `원문 글자 그대로 일치 ${overlap.overlap}%`,
        aiCloseness !== undefined ? `직역 정도(AI) ${aiCloseness}%` : '다른 언어로 옮긴 경우 "직역 정도"는 AI 정밀 점검에서만 알 수 있어요',
        overlap.longestCopied ? `원문과 똑같은 부분: "${overlap.longestCopied.slice(0, 60)}${overlap.longestCopied.length > 60 ? '…' : ''}"` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      let verdict = verdictFromSimilarity(sim);
      if (overlap.longestCopied && verdict === 'safe') verdict = 'caution';
      weighted.push({ value: sim, weight });
      items.push({ key, icon, label, similarity: sim, verdict, detail });
    };
    textRow('caption', '📝', '설명글 (원본 문구 ↔ 새 문구)', local.caption, aiNow?.captionTranslationCloseness, 0.3, !!originalCaption.trim());
    textRow('slideText', '🔤', '사진 속 글자 (원본 ↔ 새 글자)', local.slideText, aiNow?.slideTextCloseness, 0.2, originalSlideTexts.some(Boolean));

    items.push({
      key: 'credit',
      icon: '🏷️',
      label: '출처(원작자) 표기',
      similarity: null,
      verdict: loc.creditLine ? 'safe' : 'caution',
      detail: loc.creditLine ? `설명글에 "${loc.creditLine}"가 들어가요.` : '원작자 계정을 적으면 설명글 끝에 출처가 들어가요. 넣는 걸 추천해요.',
    });
  }

  const totalWeight = weighted.reduce((a, w) => a + w.weight, 0);
  const avgSimilarity = totalWeight ? weighted.reduce((a, w) => a + w.value * w.weight, 0) / totalWeight : 0;
  const originality = Math.round(100 - avgSimilarity);
  let overall: Verdict = originality >= 65 ? 'safe' : originality >= 40 ? 'caution' : 'risk';
  // 하나라도 ❌ 위험이면 전체도 위험으로 봐요 (그 한 장만으로도 문제가 될 수 있어요).
  if (items.some((i) => i.verdict === 'risk')) overall = 'risk';
  if (items.some((i) => i.verdict === 'caution') && overall === 'safe' && originality < 80) overall = 'caution';
  if (overall !== 'risk' && (!totalWeight || items.some(i => i.verdict === 'unknown'))) overall = 'unknown';
  const counts = { safe: 0, caution: 0, risk: 0, unknown: 0 };
  items.forEach((i) => counts[i.verdict]++);

  return (
    <section className="rounded-2xl bg-white/[0.03] p-4 sm:p-5 ring-1 ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-bold">🛡️ 원본 유사도 참고 점검</h4>
          <p className="mt-0.5 text-xs text-white/50">원본 사진·문구와 새로 만든 사진·문구가 얼마나 비슷한지 재요. 비슷할수록 위험해요.</p>
        </div>
        <button
          onClick={runAi}
          disabled={aiRunning || !local}
          className="rounded-lg bg-pink-500 px-3 py-1.5 text-sm font-bold disabled:opacity-40"
        >
          {aiRunning ? 'AI가 비교하는 중…' : ai ? '🤖 AI 정밀 점검 다시 하기' : '🤖 AI 정밀 점검 (더 정확해요)'}
        </button>
      </div>

      {!local ? (
        <p className="mt-4 animate-pulse text-sm text-white/50">비교하는 중…</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-center">
              <div className="text-4xl font-extrabold tabular-nums">{overall === 'unknown' ? '—' : originality + '%'}</div>
              <div className="text-xs text-white/50">독창성 점수</div>
            </div>
            <div className="min-w-48 flex-1">
              <div className="mb-1.5 flex items-center gap-2">
                <Badge verdict={overall} />
                <span className="text-sm text-white/70">
                  {overall === 'unknown' ? '비교하지 못한 항목이 있어요. 안전 여부를 판단할 수 없어요.' : overall === 'safe'
                    ? '원본과 충분히 달라 보여요.'
                    : overall === 'caution'
                      ? '비슷한 부분이 있어요. 아래 ⚠️ 항목을 고쳐 보세요.'
                      : items.some((i) => i.verdict === 'risk')
                        ? '❌ 위험한 항목이 있어요. 그 항목을 고치기 전엔 올리지 마세요.'
                        : '원본과 많이 비슷해요. 그대로 올리지 마세요.'}
                </span>
              </div>
              <Bar value={originality} verdict={overall === 'safe' ? 'safe' : overall === 'caution' ? 'caution' : 'risk'} />
              <p className="mt-1.5 text-[11px] text-white/45">
                ➖ {counts.unknown}개 미확인 · ✅ {counts.safe}개 · ⚠️ {counts.caution}개 · ❌ {counts.risk}개 ·{' '}
                {aiNow ? 'AI는 비교 가능한 앞 6장까지만 반영돼요' : aiStale ? '내용이 바뀌어서 AI 점검을 다시 해야 해요' : '지금은 무료 점검만 반영됐어요'}
              </p>
            </div>
          </div>

          {aiError && <p className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">❌ {aiError}</p>}

          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {items.map((i) => (
              <Row key={i.key} icon={i.icon} label={i.label} similarity={i.similarity} verdict={i.verdict} detail={i.detail}>
                {i.extra}
              </Row>
            ))}
          </div>

          {aiNow && aiNow.captionCopiedPhrases.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-sm ring-1 ring-amber-400/20">
              <b className="text-amber-200">⚠️ 원문을 거의 그대로 옮긴 것 같은 문장</b>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-white/80">
                {aiNow.captionCopiedPhrases.map((p, i) => (
                  <li key={i}>&quot;{p}&quot;</li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-white/50">위 설명글 칸에서 직접 고치거나 &quot;🔄 다른 표현으로 다시 쓰기&quot;를 눌러 보세요.</p>
            </div>
          )}
          {aiNow && aiNow.tipsKo.length > 0 && (
            <div className="mt-3 text-sm">
              <b>💡 더 안전하게 만드는 방법</b>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-white/75">
                {aiNow.tipsKo.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-white/40">
            ⚖️ 이 점수는 비슷한 정도를 재는 <b>참고용 자동 지표</b>예요. 저작권 침해 여부를 법적으로 판단하는 도구가 아니에요. 사실·정보·주제 자체는 보통 저작권 대상이 아니지만, 원본의 사진과
            표현을 그대로 쓰면 문제가 될 수 있어요. 중요한 게시물은 원작자에게 허락을 받는 게 가장 안전해요.
          </p>
        </>
      )}
    </section>
  );
}
