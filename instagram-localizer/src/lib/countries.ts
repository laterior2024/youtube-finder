import type { CountryCode, FontStyle } from '../types';

/** 글자 그리기에 쓰는 언어 (폰트 목록 · 줄바꿈 규칙이 언어마다 달라요) */
export type Lang = 'ko' | 'ja' | 'zh' | 'en' | 'es' | 'pt' | 'de' | 'fr' | 'id';

/** 띄어쓰기 없이 글자 단위로 줄을 바꾸는 언어 */
export const CJK_LANGS: Lang[] = ['ja', 'zh'];
/** 대문자·기울임(이탤릭)을 원본처럼 살리는 알파벳 언어 */
export const LATIN_LANGS: Lang[] = ['en', 'es', 'pt', 'de', 'fr', 'id'];

export type Region = 'asia' | 'americas' | 'europe';

export interface CountryInfo {
  code: CountryCode;
  nameKo: string;
  /** AI 지시문에 쓰는 영어 나라 이름 */
  nameEn: string;
  flag: string;
  /** AI 지시문에 쓰는 언어 이름 (영어) */
  language: string;
  /** 화면에 보여주는 언어 이름 (한국어) */
  languageKo: string;
  lang: Lang;
  region: Region;
  /** 이 나라를 고르면 좋은 이유 (한 줄, 화면 표시용) */
  why: string;
  audience: string;
  creditLabel: string;
  /** 원문 대비 글자 수가 얼마나 늘어나는지 (이미지 글자 상자 맞춤용) */
  lengthFactor: number;
  /** CTA 한 줄 최대 글자 수 */
  ctaMaxChars: number;
}

