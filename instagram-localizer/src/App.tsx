import { useCallback, useEffect, useRef, useState } from 'react';
import type { AspectRatio, CountryCode, CountryResult, Localization, PostAnalysis, Settings, WorkingSlide } from './types';
import { COUNTRIES } from './lib/countries';
import {
  analyzePost,
  createClient,
  friendlyError,
  generateBackground,
  localizePost,
  localizedBlocks,
  writeCaption,
} from './lib/gemini';
import { detectAspect } from './lib/files';
import { defaultGradient } from './lib/gradient';
import { loadSettings, saveSettings } from './lib/storage';
import SettingsModal from './components/SettingsModal';
import UploadPanel, { type UploadState } from './components/UploadPanel';
import CountryWorkspace from './components/CountryWorkspace';

type Results = Partial<Record<CountryCode, CountryResult>>;

interface GenJob {
  countries: CountryCode[];
  index: number;
  prompt: string;
}

const INITIAL_UPLOAD: UploadState = {
  sourceUrl: '',
  credit: '',
  caption: '',
  images: [],
  video: null,
  countries: ['KR', 'JP', 'ES'],
  imageMode: 'new',
  perCountryImages: true,
  autoImages: true,
  skipSolid: true,
};

const needsAiImage = (s: WorkingSlide, skipSolid: boolean) =>
  !skipSolid || s.backgroundType === 'photo' || s.backgroundType === 'illustration';

