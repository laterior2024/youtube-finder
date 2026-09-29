import { useMemo, useState } from 'react';
import type { FormatChoice, ResultItem, ScanOptions, ScanResult, SortKey, Strictness } from './types';
import { REGIONS, TOPICS } from './lib/presets';
import { estimateUnits, PERIODS, runScan } from './lib/finder';
import { passes } from './lib/shopping';
import { DAILY_QUOTA, KEYS, load, quotaUsed, save } from './lib/storage';
import { downloadText, num, toCsv } from './lib/format';
import SettingsModal from './components/SettingsModal';
import ResultCard from './components/ResultCard';
import HowItWorks from './components/HowItWorks';
import { APP_NAME, APP_VERSION, CHANGELOG } from './version';

const DEFAULT_OPTIONS: ScanOptions = {
  topic: 'all',
  customKeyword: '',
  format: 'both',
  period: '7d',
  region: 'KR',
  depth: 1,
  order: 'viewCount',
  compareChannel: true,
};

interface ViewOptions {
  strictness: Strictness;
  sort: SortKey;
  show: FormatChoice;
  minViews: number;
  showRejected: boolean;
}

const DEFAULT_VIEW: ViewOptions = { strictness: 'normal', sort: 'trend', show: 'both', minViews: 0, showRejected: false };

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'trend', label: '🚀 떡상 점수 높은 순' },
  { id: 'perDay', label: '⚡ 하루 평균 조회수 순' },
  { id: 'channelRatio', label: '📊 채널 평소 대비 순' },
  { id: 'subRatio', label: '👥 구독자 대비 순' },
  { id: 'views', label: '👀 조회수 순' },
  { id: 'newest', label: '🆕 최신 순' },
];

function sortValue(r: ResultItem, key: SortKey): number {
  switch (key) {
    case 'trend':
      return r.trend.score;
    case 'views':
      return r.video.views;
    case 'perDay':
      return r.trend.viewsPerDay;
    case 'subRatio':
      return r.trend.subRatio ?? -1;
    case 'channelRatio':
      return r.trend.channelRatio ?? -1;
    case 'newest':
      return new Date(r.video.publishedAt).getTime();
  }
}