export const COUNTRIES: Record<CountryCode, CountryInfo> = {
  KR: {
    code: 'KR',
    nameKo: '한국',
    nameEn: 'South Korea',
    flag: '🇰🇷',
    language: 'Korean',
    languageKo: '한국어',
    lang: 'ko',
    region: 'asia',
    why: '내 나라 · 기본',
    audience:
      'Korean Instagram users (20s–30s). Write natural, trendy Korean that sounds like a native Korean creator wrote it — never translationese. ' +
      'Match the original tone (casual → 반말/친근한 해요체, informative → 깔끔한 해요체). Use Korean examples, brands, prices in 원, and places when a local example makes the point land better.',
    creditLabel: '출처',
    lengthFactor: 0.9,
    ctaMaxChars: 45,
  },
  JP: {
    code: 'JP',
    nameKo: '일본',
    nameEn: 'Japan',
    flag: '🇯🇵',
    language: 'Japanese',
    languageKo: '일본어',
    lang: 'ja',
    region: 'asia',
    why: '💰 광고 단가 높음',
    audience:
      'Japanese Instagram users (20s–30s). Write natural Japanese like a popular Japanese creator (です/ます or casual, matching the original tone). ' +
      'Use Japanese examples, yen prices, local places and common Instagram phrasing such as 保存推奨 when it fits. Keep lines short; avoid awkward katakana overuse.',
    creditLabel: '出典',
    lengthFactor: 0.9,
    ctaMaxChars: 45,
  },
  TW: {
    code: 'TW',
    nameKo: '대만',
    nameEn: 'Taiwan',
    flag: '🇹🇼',
    language: 'Traditional Chinese (Taiwan, zh-TW)',
    languageKo: '중국어(번체)',
    lang: 'zh',
    region: 'asia',
    why: '👀 인스타 인기 · 한국 콘텐츠 선호',
    audience:
      'Instagram users in Taiwan (20s–30s). Write natural Taiwanese Mandarin in Traditional Chinese characters (never Simplified), with Taiwan vocabulary and phrasing, not Mainland Chinese. ' +
      'Use NT$ prices, local places and examples. Keep lines short and punchy.',
    creditLabel: '出處',
    lengthFactor: 0.7,
    ctaMaxChars: 35,
  },
  ID: {
    code: 'ID',
    nameKo: '인도네시아',
    nameEn: 'Indonesia',
    flag: '🇮🇩',
    language: 'Indonesian (Bahasa Indonesia)',
    languageKo: '인도네시아어',
    lang: 'id',
    region: 'asia',
    why: '👀 사용자 매우 많음 (조회수)',
    audience:
      'Indonesian Instagram users (18–30). Write casual, friendly Bahasa Indonesia as popular Indonesian creators do (light everyday slang like "banget", "kamu" is fine when it matches the tone). ' +
      'Use Rupiah prices, local places and examples.',
    creditLabel: 'Sumber',
    lengthFactor: 1.1,
    ctaMaxChars: 90,
  },
  US: {
    code: 'US',
    nameKo: '미국',
    nameEn: 'the United States',
    flag: '🇺🇸',
    language: 'English (United States)',
    languageKo: '영어',
    lang: 'en',
    region: 'americas',
    why: '💰 수익 최고 · 영어권 전체',
    audience:
      'US Instagram users (18–35). Write natural American English like a top US creator: punchy, conversational, scannable. ' +
      'Use US examples, dollar prices, and US spelling. This version will also be seen by English speakers in the UK, Canada and Australia, so avoid overly regional slang.',
    creditLabel: 'Credit',
    lengthFactor: 1.0,
    ctaMaxChars: 90,
  },
  MX: {
    code: 'MX',
    nameKo: '멕시코 · 중남미',
    nameEn: 'Mexico and Latin America',
    flag: '🇲🇽',
    language: 'Spanish (Mexico / Latin America, es-MX)',
    languageKo: '스페인어(중남미)',
    lang: 'es',
    region: 'americas',
    why: '👀 스페인어권 최대 시장',
    audience:
      'Instagram users in Mexico and Latin America (18–35). Write Latin American Spanish as used in Mexico (use "ustedes", never "vosotros"; Mexican vocabulary, neutral enough for the rest of Latin America). ' +
      'Use examples and prices (MXN) that feel local. Keep it punchy; Spanish runs longer than English so be concise.',
    creditLabel: 'Crédito',
    lengthFactor: 1.1,
    ctaMaxChars: 90,
  },
  BR: {
    code: 'BR',
    nameKo: '브라질',
    nameEn: 'Brazil',
    flag: '🇧🇷',
    language: 'Portuguese (Brazil, pt-BR)',
    languageKo: '포르투갈어(브라질)',
    lang: 'pt',
    region: 'americas',
    why: '👀 인스타 사용자 세계 상위 · 반응 좋음',
    audience:
      'Brazilian Instagram users (18–35). Write warm, informal Brazilian Portuguese (você, a gente) like a popular Brazilian creator — never European Portuguese. ' +
      'Use R$ prices, Brazilian examples and references. Keep it punchy.',
    creditLabel: 'Crédito',
    lengthFactor: 1.1,
    ctaMaxChars: 90,
  },
  ES: {
    code: 'ES',
    nameKo: '스페인',
    nameEn: 'Spain',
    flag: '🇪🇸',
    language: 'Spanish (Spain, es-ES)',
    languageKo: '스페인어(스페인)',
    lang: 'es',
    region: 'europe',
    why: '💰 유럽 시장',
    audience:
      'Instagram users in Spain (20s–30s). Write Castilian Spanish as used in Spain (use vosotros, Spain vocabulary — not Latin American). ' +
      'Use examples, euro prices and references that feel local to Spain. Keep it punchy; Spanish runs longer than English so be concise.',
    creditLabel: 'Fuente',
    lengthFactor: 1.1,
    ctaMaxChars: 90,
  },
  DE: {
    code: 'DE',
    nameKo: '독일',
    nameEn: 'Germany',
    flag: '🇩🇪',
    language: 'German (Germany, de-DE)',
    languageKo: '독일어',
    lang: 'de',
    region: 'europe',
    why: '💰 광고 단가 높음 · 경쟁 적음',
    audience:
      'German Instagram users (20s–35). Write natural, modern German like a popular German creator (usually informal "du"). ' +
      'Use euro prices and German examples. German words are long — keep sentences short and prefer shorter words so text fits the design.',
    creditLabel: 'Quelle',
    lengthFactor: 1.2,
    ctaMaxChars: 90,
  },
  FR: {
    code: 'FR',
    nameKo: '프랑스',
    nameEn: 'France',
    flag: '🇫🇷',
    language: 'French (France, fr-FR)',
    languageKo: '프랑스어',
    lang: 'fr',
    region: 'europe',
    why: '💰 유럽 · 캐나다 · 아프리카 불어권',
    audience:
      'French Instagram users (20s–35). Write natural, modern French like a popular French creator (tu, casual when the original is casual). ' +
      'Follow French typography (space before ! ? : ;). Use euro prices and French examples. Keep it concise; French runs long.',
    creditLabel: 'Source',
    lengthFactor: 1.15,
    ctaMaxChars: 90,
  },
};

export const COUNTRY_ORDER: CountryCode[] = ['KR', 'JP', 'TW', 'ID', 'US', 'MX', 'BR', 'ES', 'DE', 'FR'];

export const REGIONS: { id: Region; label: string }[] = [
  { id: 'asia', label: '아시아' },
  { id: 'americas', label: '아메리카' },
  { id: 'europe', label: '유럽' },
];

