/** 영상 형태: 숏폼(쇼츠) / 롱폼(일반 영상) */
export type Format = 'shorts' | 'long';
export type FormatChoice = 'both' | Format;

export type Period = '1d' | '3d' | '7d' | '30d' | '90d';
export type Region = 'KR' | 'US' | 'JP';
export type Strictness = 'strict' | 'normal' | 'loose';
export type SortKey = 'trend' | 'views' | 'perDay' | 'subRatio' | 'channelRatio' | 'newest';

/** 유튜브에서 받아온 영상 정보 */
export interface VideoItem {
  id: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  durationSec: number;
  views: number;
  likes: number | null;
  comments: number | null;
  thumbnail: string;
  /** 유튜브에 "유료 광고 포함" 표시가 있는지 (모르면 null) */
  paidPromo: boolean | null;
  format: Format;
}

export interface ChannelInfo {
  id: string;
  title: string;
  subs: number | null;
  uploadsPlaylist: string | null;
}

/** 쇼핑 영상 판별 결과 */
export type ShoppingLevel = 'sure' | 'likely' | 'maybe' | 'no';
export interface Reason {
  label: string;
  points: number;
}
export interface ShoppingVerdict {
  score: number;
  level: ShoppingLevel;
  reasons: Reason[];
  shops: string[];
}

/** 떡상(지금 뜨는 중) 지표 */
export interface TrendInfo {
  ageHours: number;
  viewsPerDay: number;
  subRatio: number | null;
  channelRatio: number | null;
  channelMedian: number | null;
  engagement: number | null;
  growthPerHour: number | null;
  growthSinceHours: number | null;
  score: number;
}

export interface ResultItem {
  video: VideoItem;
  channel: ChannelInfo | null;
  shopping: ShoppingVerdict;
  trend: TrendInfo;
}

export interface ScanOptions {
  topic: string;
  customKeyword: string;
  format: FormatChoice;
  period: Period;
  region: Region;
  depth: 1 | 2;
  order: 'viewCount' | 'date' | 'relevance';
  compareChannel: boolean;
}

export interface ScanResult {
  items: ResultItem[];
  searchedAt: string;
  options: ScanOptions;
  candidateCount: number;
  unitsUsed: number;
}
