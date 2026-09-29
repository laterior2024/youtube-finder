import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import type {
  AspectRatio,
  CountryCode,
  ImageMode,
  Localization,
  PostAnalysis,
  PostInput,
  PostJob,
  Settings,
  SharedOptions,
  TextBlock,
  WorkingSlide,
} from './types';
import { COUNTRIES } from './lib/countries';
import {
  analyzePost,
  createClient,
  altTextFile,
  checkOriginality,
  finalCaption,
  friendlyError,
  generateBackground,
  localizePost,
  localizedBlocks,
  writeCaption,
} from './lib/gemini';
import { detectAspect, downloadBlob, fileToSourceImage, toSrt } from './lib/files';
import { defaultGradient } from './lib/gradient';
import { importInstagramPost } from './lib/apify';
import { slideToBlob } from './lib/render';
import { loadSettings, saveSettings } from './lib/storage';
import SettingsModal from './components/SettingsModal';
import InputScreen, { MAX_POSTS, hasContent } from './components/InputScreen';
import CountryWorkspace from './components/CountryWorkspace';

type Results = PostJob['results'];

/** 배경 이미지 한 장을 만드는 일. 필요한 재료를 미리 담아 둬서 도중에 화면이 바뀌어도 안전해요. */
interface GenJob {
  countries: CountryCode[];
  index: number;
  prompt: string;
  reference: string | null;
  textBlocks: TextBlock[];
  mode: ImageMode;
}

const DEFAULT_OPTIONS: SharedOptions = {
  countries: ['KR', 'JP', 'ES'],
  imageMode: 'new',
  perCountryImages: true,
  autoImages: true,
  skipSolid: true,
  dmOffer: '',
};

const emptyInput = (): PostInput => ({ sourceUrl: '', credit: '', caption: '', images: [], video: null });

let idCounter = 0;
const newPost = (): PostJob => ({
  id: `post-${Date.now()}-${idCounter++}`,
  input: emptyInput(),
  importing: false,
  importMessage: '',
  importError: '',
  importVideoUrl: '',
  status: 'draft',
  log: [],
  error: '',
  analysis: null,
  results: {},
  aspect: '4:5',
  active: null,
});

/** 비어 있는 게시물 칸 (사진·영상·링크가 하나도 없음) */
const isEmptyPost = (p: PostJob) => !hasContent(p.input) && !p.input.sourceUrl.trim();

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