export interface FontOption {
  family: string;
  label: string;
  style: FontStyle;
  weights: number[];
}

/** 모든 폰트는 상업적 이용이 가능한 무료 폰트(SIL OFL)입니다. */
const LATIN_FONTS: FontOption[] = [
    { family: 'Montserrat', label: 'Montserrat (sans)', style: 'sans', weights: [300, 400, 500, 600, 700, 800, 900] },
    { family: 'Inter', label: 'Inter (sans)', style: 'sans', weights: [300, 400, 500, 600, 700, 800, 900] },
    { family: 'Playfair Display', label: 'Playfair Display (serif)', style: 'serif', weights: [400, 700, 900] },
    { family: 'Nunito', label: 'Nunito (rounded)', style: 'rounded', weights: [400, 700, 900] },
    { family: 'Caveat', label: 'Caveat (handwritten)', style: 'handwritten', weights: [400, 700] },
    { family: 'Anton', label: 'Anton (headline)', style: 'display', weights: [400] },
    { family: 'Bebas Neue', label: 'Bebas Neue (headline)', style: 'display', weights: [400] },
];

export const FONTS: Record<Lang, FontOption[]> = {
  ko: [
    { family: 'Pretendard Variable', label: '프리텐다드 (깔끔한 고딕)', style: 'sans', weights: [300, 400, 500, 600, 700, 800, 900] },
    { family: 'Noto Sans KR', label: '본고딕 (Noto Sans KR)', style: 'sans', weights: [300, 400, 500, 700, 900] },
    { family: 'Nanum Myeongjo', label: '나눔명조 (명조/세리프)', style: 'serif', weights: [400, 700, 800] },
    { family: 'Jua', label: '주아 (둥글고 귀여운)', style: 'rounded', weights: [400] },
    { family: 'Gowun Dodum', label: '고운돋움 (부드러운)', style: 'rounded', weights: [400] },
    { family: 'Nanum Pen Script', label: '나눔펜 (손글씨)', style: 'handwritten', weights: [400] },
    { family: 'Gaegu', label: '개구 (손글씨)', style: 'handwritten', weights: [400, 700] },
    { family: 'Black Han Sans', label: '검은고딕 (굵은 제목용)', style: 'display', weights: [400] },
    { family: 'Do Hyeon', label: '도현 (제목용)', style: 'display', weights: [400] },
  ],
  ja: [
    { family: 'Noto Sans JP', label: 'Noto Sans JP (ゴシック)', style: 'sans', weights: [300, 400, 500, 700, 900] },
    { family: 'Noto Serif JP', label: 'Noto Serif JP (明朝)', style: 'serif', weights: [400, 700, 900] },
    { family: 'M PLUS Rounded 1c', label: 'M PLUS Rounded (丸ゴシック)', style: 'rounded', weights: [400, 700, 800] },
    { family: 'Zen Maru Gothic', label: 'Zen Maru Gothic (丸)', style: 'rounded', weights: [400, 700] },
    { family: 'Yomogi', label: 'Yomogi (手書き)', style: 'handwritten', weights: [400] },
    { family: 'Klee One', label: 'Klee One (手書き風)', style: 'handwritten', weights: [400, 600] },
    { family: 'Dela Gothic One', label: 'Dela Gothic One (極太見出し)', style: 'display', weights: [400] },
  ],
  zh: [
    { family: 'Noto Sans TC', label: 'Noto Sans TC (黑體)', style: 'sans', weights: [300, 400, 500, 700, 900] },
    { family: 'Noto Serif TC', label: 'Noto Serif TC (明體)', style: 'serif', weights: [400, 700, 900] },
    { family: 'LXGW WenKai TC', label: 'LXGW WenKai TC (手寫風)', style: 'handwritten', weights: [400, 700] },
  ],
  en: LATIN_FONTS,
  es: LATIN_FONTS,
  pt: LATIN_FONTS,
  de: LATIN_FONTS,
  fr: LATIN_FONTS,
  id: LATIN_FONTS,
};

export function defaultFontFor(lang: Lang, style: FontStyle): string {
  return (FONTS[lang].find((f) => f.style === style) ?? FONTS[lang][0]).family;
}

export function fontOption(lang: Lang, family: string): FontOption {
  return FONTS[lang].find((f) => f.family === family) ?? FONTS[lang][0];
}

/** 폰트에 없는 굵기를 요청하면 가장 가까운 굵기로 맞춥니다. */
export function nearestWeight(option: FontOption, weight: number): number {
  return option.weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best));
}