/** 작업을 동시에 limit개씩만 실행합니다 (API 한도 보호). */
async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift()!);
  });
  await Promise.all(workers);
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [upload, setUpload] = useState<UploadState>(INITIAL_UPLOAD);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState<PostAnalysis | null>(null);
  const [results, setResults] = useState<Results>({});
  const [aspect, setAspect] = useState<AspectRatio>('4:5');
  const [active, setActive] = useState<CountryCode | null>(null);
  /** 지금 보고 있는 화면: 원본 넣기(input) / 결과 편집(result) */
  const [view, setView] = useState<'input' | 'result'>('input');
  const resultsRef = useRef<Results>({});
  resultsRef.current = results;

  const addLog = useCallback((line: string) => setLog((l) => [...l, line]), []);
  const hasResults = Object.keys(results).length > 0;

  useEffect(() => {
    if (!settings.apiKey) setShowSettings(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasResults) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasResults]);

  const patchSlide = (country: CountryCode, index: number, patch: Partial<WorkingSlide>) =>
    setResults((prev) => {
      const r = prev[country];
      if (!r) return prev;
      return { ...prev, [country]: { ...r, slides: r.slides.map((s) => (s.index === index ? { ...s, ...patch } : s)) } };
    });

  const runJobs = async (jobs: GenJob[], asp: AspectRatio) => {
    const ai = createClient(settings.apiKey);
    jobs.forEach((j) => j.countries.forEach((c) => patchSlide(c, j.index, { bgStatus: 'loading', bgError: '' })));
    await runLimited(jobs, 2, async (job) => {
      const slide = resultsRef.current[job.countries[0]]?.slides.find((s) => s.index === job.index);
      if (!slide) return;
      try {
        const url = await generateBackground(ai, settings.imageModel, {
          mode: upload.imageMode,
          prompt: job.prompt,
          reference: slide.sourceImage,
          aspect: asp,
          textBlocks: slide.textBlocks,
        });
        job.countries.forEach((c) => patchSlide(c, job.index, { background: url, bgStatus: 'done', bgError: '' }));
      } catch (e) {
        job.countries.forEach((c) => patchSlide(c, job.index, { bgStatus: 'error', bgError: friendlyError(e) }));
      }
    });
  };

  /** 처음 만들 때: 설정에 따라 나라별로 따로, 또는 한 번 만들어 모든 나라에 공유합니다. */
  const initialJobs = (r: Results, a: PostAnalysis): GenJob[] => {
    const countries = Object.keys(r) as CountryCode[];
    const shared = !upload.perCountryImages || upload.imageMode === 'cleanup';
    const jobs: GenJob[] = [];
    const first = r[countries[0]];
    if (!first) return jobs;
    for (const slide of first.slides) {
      if (!needsAiImage(slide, upload.skipSolid)) continue;
      if (shared) jobs.push({ countries, index: slide.index, prompt: a.slides[slide.index]?.visualDescription ?? slide.imagePrompt });
      else for (const c of countries) jobs.push({ countries: [c], index: slide.index, prompt: r[c]!.slides[slide.index].imagePrompt });
    }
    return jobs;
  };

  const start = async () => {
    if (!settings.apiKey) {
      setShowSettings(true);
      return;
    }
    if (hasResults && !window.confirm('지금 만든 결과는 새 결과로 바뀌어요. 다시 만들까요?\n(지금 결과가 필요하면 먼저 "결과 편집" 탭에서 다운로드해 두세요)')) return;
    setView('result');
    setBusy(true);
    setError('');
    setLog([]);
    setAnalysis(null);
    setResults({});
    try {
      const ai = createClient(settings.apiKey);
      const a = await analyzePost(
        ai,
        settings.textModel,
        { images: upload.images, video: upload.video, caption: upload.caption, sourceUrl: upload.sourceUrl },
        addLog,
      );
      setAnalysis(a);
      addLog(`✅ 분석 완료 — 슬라이드 ${a.slides.length}장, 글자 ${a.slides.reduce((n, s) => n + s.textBlocks.length, 0)}덩어리를 찾았어요.`);

      const asp = upload.images[0] ? detectAspect(upload.images[0].width, upload.images[0].height) : '4:5';
      setAspect(asp);

      // 나라가 많으면 한꺼번에 보내지 않고 3개씩 나눠서 처리해요 (사용량 한도 보호).
      // 한 나라가 실패해도 나머지 나라는 계속 만들어요.
      const locs: Localization[] = [];
      const failed: string[] = [];
      await runLimited(upload.countries, 3, async (c) => {
        const info = COUNTRIES[c];
        addLog(`${info.flag} ${info.nameKo} 버전으로 현지화하는 중…`);
        try {
          const [slidesLoc, caption] = await Promise.all([
            localizePost(ai, settings.textModel, a, c),
            writeCaption(ai, settings.textModel, a, c, upload.credit.trim()),
          ]);
          locs.push({ ...slidesLoc, ...caption });
          addLog(`✅ ${info.flag} ${info.nameKo} 이미지 글자 · 설명글 · 해시태그 완성`);
        } catch (e) {
          failed.push(info.nameKo);
          addLog(`⚠️ ${info.flag} ${info.nameKo} 실패: ${friendlyError(e)}`);
        }
      });
      if (!locs.length) throw new Error('모든 나라의 현지화에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
      locs.sort((x, y) => upload.countries.indexOf(x.country) - upload.countries.indexOf(y.country));
      if (failed.length) addLog(`ℹ️ ${failed.join(', ')}은(는) 실패했어요. 그 나라만 골라서 다시 만들어 보세요.`);

      const r: Results = {};
      for (const loc of locs) {
        r[loc.country] = {
          localization: loc,
          slides: a.slides.map((s, i) => {
            const ls = loc.slides.find((x) => x.index === s.index) ?? loc.slides[i];
            return {
              index: s.index,
              backgroundType: s.backgroundType,
              backgroundColors: s.backgroundColors.length ? s.backgroundColors : ['#f4f1ea'],
              textBlocks: localizedBlocks(s.textBlocks, ls?.texts ?? [], loc.country),
              imagePrompt: ls?.imagePrompt || s.visualDescription,
              sourceImage: upload.images[i]?.dataUrl ?? null,
              background: null,
              bgStatus: 'idle',
              bgError: '',
              overlay: 0,
              gradient: defaultGradient(s.backgroundType),
            };
          }),
        };
      }
      resultsRef.current = r;
      setResults(r);
      setActive(locs[0].country);

      if (upload.autoImages) {
        const jobs = initialJobs(r, a);
        if (jobs.length) {
          addLog(`🎨 배경 이미지 ${jobs.length}장을 AI로 그리는 중… (완성되는 대로 화면에 나타나요)`);
          await runJobs(jobs, asp);
          addLog('✅ 이미지 생성 끝! 아래에서 글자를 다듬고 다운로드하세요.');
        }
      } else {
        addLog('✅ 완성! 배경은 슬라이드별로 "AI로 만들기"를 눌러 만들 수 있어요.');
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const regenerate = (country: CountryCode, index: number) => {
    const slide = results[country]?.slides.find((s) => s.index === index);
    if (slide) runJobs([{ countries: [country], index, prompt: slide.imagePrompt }], aspect);
  };

  const generateMissing = (country: CountryCode) => {
    const slides = results[country]?.slides ?? [];
    const jobs = slides
      .filter((s) => !s.background && s.bgStatus !== 'loading' && needsAiImage(s, true))
      .map((s) => ({ countries: [country], index: s.index, prompt: s.imagePrompt }));
    runJobs(jobs, aspect);
  };

  /** 한 장의 그라데이션 설정을 같은 나라의 모든 장에 똑같이 적용합니다. */
  const applyGradientToAll = (country: CountryCode, gradient: WorkingSlide['gradient']) =>
    setResults((prev) => {
      const r = prev[country];
      return r ? { ...prev, [country]: { ...r, slides: r.slides.map((s) => ({ ...s, gradient: { ...gradient } })) } } : prev;
    });

  /** 설명글만 같은 내용, 다른 표현으로 다시 씁니다. */
  const rewriteCaption = async (country: CountryCode) => {
    const current = results[country];
    if (!analysis || !current) return;
    const caption = await writeCaption(
      createClient(settings.apiKey),
      settings.textModel,
      analysis,
      country,
      upload.credit.trim(),
      current.localization.caption,
    );
    setResults((prev) => {
      const r = prev[country];
      return r ? { ...prev, [country]: { ...r, localization: { ...r.localization, ...caption } } } : prev;
    });
  };

  const reset = () => {
    if (hasResults && !window.confirm('지금 만든 결과가 사라져요. 처음부터 다시 할까요?')) return;
    setUpload(INITIAL_UPLOAD);
    setResults({});
    setAnalysis(null);
    setLog([]);
    setError('');
    setView('input');
  };

  const countries = Object.keys(results) as CountryCode[];
  const activeResult = active ? results[active] : undefined;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0d12]/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-extrabold">
              🌏 인스타 현지화 스튜디오
            </h1>
            <p className="text-xs text-white/50">해외 인기 게시물 → 10개 나라 버전으로</p>
          </div>
          <div className="flex gap-2">
            {(hasResults || analysis) && (
              <button onClick={reset} className="rounded-lg bg-white/10 px-3 py-2 text-sm">
                처음부터
              </button>
            )}
            <button onClick={() => setShowSettings(true)} className="rounded-lg bg-white/10 px-3 py-2 text-sm">
              ⚙️ 설정 {!settings.apiKey && <span className="ml-1 text-red-300">(키 필요)</span>}
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 px-4">
          {[
            { id: 'input' as const, label: '📥 1. 원본 넣기', enabled: true },
            { id: 'result' as const, label: '🎨 2. 결과 편집', enabled: hasResults || busy || !!analysis || log.length > 0 },
          ].map((t) => (
            <button
              key={t.id}
              disabled={!t.enabled}
              onClick={() => setView(t.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-30 ${
                view === t.id ? 'border-pink-400 text-white' : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              {t.label}
              {t.id === 'result' && busy && <span className="ml-1.5 inline-block animate-pulse text-amber-300">●</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6">
        {view === 'input' && (
          <>
            {(hasResults || busy) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pink-500/10 px-4 py-3 text-sm ring-1 ring-pink-400/30">
                <span>
                  {busy
                    ? '⏳ 지금 게시물을 만드는 중이에요. 결과 편집 탭에서 진행 상황을 볼 수 있어요.'
                    : '✅ 만든 결과가 그대로 있어요. 원본을 바꿔서 다시 만들면 지금 결과는 새 결과로 바뀌어요.'}
                </span>
                <button onClick={() => setView('result')} className="rounded-lg bg-pink-500 px-3 py-1.5 font-bold">
                  🎨 결과 편집으로 가기 →
                </button>
              </div>
            )}
            <UploadPanel state={upload} onChange={setUpload} onStart={start} busy={busy} />
          </>
        )}

        {view === 'result' && (log.length > 0 || error) && (
          <div className="rounded-2xl bg-black/40 p-4 text-sm ring-1 ring-white/10">
            {log.map((l, i) => (
              <p key={i} className="py-0.5">
                {l}
              </p>
            ))}
            {busy && <p className="animate-pulse py-0.5 text-white/50">⏳ 작업 중… 창을 닫지 마세요</p>}
            {error && (
              <p className="mt-2 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">
                ❌ {error}
                {hasResults ? '' : ' — "1. 원본 넣기" 탭에서 내용을 확인하고 다시 눌러 주세요.'}
              </p>
            )}
          </div>
        )}

        {view === 'result' && analysis && (
          <details open={!hasResults || undefined} className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10">
            <summary className="cursor-pointer font-bold">🔍 원본 분석 결과 — 왜 떡상했을까?</summary>
            <div className="mt-3 grid gap-4 text-sm lg:grid-cols-2">
              <div>
                <p className="text-white/80">{analysis.summaryKo}</p>
                <p className="mt-3 text-xs text-white/50">
                  후킹 공식: <span className="text-white/80">{analysis.hookPattern}</span> · 톤:{' '}
                  <span className="text-white/80">{analysis.tone}</span> · 비율: <span className="text-white/80">{aspect}</span>
                </p>
                {analysis.videoSummary && <p className="mt-3 text-white/70">🎬 {analysis.videoSummary}</p>}
              </div>
              <ul className="list-disc space-y-1 pl-5 text-white/80">
                {analysis.whyViral.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </details>
        )}

        {view === 'result' && hasResults && (
          <>
            <div className="flex gap-1 overflow-x-auto border-b border-white/10">
              {countries.map((c) => (
                <button
                  key={c}
                  onClick={() => setActive(c)}
                  className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 font-bold ${
                    active === c ? 'border-pink-400 text-white' : 'border-transparent text-white/50 hover:text-white/80'
                  }`}
                >
                  {COUNTRIES[c].flag} {COUNTRIES[c].nameKo}
                </button>
              ))}
            </div>
            {active && activeResult && (
              <CountryWorkspace
                key={active}
                country={active}
                result={activeResult}
                aspect={aspect}
                onUpdateSlide={(i, s) => patchSlide(active, i, s)}
                onUpdateLocalization={(loc) =>
                  setResults((prev) => ({ ...prev, [active]: { ...prev[active]!, localization: loc } }))
                }
                onRegenerate={(i) => regenerate(active, i)}
                onGenerateMissing={() => generateMissing(active)}
                onRewriteCaption={() => rewriteCaption(active)}
                onApplyGradientToAll={(g) => applyGradientToAll(active, g)}
              />
            )}
          </>
        )}

        <footer className="pt-6 text-center text-xs text-white/35">
          다른 사람의 게시물을 참고할 때는 원작자를 표기하고, 가능하면 허락을 받아 주세요. 똑같이 베끼기보다 내 나라에 맞게 새로 만들수록 더 잘 떠요.
        </footer>
      </main>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={(s) => {
            setSettings(s);
            saveSettings(s);
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}
