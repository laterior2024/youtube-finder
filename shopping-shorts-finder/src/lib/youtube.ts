import type { ChannelInfo, VideoItem } from '../types';
import { addQuota } from './storage';

/**
 * 유튜브 데이터 API 연결
 *
 * 유튜브는 하루에 10,000포인트를 공짜로 줘요. 부르는 기능마다 쓰는 포인트가 달라요.
 *  - 검색(search)            : 한 번에 100포인트 ← 비싸요!
 *  - 영상 정보(videos)        : 50개에 1포인트
 *  - 채널 정보(channels)      : 50개에 1포인트
 *  - 채널 최근 영상(playlist) : 1포인트
 */
const BASE = 'https://www.googleapis.com/youtube/v3';

export const COST = { search: 100, list: 1 } as const;

export class YoutubeError extends Error {}

async function call<T>(endpoint: string, params: Record<string, string | number | undefined>, key: string, cost: number): Promise<T> {
  const url = new URL(`${BASE}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  url.searchParams.set('key', key);

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new YoutubeError('유튜브에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  addQuota(cost);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new YoutubeError(friendlyError(data));
  return data as T;
}

function friendlyError(data: unknown): string {
  const err = (data as { error?: { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } })?.error;
  const reasons = [...(err?.errors ?? []), ...(err?.details ?? [])].map((e) => e.reason ?? '').join(' ');
  const msg = err?.message ?? '';
  if (/quotaExceeded|dailyLimitExceeded/i.test(reasons + msg))
    return '오늘 쓸 수 있는 유튜브 포인트(10,000)를 다 썼어요. 한국 시간 오후 4~5시쯤 다시 채워져요. 내일 다시 해 보세요!';
  if (/keyInvalid|API_KEY_INVALID|API key not valid/i.test(reasons + msg))
    return 'API 키가 틀렸어요. ⚙️ 설정에서 키를 다시 복사해서 붙여넣어 주세요. (앞뒤 빈칸이 들어가지 않았는지도 확인!)';
  if (/accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(reasons + msg))
    return '"YouTube Data API v3"가 아직 꺼져 있어요. 사용 설명서 1단계의 ④번(API 사용 버튼 누르기)을 해 주세요. 켠 뒤 몇 분 기다려야 할 수도 있어요.';
  if (/referer|REFERRER|ipRefererBlocked|API_KEY_HTTP_REFERRER_BLOCKED/i.test(reasons + msg))
    return 'API 키에 "웹사이트 제한"이 걸려 있어요. 구글 클라우드의 키 설정에서 이 앱 주소를 추가하거나, 제한을 "없음"으로 바꿔 주세요.';
  return `유튜브가 오류를 알려줬어요: ${msg || '알 수 없는 오류'}`;
}

/* ───── 검색 (100포인트) ───── */

interface SearchResponse {
  nextPageToken?: string;
  items: { id: { videoId?: string } }[];
}

export async function searchVideoIds(
  opts: {
    q: string;
    order: string;
    publishedAfter: string;
    regionCode: string;
    lang: string;
    duration: 'short' | 'medium' | 'long';
    pageToken?: string;
  },
  key: string,
): Promise<{ ids: string[]; next?: string }> {
  const data = await call<SearchResponse>(
    'search',
    {
      part: 'id',
      type: 'video',
      maxResults: 50,
      q: opts.q,
      order: opts.order,
      publishedAfter: opts.publishedAfter,
      regionCode: opts.regionCode,
      relevanceLanguage: opts.lang,
      videoDuration: opts.duration,
      pageToken: opts.pageToken,
    },
    key,
    COST.search,
  );
  return { ids: data.items.map((i) => i.id.videoId).filter((id): id is string => !!id), next: data.nextPageToken };
}

/* ───── 영상 정보 (50개에 1포인트) ───── */

interface VideoResource {
  id: string;
  snippet?: {
    title: string;
    description: string;
    tags?: string[];
    categoryId: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: Record<string, { url: string }>;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration: string };
  paidProductPlacementDetails?: { hasPaidProductPlacement?: boolean };
}

/** 쇼츠는 3분(180초)까지 올릴 수 있어요. 그래서 3분 이하는 숏폼, 넘으면 롱폼으로 봐요. */
export const SHORTS_MAX_SEC = 180;

export function parseDuration(iso: string): number {
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// "유료 광고 포함" 정보(paidProductPlacementDetails)를 유튜브가 안 받아주면 그 뒤로는 빼고 물어봐요.
let paidPartSupported = true;

export async function getVideos(ids: string[], key: string): Promise<VideoItem[]> {
  const out: VideoItem[] = [];
  for (const group of chunks(ids, 50)) {
    let data: { items: VideoResource[] };
    const parts = ['snippet', 'statistics', 'contentDetails'];
    try {
      data = await call('videos', { part: [...parts, ...(paidPartSupported ? ['paidProductPlacementDetails'] : [])].join(','), id: group.join(','), maxResults: 50 }, key, COST.list);
    } catch (e) {
      if (!paidPartSupported || !(e instanceof YoutubeError) || !/part|paidProductPlacement/i.test(e.message)) throw e;
      paidPartSupported = false;
      data = await call('videos', { part: parts.join(','), id: group.join(','), maxResults: 50 }, key, COST.list);
    }
    for (const r of data.items) {
      if (!r.snippet || !r.contentDetails) continue;
      const durationSec = parseDuration(r.contentDetails.duration);
      if (durationSec === 0) continue; // 생방송 등은 빼요
      const th = r.snippet.thumbnails ?? {};
      out.push({
        id: r.id,
        title: r.snippet.title,
        description: r.snippet.description ?? '',
        tags: r.snippet.tags ?? [],
        categoryId: r.snippet.categoryId,
        channelId: r.snippet.channelId,
        channelTitle: r.snippet.channelTitle,
        publishedAt: r.snippet.publishedAt,
        durationSec,
        views: Number(r.statistics?.viewCount ?? 0),
        likes: r.statistics?.likeCount !== undefined ? Number(r.statistics.likeCount) : null,
        comments: r.statistics?.commentCount !== undefined ? Number(r.statistics.commentCount) : null,
        thumbnail: (th.high ?? th.medium ?? th.default)?.url ?? `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg`,
        paidPromo: r.paidProductPlacementDetails?.hasPaidProductPlacement ?? null,
        format: durationSec <= SHORTS_MAX_SEC ? 'shorts' : 'long',
      });
    }
  }
  return out;
}

/** 채널 평소 조회수를 계산할 때 쓰는 가벼운 버전 (조회수·길이·날짜만) */
export async function getVideoStats(ids: string[], key: string) {
  const out: { id: string; views: number; durationSec: number; publishedAt: string }[] = [];
  for (const group of chunks(ids, 50)) {
    const data = await call<{ items: VideoResource[] }>('videos', { part: 'statistics,contentDetails,snippet', id: group.join(','), fields: 'items(id,statistics/viewCount,contentDetails/duration,snippet/publishedAt)' }, key, COST.list);
    for (const r of data.items) {
      out.push({
        id: r.id,
        views: Number(r.statistics?.viewCount ?? 0),
        durationSec: parseDuration(r.contentDetails?.duration ?? ''),
        publishedAt: r.snippet?.publishedAt ?? '',
      });
    }
  }
  return out;
}

/* ───── 채널 정보 (50개에 1포인트) ───── */

interface ChannelResource {
  id: string;
  snippet?: { title: string };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

export async function getChannels(ids: string[], key: string): Promise<Map<string, ChannelInfo>> {
  const out = new Map<string, ChannelInfo>();
  for (const group of chunks(ids, 50)) {
    const data = await call<{ items?: ChannelResource[] }>('channels', { part: 'snippet,statistics,contentDetails', id: group.join(','), maxResults: 50 }, key, COST.list);
    for (const c of data.items ?? []) {
      out.set(c.id, {
        id: c.id,
        title: c.snippet?.title ?? '',
        subs: c.statistics?.hiddenSubscriberCount ? null : Number(c.statistics?.subscriberCount ?? 0) || null,
        uploadsPlaylist: c.contentDetails?.relatedPlaylists?.uploads ?? null,
      });
    }
  }
  return out;
}

/** 채널이 최근에 올린 영상 번호들 (1포인트) */
export async function getRecentUploadIds(playlistId: string, key: string, count = 20): Promise<string[]> {
  try {
    const data = await call<{ items?: { contentDetails?: { videoId?: string } }[] }>('playlistItems', { part: 'contentDetails', playlistId, maxResults: count }, key, COST.list);
    return (data.items ?? []).map((i) => i.contentDetails?.videoId).filter((id): id is string => !!id);
  } catch (e) {
    // 할당량 초과는 멈춰야 하니까 다시 던지고, 그 밖의 오류(재생목록 없음 등)는 그 채널만 건너뛰어요.
    if (e instanceof YoutubeError && /포인트/.test(e.message)) throw e;
    return [];
  }
}
