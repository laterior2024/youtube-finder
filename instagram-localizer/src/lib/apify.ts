import type { PostInput, SourceImage } from '../types';
import { fileToSourceImage } from './files';

/**
 * Apify(인스타 수집 서비스)로 게시물 정보를 가져와요.
 * 결과에는 사진 주소·영상 주소·설명글·계정 이름이 들어 있어요.
 */
interface ApifyChild {
  type?: string;
  displayUrl?: string;
  videoUrl?: string;
}

interface ApifyItem {
  type?: string;
  url?: string;
  caption?: string;
  ownerUsername?: string;
  displayUrl?: string;
  images?: string[];
  videoUrl?: string;
  childPosts?: ApifyChild[];
  likesCount?: number;
  error?: string;
  errorDescription?: string;
}

export interface ImportedPost {
  input: Omit<PostInput, 'video'>;
  videoUrl: string;
  likes: number | null;
  skippedImages: number;
}

const INSTAGRAM_POST = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[\w-]+/i;

export function isInstagramPostUrl(url: string) {
  return INSTAGRAM_POST.test(url.trim());
}

/** 링크 끝의 ?utm_source=… 같은 꼬리표를 떼어 냅니다. */
export function cleanInstagramUrl(url: string) {
  const m = INSTAGRAM_POST.exec(url.trim());
  return m ? m[0].replace(/^http:/, 'https:') + '/' : url.trim();
}

function apifyErrorMessage(status: number, body: string): string {
  if (status === 401 || status === 403) return 'Apify 토큰이 올바르지 않아요. ⚙️ 설정에서 토큰을 다시 붙여넣어 주세요.';
  if (status === 402 || /not enough|usage|credit|limit/i.test(body))
    return 'Apify 사용 한도(크레딧)를 다 썼어요. Apify 사이트에서 사용량을 확인해 주세요.';
  if (status === 404) return 'Apify 액터를 찾을 수 없어요. ⚙️ 설정의 액터 이름을 기본값으로 되돌려 보세요.';
  if (status === 408 || status === 504) return 'Apify 응답이 너무 늦어요. 잠시 뒤 다시 시도해 주세요.';
  return `Apify 오류 (${status}). 잠시 뒤 다시 시도해 주세요.`;
}

async function callApify(url: string, token: string, actor: string): Promise<ApifyItem> {
  // "apify/instagram-scraper"처럼 써도 API 주소 형식(apify~instagram-scraper)으로 바꿔요.
  const actorId = encodeURIComponent(actor.replace('/', '~'));
  const endpoint = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=120`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directUrls: [url], resultsType: 'posts', resultsLimit: 1, addParentData: false }),
    });
  } catch {
    throw new Error('Apify에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  const text = await res.text();
  if (!res.ok) throw new Error(apifyErrorMessage(res.status, text));
  let items: ApifyItem[];
  try {
    items = JSON.parse(text);
  } catch {
    throw new Error('Apify가 이상한 응답을 보냈어요. 다시 시도해 주세요.');
  }
  const item = items.find((i) => !i.error) ?? items[0];
  if (!item || item.error) {
    throw new Error(
      '게시물을 찾지 못했어요. 비공개 계정이거나, 지워졌거나, 링크가 잘못됐을 수 있어요.' +
        (item?.errorDescription ? ` (${item.errorDescription})` : ''),
    );
  }
  return item;
}

/** 인스타 사진을 우리 서버(/api/image)를 거쳐 내려받아 앱에서 쓸 수 있는 형태로 바꿔요. */
async function downloadImage(src: string): Promise<SourceImage> {
  const attempts = [`/api/image?url=${encodeURIComponent(src)}`, src];
  let lastError: unknown;
  for (const url of attempts) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error('사진이 아니에요');
      return await fileToSourceImage(new File([blob], 'instagram.jpg', { type: blob.type }));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('사진을 내려받지 못했어요.');
}

function collectImageUrls(item: ApifyItem): { urls: string[]; videoUrl: string } {
  const urls: string[] = [];
  let videoUrl = item.videoUrl ?? '';
  if (item.childPosts?.length) {
    for (const c of item.childPosts) {
      if (c.displayUrl) urls.push(c.displayUrl);
      if (!videoUrl && c.videoUrl) videoUrl = c.videoUrl;
    }
  } else if (item.images?.length) {
    urls.push(...item.images);
  } else if (item.displayUrl) {
    urls.push(item.displayUrl);
  }
  return { urls: [...new Set(urls)], videoUrl };
}

export async function importInstagramPost(
  url: string,
  token: string,
  actor: string,
  onStatus: (s: string) => void,
): Promise<ImportedPost> {
  if (!token.trim()) throw new Error('⚙️ 설정에 Apify 토큰을 먼저 넣어 주세요.');
  const clean = cleanInstagramUrl(url);
  if (!isInstagramPostUrl(clean)) throw new Error('인스타 게시물 링크가 아니에요. instagram.com/p/… 또는 /reel/… 링크를 넣어 주세요.');

  onStatus('Apify가 게시물을 가져오는 중… (10~60초)');
  const item = await callApify(clean, token.trim(), actor.trim() || 'apify~instagram-scraper');
  const { urls, videoUrl } = collectImageUrls(item);

  onStatus(`사진 ${urls.length}장을 내려받는 중…`);
  const images: SourceImage[] = [];
  let skipped = 0;
  for (const u of urls.slice(0, 20)) {
    try {
      images.push(await downloadImage(u));
    } catch {
      skipped++;
    }
  }
  if (!images.length && urls.length) throw new Error('사진을 내려받지 못했어요. 잠시 뒤 다시 시도하거나, 사진을 직접 올려 주세요.');

  return {
    input: {
      sourceUrl: clean,
      credit: item.ownerUsername ? `@${item.ownerUsername}` : '',
      caption: item.caption ?? '',
      images,
    },
    videoUrl,
    likes: typeof item.likesCount === 'number' && item.likesCount >= 0 ? item.likesCount : null,
    skippedImages: skipped,
  };
}
