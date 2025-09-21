
export interface SearchFilters {
  keywords: string;
  minViews: number | '';
  maxViews: number | '';
  minLikes: number | '';
  maxLikes: number | '';
  minSubscribers: number | '';
  maxSubscribers: number | '';
  uploadDate: 'any' | 'past_24_hours' | 'past_week' | 'past_month' | 'past_year';
  duration: 'any' | 'short' | 'medium' | 'long'; // short < 4min, medium 4-20min, long > 20min
  category: string; // Will hold category ID or 'any'
  tags: string;
  maxResults: number;
  channelName: string;
  country: string; // 'any', or a two-letter country code like 'KR', 'US'
}

export interface YouTubeVideo {
  videoId: string;
  channelId: string;
  title: string;
  channelName:string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSeconds: number;
  uploadDate: string; // ISO 8601 format
  channelSubscriberCount: number;
  tags: string[];
  category: string;
  thumbnailUrl: string;
  channelCountry: string; // two-letter country code
  koreanTitle?: string;
  koreanChannelName?: string;
}

export type UserRole = 'admin' | 'guest';