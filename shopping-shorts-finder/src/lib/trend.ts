import type { TrendInfo, VideoItem } from '../types';

/**
 * 🚀 떡상 점수 (0~100점)
 *
 * "지금 뜨고 있는 영상인가?"를 5가지로 따져서 합쳐요.
 *
 *  ① 하루 평균 조회수   (35%) — 올린 뒤 하루에 몇 번씩 보였나. 빠를수록 높아요.
 *  ② 채널 평소 대비     (25%) — 이 채널의 다른 영상보다 몇 배 더 보였나. (평소 1천 → 이번 5만이면 50배!)
 *  ③ 구독자 대비 조회수 (20%) — 구독자보다 몇 배 더 보였나. 구독자 밖으로 퍼졌다는 뜻이에요.
 *  ④ 신선도             (10%) — 최근에 올린 영상일수록 높아요.
 *  ⑤ 반응(좋아요+댓글)  (10%) — 본 사람 중 몇 %가 좋아요·댓글을 남겼나.
 *
 * 값을 모르는 항목(예: 구독자 숨김)은 빼고 나머지로 다시 계산해요.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function computeTrend(
  v: VideoItem,
  subs: number | null,
  channelMedian: number | null,
  growth: { perHour: number; sinceHours: number } | null,
  now = Date.now(),
): TrendInfo {
  const ageHours = Math.max(1, (now - new Date(v.publishedAt).getTime()) / 3_600_000);
  const viewsPerDay = v.views / (ageHours / 24);
  const subRatio = subs && subs > 0 ? v.views / subs : null;
  const channelRatio = channelMedian && channelMedian > 0 ? v.views / channelMedian : null;
  const engagement = v.views > 0 && v.likes !== null ? (v.likes + (v.comments ?? 0)) / v.views : null;

  // 하루 100회 → 0점, 1천 → 20점, 1만 → 40점, 10만 → 60점, 100만 → 80점, 1000만 → 100점
  const s1 = clamp((Math.log10(Math.max(viewsPerDay, 1)) - 2) * 20);
  // 채널 평소의 1배 → 30점, 2배 → 50점, 4배 → 70점, 8배 → 90점
  const s2 = channelRatio === null ? null : clamp(Math.log2(channelRatio) * 20 + 30);
  // 구독자의 1배 → 30점, 2배 → 45점, 4배 → 60점, 16배 → 90점
  const s3 = subRatio === null ? null : clamp(Math.log2(subRatio) * 15 + 30);
  // 하루 안 → 100점, 3일 → 80점, 1주 → 60점, 1달 → 35점, 그 뒤 → 15점
  const s4 = ageHours <= 24 ? 100 : ageHours <= 72 ? 80 : ageHours <= 168 ? 60 : ageHours <= 720 ? 35 : 15;
  // 반응 5% → 60점, 8% 이상 → 거의 만점
  const s5 = engagement === null ? null : clamp(engagement * 1200);

  const parts: [number | null, number][] = [
    [s1, 0.35],
    [s2, 0.25],
    [s3, 0.2],
    [s4, 0.1],
    [s5, 0.1],
  ];
  let sum = 0;
  let weight = 0;
  for (const [s, w] of parts) {
    if (s === null) continue;
    sum += s * w;
    weight += w;
  }
  const score = Math.round(weight > 0 ? sum / weight : 0);

  return {
    ageHours,
    viewsPerDay,
    subRatio,
    channelRatio,
    channelMedian,
    engagement,
    growthPerHour: growth?.perHour ?? null,
    growthSinceHours: growth?.sinceHours ?? null,
    score,
  };
}

export function trendLabel(score: number): { emoji: string; label: string; color: string } {
  if (score >= 75) return { emoji: '🚀', label: '지금 떡상 중', color: 'from-pink-500 to-orange-500' };
  if (score >= 55) return { emoji: '🔥', label: '뜨는 중', color: 'from-orange-500 to-amber-500' };
  if (score >= 35) return { emoji: '📈', label: '괜찮음', color: 'from-sky-500 to-cyan-500' };
  return { emoji: '😐', label: '평범', color: 'from-slate-500 to-slate-600' };
}

/** 가운데 값(중앙값). 너무 크거나 작은 영상 하나에 휘둘리지 않아요. */
export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
