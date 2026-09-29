import type { Region } from '../types';

/**
 * 검색 주제 묶음
 * 유튜브 검색은 한 번에 100포인트(하루 10,000포인트)를 써서 아껴야 해요.
 * 그래서 쇼핑 영상에 자주 나오는 말을 "|"(또는)로 묶어 한 번에 검색해요.
 */
export interface Topic {
  id: string;
  emoji: string;
  name: string;
  keywords: Record<Region, string[]>;
}

export const TOPICS: Topic[] = [
  {
    id: 'all',
    emoji: '🛒',
    name: '쇼핑 전체',
    keywords: {
      KR: ['내돈내산', '추천템', '꿀템', '쿠팡 추천', '살림템', '언박싱', '하울', '가성비템', '다이소 추천', '알리 추천템'],
      US: ['amazon finds', 'amazon must haves', 'tiktok made me buy it', 'unboxing', 'haul', 'product review', 'must have gadgets'],
      JP: ['購入品', '買ってよかった', '開封', 'amazon おすすめ', '100均 購入品', 'ダイソー 購入品'],
    },
  },
  {
    id: 'home',
    emoji: '🏠',
    name: '살림·생활',
    keywords: {
      KR: ['살림템', '생활꿀템', '자취템', '청소템', '수납템', '다이소 꿀템', '살림 추천'],
      US: ['home finds', 'cleaning gadgets', 'amazon home finds', 'organization haul'],
      JP: ['便利グッズ', '掃除グッズ', '収納グッズ', '100均 便利'],
    },
  },
  {
    id: 'kitchen',
    emoji: '🍳',
    name: '주방',
    keywords: {
      KR: ['주방템', '주방꿀템', '주방용품 추천', '요리템', '에어프라이어 추천', '주방 살림템'],
      US: ['kitchen gadgets', 'amazon kitchen finds', 'kitchen must haves'],
      JP: ['キッチングッズ', 'キッチン 便利グッズ', 'キッチン 購入品'],
    },
  },
  {
    id: 'beauty',
    emoji: '💄',
    name: '뷰티',
    keywords: {
      KR: ['올리브영 추천', '화장품 추천', '뷰티템', '올영 세일', '스킨케어 추천', '내돈내산 화장품'],
      US: ['sephora haul', 'makeup haul', 'skincare must haves', 'beauty finds'],
      JP: ['コスメ 購入品', 'プチプラコスメ', 'スキンケア おすすめ'],
    },
  },
  {
    id: 'tech',
    emoji: '🔌',
    name: '전자기기·가전',
    keywords: {
      KR: ['가전 추천', '전자기기 추천', 'IT 꿀템', '가젯 추천', '전자기기 언박싱', '가성비 가전'],
      US: ['tech gadgets', 'cool gadgets', 'tech unboxing', 'amazon gadgets'],
      JP: ['ガジェット おすすめ', '家電 おすすめ', 'ガジェット 開封'],
    },
  },
  {
    id: 'fashion',
    emoji: '👕',
    name: '패션',
    keywords: {
      KR: ['옷 하울', '패션 하울', '무신사 추천', '코디 추천템', '신발 추천', '가방 추천'],
      US: ['clothing haul', 'fashion haul', 'shein haul', 'outfit finds'],
      JP: ['プチプラ 購入品', 'ユニクロ 購入品', 'GU 購入品'],
    },
  },
  {
    id: 'global',
    emoji: '✈️',
    name: '알리·테무·직구',
    keywords: {
      KR: ['알리익스프레스 추천', '알리 꿀템', '알리 직구', '테무 추천', '테무 하울', '해외직구 추천'],
      US: ['temu haul', 'aliexpress finds', 'shein haul', 'temu finds'],
      JP: ['アリエクスプレス 購入品', 'temu 購入品', 'shein 購入品'],
    },
  },
  {
    id: 'camping',
    emoji: '🏕️',
    name: '캠핑·차량',
    keywords: {
      KR: ['캠핑용품 추천', '캠핑꿀템', '차박템', '차량용품 추천', '자동차 꿀템'],
      US: ['camping gadgets', 'car accessories', 'car gadgets', 'camping gear haul'],
      JP: ['キャンプギア', '車 便利グッズ', 'キャンプ 購入品'],
    },
  },
  {
    id: 'baby',
    emoji: '🍼',
    name: '육아·반려동물',
    keywords: {
      KR: ['육아템', '육아꿀템', '아기용품 추천', '강아지 용품 추천', '고양이 용품 추천', '반려동물 꿀템'],
      US: ['baby must haves', 'mom hacks products', 'dog products', 'cat products'],
      JP: ['育児グッズ', 'ベビー用品 おすすめ', '犬 グッズ', '猫 グッズ'],
    },
  },
];

/** 내가 직접 넣은 낱말(예: 선풍기)을 쇼핑 말과 섞어서 검색어로 만들어요 */
const CUSTOM_SUFFIX: Record<Region, string[]> = {
  KR: ['추천', '리뷰', '내돈내산', '언박싱', '꿀템'],
  US: ['review', 'unboxing', 'must have', 'amazon'],
  JP: ['おすすめ', 'レビュー', '開封', '購入品'],
};

export function buildQuery(topicId: string, custom: string, region: Region): string {
  const word = custom.trim();
  if (word) return CUSTOM_SUFFIX[region].map((s) => `${word} ${s}`).join('|');
  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS[0];
  return topic.keywords[region].join('|');
}

export const REGIONS: { id: Region; flag: string; name: string; lang: string }[] = [
  { id: 'KR', flag: '🇰🇷', name: '한국', lang: 'ko' },
  { id: 'US', flag: '🇺🇸', name: '미국', lang: 'en' },
  { id: 'JP', flag: '🇯🇵', name: '일본', lang: 'ja' },
];