const STATUS_ICON: Record<PostJob['status'], string> = {
  draft: '📝',
  queued: '⏳',
  running: '🔄',
  done: '✅',
  error: '❌',
};

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [posts, setPosts] = useState<PostJob[]>(() => [newPost()]);
  const [options, setOptions] = useState<SharedOptions>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [zipping, setZipping] = useState(false);
  /** 지금 보고 있는 화면: 원본 넣기(input) / 결과 편집(result) */
  const [view, setView] = useState<'input' | 'result'>('input');
  const [activePostId, setActivePostId] = useState<string | null>(null);

  // 오래 걸리는 작업 중에도 항상 최신 게시물 목록을 읽을 수 있게 따로 들고 있어요.
  const postsRef = useRef(posts);
  postsRef.current = posts;

  const hasResults = posts.some((p) => Object.keys(p.results).length > 0);
  const started = posts.filter((p) => p.status !== 'draft');
  const activePost = posts.find((p) => p.id === activePostId) ?? started[0];

  useEffect(() => {
    if (!settings.apiKey) setShowSettings(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasResults) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasResults]);

  // ───────────── 게시물 상태를 바꾸는 도우미 ─────────────

  const updatePost = (id: string, fn: (p: PostJob) => PostJob) =>
    setPosts((prev) => {
      const next = prev.map((p) => (p.id === id ? fn(p) : p));
      postsRef.current = next;
      return next;
    });
  const patchPost = (id: string, patch: Partial<PostJob>) => updatePost(id, (p) => ({ ...p, ...patch }));
  const addLog = (id: string, line: string) => updatePost(id, (p) => ({ ...p, log: [...p.log, line] }));
  const patchSlide = (id: string, country: CountryCode, index: number, patch: Partial<WorkingSlide>) =>
    updatePost(id, (p) => {
      const r = p.results[country];
      if (!r) return p;
      return {
        ...p,
        results: { ...p.results, [country]: { ...r, slides: r.slides.map((s) => (s.index === index ? { ...s, ...patch } : s)) } },
      };
    });
  const patchLocalization = (id: string, country: CountryCode, patch: Partial<Localization>) =>
    updatePost(id, (p) => {
      const r = p.results[country];
      return r ? { ...p, results: { ...p.results, [country]: { ...r, localization: { ...r.localization, ...patch } } } } : p;
    });

  /** 입력 내용을 비어 있는 게시물 칸부터 차례로 채우고, 모자라면 칸을 새로 만들어요 (최대 5개). */
  const fillPosts = (patches: Partial<PostInput>[]): string[] => {
    let next = [...postsRef.current];
    const ids: string[] = [];
    for (const patch of patches) {
      let target = next.find((p) => isEmptyPost(p) && !ids.includes(p.id));
      if (!target) {
        if (next.length >= MAX_POSTS) break;
        target = newPost();
        next.push(target);
      }
      const id = target.id;
      next = next.map((p) => (p.id === id ? { ...p, input: { ...p.input, ...patch } } : p));
      ids.push(id);
    }
    postsRef.current = next;
    setPosts(next);
    return ids;
  };

  // ───────────── 인스타 링크로 가져오기 (Apify) ─────────────

  const importPost = async (id: string) => {
    const post = postsRef.current.find((p) => p.id === id);
    if (!post) return;
    if (!settings.apifyEnabled || !settings.apifyToken) {
      setShowSettings(true);
      return;
    }
    patchPost(id, { importing: true, importError: '', importMessage: '', importVideoUrl: '' });
    try {
      const r = await importInstagramPost(post.input.sourceUrl, settings.apifyToken, settings.apifyActor, (m) =>
        patchPost(id, { importMessage: m }),
      );
      const parts = [
        `✅ 사진 ${r.input.images.length}장`,
        r.input.caption.trim() ? '설명글 ✓' : '설명글 없음',
        r.input.credit ? `원작자 ${r.input.credit}` : '',
        r.likes !== null ? `좋아요 ${r.likes.toLocaleString()}개` : '',
        r.skippedImages ? `⚠️ ${r.skippedImages}장은 못 가져왔어요` : '',
      ].filter(Boolean);
      updatePost(id, (p) => ({
        ...p,
        importing: false,
        importMessage: parts.join(' · '),
        importVideoUrl: r.videoUrl,
        input: { ...p.input, ...r.input },
      }));
    } catch (e) {
      patchPost(id, { importing: false, importMessage: '', importError: friendlyError(e) });
    }
  };

  const bulkLinks = async (urls: string[]) => {
    const ids = fillPosts(urls.map((sourceUrl) => ({ sourceUrl })));
    if (!settings.apifyEnabled || !settings.apifyToken) return;
    // Apify에 한꺼번에 몰리지 않게 2개씩 가져와요.
    await runLimited(ids, 2, importPost);
  };

  const bulkPhotos = async (files: File[]) => {
    const images = await Promise.all(files.filter((f) => f.type.startsWith('image/')).map((f) => fileToSourceImage(f)));
    fillPosts(images.map((img) => ({ images: [img] })));
  };

  // ───────────── 만들기 ─────────────

  const runJobs = async (postId: string, jobs: GenJob[], aspect: AspectRatio) => {
    const ai = createClient(settings.apiKey);
    jobs.forEach((j) => j.countries.forEach((c) => patchSlide(postId, c, j.index, { bgStatus: 'loading', bgError: '' })));
    await runLimited(jobs, 2, async (job) => {
      try {
        const url = await generateBackground(ai, settings.imageModel, {
          mode: job.mode,
          prompt: job.prompt,
          reference: job.reference,
          aspect,
          textBlocks: job.textBlocks,
        });
        const bgSource = job.mode === 'cleanup' ? ('ai-cleanup' as const) : ('ai-new' as const);
        job.countries.forEach((c) => patchSlide(postId, c, job.index, { background: url, bgStatus: 'done', bgError: '', bgSource }));
      } catch (e) {
        job.countries.forEach((c) => patchSlide(postId, c, job.index, { bgStatus: 'error', bgError: friendlyError(e) }));
      }
    });
  };

  /** 처음 만들 때: 설정에 따라 나라별로 따로, 또는 한 번 만들어 모든 나라에 공유합니다. */
  const initialJobs = (r: Results, a: PostAnalysis, opts: SharedOptions): GenJob[] => {
    const countries = Object.keys(r) as CountryCode[];
    const shared = !opts.perCountryImages || opts.imageMode === 'cleanup';
    const first = r[countries[0]];
    if (!first) return [];
    const jobs: GenJob[] = [];
    for (const slide of first.slides) {
      if (!needsAiImage(slide, opts.skipSolid)) continue;
      const base = { index: slide.index, reference: slide.sourceImage, textBlocks: slide.textBlocks, mode: opts.imageMode };
      if (shared) jobs.push({ ...base, countries, prompt: a.slides[slide.index]?.visualDescription ?? slide.imagePrompt });
      else for (const c of countries) jobs.push({ ...base, countries: [c], prompt: r[c]!.slides[slide.index].imagePrompt });
    }
    return jobs;
  };

  /** 게시물 하나를 처음부터 끝까지 만들어요: 분석 → 나라별 현지화 → 배경 이미지 */
  const processPost = async (id: string, opts: SharedOptions) => {
    const post = postsRef.current.find((p) => p.id === id);
    if (!post) return;
    const input = post.input;
    patchPost(id, { status: 'running', log: [], error: '', analysis: null, results: {}, active: null });
    const log = (line: string) => addLog(id, line);
    try {
      const ai = createClient(settings.apiKey);
      const a = await analyzePost(
        ai,
        settings.textModel,
        { images: input.images, video: input.video, caption: input.caption, sourceUrl: input.sourceUrl },
        log,
      );
      patchPost(id, { analysis: a });
      log(`✅ 분석 완료 — 슬라이드 ${a.slides.length}장, 글자 ${a.slides.reduce((n, s) => n + s.textBlocks.length, 0)}덩어리를 찾았어요.`);

      const aspect = input.images[0] ? detectAspect(input.images[0].width, input.images[0].height) : '4:5';

      // 나라가 많으면 한꺼번에 보내지 않고 3개씩 나눠서 처리해요 (사용량 한도 보호).
      // 한 나라가 실패해도 나머지 나라는 계속 만들어요.
      const locs: Localization[] = [];
      const failed: string[] = [];
      await runLimited(opts.countries, 3, async (c) => {
        const info = COUNTRIES[c];
        log(`${info.flag} ${info.nameKo} 버전으로 현지화하는 중…`);
        try {
          const [slidesLoc, caption] = await Promise.all([
            localizePost(ai, settings.textModel, a, c),
            writeCaption(ai, settings.textModel, a, c, input.credit.trim(), { dmOffer: opts.dmOffer }),
          ]);
          locs.push({ ...slidesLoc, ...caption });
          log(`✅ ${info.flag} ${info.nameKo} 이미지 글자 · 설명글 · 해시태그 완성`);
        } catch (e) {
          failed.push(info.nameKo);
          log(`⚠️ ${info.flag} ${info.nameKo} 실패: ${friendlyError(e)}`);
        }
      });
      if (!locs.length) throw new Error('모든 나라의 현지화에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
      locs.sort((x, y) => opts.countries.indexOf(x.country) - opts.countries.indexOf(y.country));
      if (failed.length) log(`ℹ️ ${failed.join(', ')}은(는) 실패했어요. 이 게시물을 다시 만들면 다시 시도해요.`);

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
              sourceImage: input.images[i]?.dataUrl ?? null,
              background: null,
              bgStatus: 'idle',
              bgError: '',
              overlay: 0,
              gradient: defaultGradient(s.backgroundType),
            };
          }),
        };
      }
      patchPost(id, { results: r, aspect, active: locs[0].country });

      if (opts.autoImages) {
        const jobs = initialJobs(r, a, opts);
        if (jobs.length) {
          log(`🎨 배경 이미지 ${jobs.length}장을 AI로 그리는 중… (완성되는 대로 화면에 나타나요)`);
          await runJobs(id, jobs, aspect);
          log('✅ 이미지 생성 끝! 아래에서 글자를 다듬고 다운로드하세요.');
        }
      } else {
        log('✅ 완성! 배경은 슬라이드별로 "AI로 만들기"를 눌러 만들 수 있어요.');
      }
      patchPost(id, { status: 'done' });
    } catch (e) {
      patchPost(id, { status: 'error', error: friendlyError(e) });
    }
  };

  /** 사진·영상이 있는 게시물을 모두, 하나씩 차례로 만들어요. */
  const startAll = async () => {
    if (!settings.apiKey) {
      setShowSettings(true);
      return;
    }
    const targets = postsRef.current.filter((p) => hasContent(p.input));
    if (!targets.length) return;
    if (
      hasResults &&
      !window.confirm('지금 만든 결과는 새 결과로 바뀌어요. 다시 만들까요?\n(지금 결과가 필요하면 먼저 "결과 편집" 탭에서 다운로드해 두세요)')
    )
      return;
    const opts = options;
    setPosts((prev) => {
      const next = prev.map((p) =>
        hasContent(p.input)
          ? { ...p, status: 'queued' as const, log: [], error: '', analysis: null, results: {}, active: null }
          : { ...p, status: 'draft' as const, log: [], error: '', analysis: null, results: {}, active: null },
      );
      postsRef.current = next;
      return next;
    });
    setActivePostId(targets[0].id);
    setView('result');
    setBusy(true);
    try {
      for (const t of targets) await processPost(t.id, opts);
    } finally {
      setBusy(false);
    }
  };

  const retryPost = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await processPost(id, options);
    } finally {
      setBusy(false);
    }
  };

  // ───────────── 편집 화면에서 쓰는 기능 ─────────────

  const regenerate = (post: PostJob, country: CountryCode, index: number) => {
    const slide = post.results[country]?.slides.find((s) => s.index === index);
    if (!slide) return;
    runJobs(
      post.id,
      [{ countries: [country], index, prompt: slide.imagePrompt, reference: slide.sourceImage, textBlocks: slide.textBlocks, mode: options.imageMode }],
      post.aspect,
    );
  };

  const generateMissing = (post: PostJob, country: CountryCode) => {
    const slides = post.results[country]?.slides ?? [];
    const jobs = slides
      .filter((s) => !s.background && s.bgStatus !== 'loading' && needsAiImage(s, true))
      .map((s) => ({
        countries: [country],
        index: s.index,
        prompt: s.imagePrompt,
        reference: s.sourceImage,
        textBlocks: s.textBlocks,
        mode: options.imageMode,
      }));
    runJobs(post.id, jobs, post.aspect);
  };

  /** 한 장의 그라데이션 설정을 같은 나라의 모든 장에 똑같이 적용합니다. */
  const applyGradientToAll = (id: string, country: CountryCode, gradient: WorkingSlide['gradient']) =>
    updatePost(id, (p) => {
      const r = p.results[country];
      return r
        ? { ...p, results: { ...p.results, [country]: { ...r, slides: r.slides.map((s) => ({ ...s, gradient: { ...gradient } })) } } }
        : p;
    });

  /** 설명글만 같은 내용, 다른 표현으로 다시 씁니다. */
  const rewriteCaption = async (post: PostJob, country: CountryCode) => {
    const current = post.results[country];
    if (!post.analysis || !current) return;
    const caption = await writeCaption(
      createClient(settings.apiKey),
      settings.textModel,
      post.analysis,
      country,
      post.input.credit.trim(),
      { dmOffer: options.dmOffer, previousCaption: current.localization.caption },
    );
    patchLocalization(post.id, country, caption);
  };

  /** 완성된 모든 게시물 · 모든 나라를 ZIP 하나로 받아요. */
  const downloadAll = async () => {
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const [pi, p] of postsRef.current.entries()) {
        const folder = `post-${String(pi + 1).padStart(2, '0')}`;
        for (const [c, r] of Object.entries(p.results) as [CountryCode, NonNullable<Results[CountryCode]>][]) {
          const info = COUNTRIES[c];
          for (const s of r.slides) {
            zip.file(`${folder}/${c}/${c}_slide_${String(s.index + 1).padStart(2, '0')}.png`, await slideToBlob(s, info.lang, p.aspect));
          }
          zip.file(`${folder}/${c}/caption.txt`, finalCaption(r.localization));
          zip.file(`${folder}/${c}/alt_text.txt`, altTextFile(r.localization));
          if (r.localization.videoSubtitles.length) zip.file(`${folder}/${c}/subtitles.srt`, toSrt(r.localization.videoSubtitles));
        }
      }
      downloadBlob(await zip.generateAsync({ type: 'blob' }), 'instagram_all_posts.zip');
    } finally {
      setZipping(false);
    }
  };

  const reset = () => {
    if (hasResults && !window.confirm('지금 만든 결과가 모두 사라져요. 처음부터 다시 할까요?')) return;
    const fresh = [newPost()];
    postsRef.current = fresh;
    setPosts(fresh);
    setActivePostId(null);
    setView('input');
  };

  const removePost = (id: string) => {
    const p = posts.find((x) => x.id === id);
    if (p && Object.keys(p.results).length && !window.confirm('이 게시물의 결과도 함께 지워져요. 삭제할까요?')) return;
    const next = posts.filter((x) => x.id !== id);
    const safe = next.length ? next : [newPost()];
    postsRef.current = safe;
    setPosts(safe);
  };

  const postNumber = (id: string) => posts.findIndex((p) => p.id === id) + 1;
  const doneCount = posts.filter((p) => p.status === 'done').length;
  const countries = activePost ? (Object.keys(activePost.results) as CountryCode[]) : [];
  const activeCountry = activePost?.active && activePost.results[activePost.active] ? activePost.active : countries[0];
  const activeResult = activePost && activeCountry ? activePost.results[activeCountry] : undefined;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b0d12]/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-extrabold">🌏 인스타 현지화 스튜디오</h1>
            <p className="text-xs text-white/50">해외 인기 게시물 → 10개 나라 버전으로 · 한 번에 최대 {MAX_POSTS}개</p>
          </div>
          <div className="flex gap-2">
            {(hasResults || started.length > 0) && (
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
            { id: 'result' as const, label: '🎨 2. 결과 편집', enabled: started.length > 0 },
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
            <InputScreen
              posts={posts}
              options={options}
              settings={settings}
              busy={busy}
              onChangeInput={(id, patch) => updatePost(id, (p) => ({ ...p, input: { ...p.input, ...patch } }))}
              onAddPost={() => posts.length < MAX_POSTS && setPosts([...posts, newPost()])}
              onRemovePost={removePost}
              onImport={importPost}
              onBulkLinks={bulkLinks}
              onBulkPhotos={bulkPhotos}
              onOptions={setOptions}
              onOpenSettings={() => setShowSettings(true)}
              onStart={startAll}
            />
          </>
        )}

        {view === 'result' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-1 gap-2 overflow-x-auto pb-1">
                {started.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePostId(p.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ring-1 transition ${
                      activePost?.id === p.id ? 'bg-pink-500 ring-pink-400' : 'bg-white/5 ring-white/10 hover:bg-white/10'
                    }`}
                  >
                    {p.input.images[0] && <img src={p.input.images[0].dataUrl} className="h-8 w-6 rounded object-cover" />}
                    게시물 {postNumber(p.id)}
                    <span className={p.status === 'running' ? 'animate-pulse' : ''}>{STATUS_ICON[p.status]}</span>
                  </button>
                ))}
              </div>
              {doneCount > 1 && (
                <button
                  onClick={downloadAll}
                  disabled={zipping || busy}
                  className="rounded-xl bg-gradient-to-r from-pink-500 to-orange-400 px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                  {zipping ? '묶는 중…' : `⬇️ 게시물 ${doneCount}개 전체 다운로드 (ZIP)`}
                </button>
              )}
            </div>

            {activePost && (
              <>
                {activePost.status === 'queued' && (
                  <div className="rounded-2xl bg-black/40 p-4 text-sm text-white/70 ring-1 ring-white/10">
                    ⏳ 차례를 기다리는 중이에요. 앞 게시물이 끝나면 자동으로 시작해요.
                  </div>
                )}

                {(activePost.log.length > 0 || activePost.error) && (
                  <div className="rounded-2xl bg-black/40 p-4 text-sm ring-1 ring-white/10">
                    {activePost.log.map((l, i) => (
                      <p key={i} className="py-0.5">
                        {l}
                      </p>
                    ))}
                    {activePost.status === 'running' && (
                      <p className="animate-pulse py-0.5 text-white/50">⏳ 작업 중… 창을 닫지 마세요</p>
                    )}
                    {activePost.error && (
                      <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-red-500/15 px-3 py-2 text-red-200">
                        <span className="flex-1">❌ {activePost.error}</span>
                        <button
                          onClick={() => retryPost(activePost.id)}
                          disabled={busy}
                          className="rounded-lg bg-white/10 px-3 py-1 text-white disabled:opacity-40"
                        >
                          🔄 이 게시물 다시 만들기
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {activePost.analysis && (
                  <details
                    open={!Object.keys(activePost.results).length || undefined}
                    className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10"
                  >
                    <summary className="cursor-pointer font-bold">🔍 원본 분석 결과 — 왜 떡상했을까?</summary>
                    <div className="mt-3 grid gap-4 text-sm lg:grid-cols-2">
                      <div>
                        <p className="text-white/80">{activePost.analysis.summaryKo}</p>
                        <p className="mt-3 text-xs text-white/50">
                          후킹 공식: <span className="text-white/80">{activePost.analysis.hookPattern}</span> · 톤:{' '}
                          <span className="text-white/80">{activePost.analysis.tone}</span> · 비율:{' '}
                          <span className="text-white/80">{activePost.aspect}</span>
                        </p>
                        {activePost.analysis.videoSummary && <p className="mt-3 text-white/70">🎬 {activePost.analysis.videoSummary}</p>}
                      </div>
                      <ul className="list-disc space-y-1 pl-5 text-white/80">
                        {activePost.analysis.whyViral.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  </details>
                )}

                {countries.length > 0 && activeCountry && activeResult && (
                  <>
                    <div className="flex gap-1 overflow-x-auto border-b border-white/10">
                      {countries.map((c) => (
                        <button
                          key={c}
                          onClick={() => patchPost(activePost.id, { active: c })}
                          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2 font-bold ${
                            activeCountry === c ? 'border-pink-400 text-white' : 'border-transparent text-white/50 hover:text-white/80'
                          }`}
                        >
                          {COUNTRIES[c].flag} {COUNTRIES[c].nameKo}
                        </button>
                      ))}
                    </div>
                    <CountryWorkspace
                      key={`${activePost.id}-${activeCountry}`}
                      country={activeCountry}
                      result={activeResult}
                      aspect={activePost.aspect}
                      onUpdateSlide={(i, s) => patchSlide(activePost.id, activeCountry, i, s)}
                      onUpdateLocalization={(loc) => patchLocalization(activePost.id, activeCountry, loc)}
                      onRegenerate={(i) => regenerate(activePost, activeCountry, i)}
                      onGenerateMissing={() => generateMissing(activePost, activeCountry)}
                      onRewriteCaption={() => rewriteCaption(activePost, activeCountry)}
                      onApplyGradientToAll={(g) => applyGradientToAll(activePost.id, activeCountry, g)}
                      originalCaption={activePost.analysis?.captionOriginal || activePost.input.caption}
                      onRunOriginalityCheck={(input) => checkOriginality(createClient(settings.apiKey), settings.textModel, input)}
                    />
                  </>
                )}
              </>
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