/** 저장 공간을 아끼려고 설명란은 앞부분만 남겨서 기억해요 */
function slim(result: ScanResult): ScanResult {
  return { ...result, items: result.items.map((r) => ({ ...r, video: { ...r.video, description: r.video.description.slice(0, 300) } })) };
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => load(KEYS.apiKey, ''));
  const [options, setOptions] = useState<ScanOptions>(() => ({ ...DEFAULT_OPTIONS, ...load<Partial<ScanOptions>>(KEYS.options, {}) }));
  const [view, setView] = useState<ViewOptions>(() => ({ ...DEFAULT_VIEW, ...load<Partial<ViewOptions>>(KEYS.view, {}) }));
  const [result, setResult] = useState<ScanResult | null>(() => load<ScanResult | null>(KEYS.lastResult, null));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(() => !load(KEYS.apiKey, ''));
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [used, setUsed] = useState(quotaUsed);

  const setOpt = <K extends keyof ScanOptions>(k: K, v: ScanOptions[K]) => {
    const next = { ...options, [k]: v };
    setOptions(next);
    save(KEYS.options, next);
  };
  const setV = <K extends keyof ViewOptions>(k: K, v: ViewOptions[K]) => {
    const next = { ...view, [k]: v };
    setView(next);
    save(KEYS.view, next);
  };

  const cost = estimateUnits(options);
  const left = Math.max(0, DAILY_QUOTA - used);

  async function search() {
    if (!apiKey) {
      setSettingsOpen(true);
      return;
    }
    setLoading(true);
    setError('');
    setProgress('검색 준비 중…');
    try {
      const res = await runScan(options, apiKey, setProgress);
      setResult(res);
      save(KEYS.lastResult, slim(res));
      // 검색한 형태에 맞춰 보기 필터도 맞춰 줘요
      if (options.format !== 'both') setV('show', options.format);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 났어요.');
    } finally {
      setLoading(false);
      setProgress('');
      setUsed(quotaUsed());
    }
  }

  const shown = useMemo(() => {
    if (!result) return [];
    return result.items
      .filter((r) => (view.showRejected ? true : passes(r.shopping.level, view.strictness)))
      .filter((r) => view.show === 'both' || r.video.format === view.show)
      .filter((r) => r.video.views >= view.minViews)
      .sort((a, b) => sortValue(b, view.sort) - sortValue(a, view.sort));
  }, [result, view]);

  const shoppingCount = result ? result.items.filter((r) => passes(r.shopping.level, view.strictness)).length : 0;
  const hotCount = shown.filter((r) => r.trend.score >= 55 && r.shopping.level !== 'no').length;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6">
      {/* 머리 */}
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="flex min-w-0 items-center gap-2 text-xl font-black sm:text-2xl">
          <span>🛒</span>
          <span className="truncate">{APP_NAME}</span>
          <button onClick={() => setChangelogOpen(true)} className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-xs font-bold text-white/70 hover:bg-white/20" title="버전별 바뀐 점 보기">
            v{APP_VERSION}
          </button>
        </h1>
        <button onClick={() => setSettingsOpen(true)} className="relative shrink-0 rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10">
          ⚙️<span className="hidden sm:inline"> 설정</span>
          {!apiKey && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500" />}
        </button>
      </header>
      <p className="mb-5 text-sm text-white/60">유튜브에서 <b className="text-white">쇼핑 영상(숏폼·롱폼)만</b> 골라서, <b className="text-white">지금 뜨고 있는지</b> 점수로 알려줘요.</p>

      {/* 검색 설정 */}
      <section className="mb-5 space-y-4 rounded-2xl border border-white/10 bg-[#151922] p-4 sm:p-5">
        <Field label="① 어떤 쇼핑 영상?">
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => (
              <Chip key={t.id} active={!options.customKeyword && options.topic === t.id} onClick={() => setOptions((o) => { const n = { ...o, topic: t.id, customKeyword: '' }; save(KEYS.options, n); return n; })}>
                {t.emoji} {t.name}
              </Chip>
            ))}
          </div>
          <input
            value={options.customKeyword}
            onChange={(e) => setOpt('customKeyword', e.target.value)}
            placeholder="✏️ 또는 상품 이름 직접 쓰기 (예: 선풍기, 텀블러)"
            className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-red-400"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="② 영상 형태">
            <Segment
              value={options.format}
              onChange={(v) => setOpt('format', v)}
              items={[
                ['both', '둘 다'],
                ['shorts', '📱 숏폼'],
                ['long', '🎬 롱폼'],
              ]}
            />
          </Field>
          <Field label="③ 올린 날짜">
            <Segment value={options.period} onChange={(v) => setOpt('period', v)} items={PERIODS.map((p) => [p.id, p.label] as const)} />
          </Field>
          <Field label="④ 나라">
            <Segment value={options.region} onChange={(v) => setOpt('region', v)} items={REGIONS.map((r) => [r.id, `${r.flag} ${r.name}`] as const)} />
          </Field>
          <Field label="⑤ 먼저 가져올 영상">
            <Segment
              value={options.order}
              onChange={(v) => setOpt('order', v)}
              items={[
                ['viewCount', '조회수 높은'],
                ['date', '최신'],
                ['relevance', '관련 높은'],
              ]}
            />
          </Field>
        </div>

        <details className="rounded-xl bg-white/5 p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-white/80">🔧 더 자세히 (몰라도 돼요)</summary>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={options.depth === 2} onChange={(e) => setOpt('depth', e.target.checked ? 2 : 1)} className="h-4 w-4 accent-red-500" />
              더 많이 찾기 (영상 2배, 포인트도 2배)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={options.compareChannel} onChange={(e) => setOpt('compareChannel', e.target.checked)} className="h-4 w-4 accent-red-500" />
              채널 평소 조회수와 비교하기 (추천! 조금 느려져요)
            </label>
          </div>
        </details>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            onClick={search}
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-red-500 to-pink-500 px-6 py-3 text-lg font-black text-white shadow-lg shadow-red-500/20 hover:brightness-110 disabled:opacity-50"
          >
            {loading ? '⏳ 찾는 중…' : '🔍 쇼핑 영상 찾기'}
          </button>
          <p className="text-xs text-white/55">
            이번 검색에 약 <b className="text-white">{num(cost)}</b>포인트 · 오늘 남은 포인트 약 <b className={left < cost ? 'text-red-300' : 'text-white'}>{num(left)}</b> / 10,000
            <br className="sm:hidden" /> <span className="text-white/40">(한국 시간 오후 4~5시에 다시 채워져요)</span>
          </p>
        </div>
        {loading && <p className="animate-pulse text-sm text-amber-300">{progress}</p>}
        {error && <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">😢 {error}</p>}
      </section>

      {!result && !loading && <Welcome hasKey={!!apiKey} onOpenSettings={() => setSettingsOpen(true)} />}

      {/* 결과 */}
      {result && (
        <section>
          <div className="mb-3 rounded-2xl border border-white/10 bg-[#151922] p-4">
            <p className="text-sm">
              영상 <b>{result.candidateCount}</b>개를 살펴봐서 <b className="text-emerald-300">쇼핑 영상 {shoppingCount}개</b>를 찾았어요.
              {hotCount > 0 && (
                <>
                  {' '}그중 <b className="text-orange-300">🔥 뜨는 영상 {hotCount}개</b>!
                </>
              )}
              <span className="text-white/45"> · {new Date(result.searchedAt).toLocaleString('ko-KR')} 검색 · {result.unitsUsed}포인트 사용</span>
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="쇼핑 판별 강도">
                <Segment
                  value={view.strictness}
                  onChange={(v) => setV('strictness', v)}
                  items={[
                    ['strict', '엄격'],
                    ['normal', '보통'],
                    ['loose', '느슨'],
                  ]}
                />
              </Field>
              <Field label="보여줄 형태">
                <Segment
                  value={view.show}
                  onChange={(v) => setV('show', v)}
                  items={[
                    ['both', '둘 다'],
                    ['shorts', '📱 숏폼'],
                    ['long', '🎬 롱폼'],
                  ]}
                />
              </Field>
              <Field label="정렬">
                <select value={view.sort} onChange={(e) => setV('sort', e.target.value as SortKey)} className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm">
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="최소 조회수">
                <select value={view.minViews} onChange={(e) => setV('minViews', Number(e.target.value))} className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm">
                  {[0, 1000, 10000, 50000, 100000, 500000, 1000000].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? '제한 없음' : `${num(n)}회 이상`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
              <span>엄격 = 쇼핑 링크·파트너스 문구가 있는 확실한 것만 · 보통 = 추천 · 느슨 = 애매한 것도</span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={view.showRejected} onChange={(e) => setV('showRejected', e.target.checked)} className="accent-red-500" />
                  제외된 영상도 보기
                </label>
                <button
                  onClick={() => downloadText(toCsv(shown), `쇼핑영상_${new Date().toISOString().slice(0, 10)}.csv`)}
                  disabled={shown.length === 0}
                  className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold text-white hover:bg-white/10 disabled:opacity-40"
                >
                  📥 엑셀로 받기
                </button>
              </div>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-white/60">
              조건에 맞는 영상이 없어요. 🙏
              <br />
              판별 강도를 <b>느슨</b>으로 바꾸거나, 올린 날짜를 늘리거나, 다른 주제로 찾아보세요.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((r, i) => (
                <ResultCard key={r.video.id} item={r} rank={i + 1} />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="mt-6">
        <HowItWorks />
      </div>

      {settingsOpen && (
        <SettingsModal
          apiKey={apiKey}
          onClose={() => setSettingsOpen(false)}
          onSave={(k) => {
            setApiKey(k);
            save(KEYS.apiKey, k);
            setSettingsOpen(false);
          }}
        />
      )}
      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}
    </div>
  );
}

function Welcome({ hasKey, onOpenSettings }: { hasKey: boolean; onOpenSettings: () => void }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#151922] p-5 text-sm leading-relaxed">
      <h2 className="mb-3 text-lg font-bold">👋 처음이세요? 이렇게 따라 하세요</h2>
      <ol className="list-decimal space-y-2 pl-5 text-white/80">
        <li className={hasKey ? 'text-white/40 line-through' : ''}>
          오른쪽 위 <button onClick={onOpenSettings} className="font-bold text-sky-300 underline">⚙️ 설정</button>을 눌러 <b>유튜브 API 키</b>를 넣어요. (키 받는 방법도 거기 있어요)
        </li>
        <li>
          위에서 <b>① 주제</b>를 하나 누르고, <b>② 형태 · ③ 날짜 · ④ 나라</b>를 골라요. 잘 모르겠으면 그대로 두세요.
        </li>
        <li>
          빨간 <b>🔍 쇼핑 영상 찾기</b> 버튼을 눌러요. 10~30초 기다리면 결과가 나와요.
        </li>
        <li>
          카드 맨 위 <b>🚀 떡상 점수</b>가 높을수록 지금 뜨는 영상이에요. 주황색으로 빛나는 🔥 숫자가 많을수록 좋아요.
        </li>
      </ol>
    </section>
  );
}

function Changelog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#151922] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">📝 버전별 바뀐 점</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10" aria-label="닫기">
            ✕
          </button>
        </div>
        {CHANGELOG.map((c) => (
          <div key={c.version} className="mb-4">
            <p className="font-bold">
              v{c.version} <span className="text-xs font-normal text-white/50">{c.date}</span>
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-white/75">
              {c.changes.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-white/80">{label}</p>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full border px-3 py-1.5 text-sm ${active ? 'border-red-400 bg-red-500/20 font-bold text-white' : 'border-white/15 text-white/70 hover:bg-white/10'}`}>
      {children}
    </button>
  );
}

function Segment<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: readonly (readonly [T, string])[] }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-xl bg-black/30 p-1">
      {items.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-sm ${value === id ? 'bg-white/15 font-bold text-white' : 'text-white/60 hover:text-white'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
