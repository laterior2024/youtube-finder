/**
 * 브라우저에 기억해 두는 것들
 * - API 키, 검색 설정, 마지막 검색 결과
 * - 영상별 조회수 기록 (다음에 검색할 때 "얼마나 늘었나" 계산용)
 * - 오늘 쓴 유튜브 포인트
 * 개인정보 보호(시크릿) 모드에서는 기억이 안 될 수 있지만, 앱은 그대로 동작해요.
 */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간이 꽉 찼거나 막혀 있으면 조용히 넘어가요.
  }
}

export const KEYS = {
  apiKey: 'ssf-api-key',
  options: 'ssf-options',
  view: 'ssf-view',
  lastResult: 'ssf-last-result',
  history: 'ssf-history',
  quota: 'ssf-quota',
} as const;

/* ───── 조회수 기록 ───── */

interface Snapshot {
  v: number; // 조회수
  t: number; // 기록한 시각
}

const MAX_HISTORY = 3000;

/**
 * 지난번 기록과 비교해서 시간당 몇 회씩 늘었는지 알려주고, 새 기록을 남겨요.
 * 30분이 안 지났으면 너무 짧아서 비교하지 않고, 옛 기록을 그대로 둬요.
 */
export function compareAndRecord(items: { id: string; views: number }[], now = Date.now()) {
  const history = load<Record<string, Snapshot>>(KEYS.history, {});
  const out = new Map<string, { perHour: number; sinceHours: number }>();
  for (const { id, views } of items) {
    const prev = history[id];
    const hours = prev ? (now - prev.t) / 3_600_000 : 0;
    if (prev && hours >= 0.5) {
      out.set(id, { perHour: Math.max(0, views - prev.v) / hours, sinceHours: hours });
      history[id] = { v: views, t: now };
    } else if (!prev) {
      history[id] = { v: views, t: now };
    }
  }
  const entries = Object.entries(history);
  if (entries.length > MAX_HISTORY) {
    entries.sort((a, b) => b[1].t - a[1].t);
    save(KEYS.history, Object.fromEntries(entries.slice(0, MAX_HISTORY)));
  } else {
    save(KEYS.history, history);
  }
  return out;
}

/* ───── 오늘 쓴 유튜브 포인트 ─────
 * 유튜브 포인트(할당량)는 미국 서부 시간 자정(한국 시간 오후 4~5시)에 10,000으로 다시 채워져요.
 */
export const DAILY_QUOTA = 10_000;

function quotaDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}

export function quotaUsed(): number {
  const q = load<{ day: string; used: number }>(KEYS.quota, { day: '', used: 0 });
  return q.day === quotaDay() ? q.used : 0;
}

export function addQuota(units: number) {
  save(KEYS.quota, { day: quotaDay(), used: quotaUsed() + units });
}
