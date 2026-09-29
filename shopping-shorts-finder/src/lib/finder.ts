import type { Period, ResultItem, ScanOptions, ScanResult, VideoItem } from '../types';
import { buildQuery, REGIONS } from './presets';
import { classifyShopping, passes } from './shopping';
import { computeTrend, median } from './trend';
import { compareAndRecord, quotaUsed } from './storage';
import { COST, getChannels, getRecentUploadIds, getVideoStats, getVideos, searchVideoIds, SHORTS_MAX_SEC } from './youtube';

/**
 * 🔎 쇼핑 영상 찾기 순서
 *
 *  1단계. 쇼핑 말로 유튜브 검색   (쇼핑 말 여러 개를 "|"로 묶어 한 번에)
 *  2단계. 영상 정보 받아오기      (조회수 · 좋아요 · 길이 · 설명란 · 태그)
 *  3단계. 숏폼/롱폼 나누기        (3분 이하 = 숏폼)
 *  4단계. 쇼핑 영상 판별          (쇼핑 링크 · 파트너스 문구 · 추천템 같은 말 → 점수)
 *  5단계. 채널 정보               (구독자 수)
 *  6단계. 채널 평소 조회수        (그 채널 최근 영상 20개의 가운데 값)
 *  7단계. 떡상 점수 계산
 */

const PERIOD_HOURS: Record<Period, number> = { '1d': 24, '3d': 72, '7d': 168, '30d': 720, '90d': 2160 };

export const PERIODS: { id: Period; label: string }[] = [
  { id: '1d', label: '24시간' },
  { id: '3d', label: '3일' },
  { id: '7d', label: '1주' },
  { id: '30d', label: '1달' },
  { id: '90d', label: '3달' },
];

/** 유튜브 검색은 길이를 "4분 미만 / 4~20분 / 20분 넘음"으로만 나눠 줘요. */
function durationsFor(format: ScanOptions['format']): ('short' | 'medium' | 'long')[] {
  if (format === 'shorts') return ['short'];
  if (format === 'long') return ['medium', 'long'];
  return ['short', 'medium'];
}

/** 이 설정으로 검색하면 포인트를 대략 얼마나 쓰는지 (검색 버튼 옆에 보여줘요) */
export function estimateUnits(o: ScanOptions): number {
  const searches = durationsFor(o.format).length * o.depth;
  return searches * COST.search + 3 + (o.compareChannel ? 60 : 3);
}

const MAX_CHANNEL_COMPARE = 60;

export async function runScan(o: ScanOptions, key: string, progress: (msg: string) => void): Promise<ScanResult> {
  const before = quotaUsed();
  const region = REGIONS.find((r) => r.id === o.region) ?? REGIONS[0];
  const q = buildQuery(o.topic, o.customKeyword, o.region);
  const publishedAfter = new Date(Date.now() - PERIOD_HOURS[o.period] * 3_600_000).toISOString();

  // 1단계
  const ids = new Set<string>();
  const durations = durationsFor(o.format);
  for (const [i, duration] of durations.entries()) {
    let pageToken: string | undefined;
    for (let page = 0; page < o.depth; page++) {
      progress(`1/4 유튜브에서 쇼핑 영상 찾는 중… (${i * o.depth + page + 1}/${durations.length * o.depth})`);
      const res = await searchVideoIds({ q, order: o.order, publishedAfter, regionCode: region.id, lang: region.lang, duration, pageToken }, key);
      res.ids.forEach((id) => ids.add(id));
      pageToken = res.next;
      if (!pageToken) break;
    }
  }

  // 2~4단계
  progress(`2/4 영상 ${ids.size}개의 정보를 받아서 쇼핑 영상인지 확인하는 중…`);
  const videos = (await getVideos([...ids], key)).filter((v) => o.format === 'both' || v.format === o.format);
  const judged = videos.map((v) => ({ video: v, shopping: classifyShopping(v) }));

  // 5단계: 쇼핑일 수도 있는 영상의 채널만 (포인트 아끼기)
  const shoppingish = judged.filter((j) => passes(j.shopping.level, 'loose'));
  const channelIds = [...new Set(shoppingish.map((j) => j.video.channelId))];
  progress(`3/4 채널 ${channelIds.length}곳의 구독자 수를 확인하는 중…`);
  const channels = channelIds.length ? await getChannels(channelIds, key) : new Map();

  // 6단계
  const baselines = new Map<string, { id: string; views: number; format: 'shorts' | 'long'; ageHours: number }[]>();
  if (o.compareChannel && shoppingish.length) {
    // 조회수 높은 영상의 채널부터 비교해요
    const ordered = [...new Set([...shoppingish].sort((a, b) => b.video.views - a.video.views).map((j) => j.video.channelId))].slice(0, MAX_CHANNEL_COMPARE);
    const uploads: { channelId: string; ids: string[] }[] = [];
    let done = 0;
    await pool(ordered, 6, async (cid) => {
      const pl = channels.get(cid)?.uploadsPlaylist;
      if (pl) uploads.push({ channelId: cid, ids: await getRecentUploadIds(pl, key) });
      progress(`4/4 채널 평소 조회수와 비교하는 중… (${++done}/${ordered.length})`);
    });
    const stats = await getVideoStats([...new Set(uploads.flatMap((u) => u.ids))], key);
    const byId = new Map(stats.map((s) => [s.id, s]));
    for (const u of uploads) {
      baselines.set(
        u.channelId,
        u.ids.flatMap((id) => {
          const s = byId.get(id);
          if (!s || s.durationSec === 0) return [];
          return [{ id, views: s.views, format: s.durationSec <= SHORTS_MAX_SEC ? ('shorts' as const) : ('long' as const), ageHours: (Date.now() - new Date(s.publishedAt).getTime()) / 3_600_000 }];
        }),
      );
    }
  }

  // 7단계
  const growth = compareAndRecord(videos.map((v) => ({ id: v.id, views: v.views })));
  const items: ResultItem[] = judged.map(({ video, shopping }) => {
    const channel = channels.get(video.channelId) ?? null;
    return { video, channel, shopping, trend: computeTrend(video, channel?.subs ?? null, channelMedianFor(video, baselines.get(video.channelId)), growth.get(video.id) ?? null) };
  });

  return {
    items,
    searchedAt: new Date().toISOString(),
    options: o,
    candidateCount: videos.length,
    unitsUsed: quotaUsed() - before,
  };
}

/**
 * 채널 평소 조회수 = 이 영상을 뺀, 올린 지 하루 넘은 최근 영상들의 가운데 값
 * 숏폼은 숏폼끼리, 롱폼은 롱폼끼리 비교해요. (같은 종류가 3개보다 적으면 전부로 비교)
 */
function channelMedianFor(v: VideoItem, list?: { id: string; views: number; format: 'shorts' | 'long'; ageHours: number }[]): number | null {
  if (!list) return null;
  const others = list.filter((x) => x.id !== v.id && x.ageHours >= 24);
  const same = others.filter((x) => x.format === v.format);
  const base = same.length >= 3 ? same : others;
  return base.length >= 3 ? median(base.map((x) => x.views)) : null;
}

/** 한 번에 몇 개씩만 동시에 부르기 */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}
