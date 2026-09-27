import type { CountryCode, FontStyle } from '../types';

export interface CountryInfo {
  code: CountryCode;
  nameKo: string;
  flag: string;
  language: string;
  lang: 'ko' | 'ja' | 'es';
  audience: string;
  creditLabel: string;
}

export const COUNTRIES: Record<CountryCode, CountryInfo> = {
  KR: {
    code: 'KR',
    nameKo: '한국',
    flag: '🇰🇷',
    language: 'Korean',
    lang: 'ko',
    audience:
      'Korean Instagram users (20s–30s). Write natural, trendy Korean that sounds like a native Korean creator wrote it — never translationese. ' +
      'Match the original tone (casual → 반말/친근한 해요체, informative → 깔끔한 해요체). Use Korean examples, brands, prices in 원, and places when a local example makes the point land better.',
    creditLabel: '출처',
  },
  JP: {
    code: 'JP',
    nameKo: '일본',
    flag: '🇯🇵',
    language: 'Japanese',
    lang: 'ja',
    audience:
      'Japanese Instagram users (20s–30s). Write natural Japanese like a popular Japanese creator (です/ます or casual, matching the original tone). ' +
      'Use Japanese examples, yen prices, local places and common Instagram phrasing such as 保存推奨 when it fits. Keep lines short; avoid awkward katakana overuse.',
    creditLabel: '出典',
  },
  ES: {
    code: 'ES',
    nameKo: '스페인',
    flag: '🇪🇸',
    language: 'Spanish (Spain, es-ES)',
    lang: 'es',
    audience:
      'Instagram users in Spain (20s–30s). Write Castilian Spanish as used in Spain (use vosotros, Spain vocabulary — not Latin American). ' +
      'Use examples, euro prices and references that feel local to Spain. Keep it punchy; Spanish runs longer than English so be concise.',
    creditLabel: 'Fuente',
  },
};

export const COUNTRY_ORDER: CountryCode[] = ['KR', 'JP', 'ES'];

export interface FontOption {
  family: string;
  label: string;
  style: FontStyle;
  weights: number[];
}

/** 모든 폰트는 상업적 이용이 가능한 무료 폰트(SIL OFL)입니다. */
export const FONTS: Record<'ko' | 'ja' | 'es', FontOption[]> = {
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
  es: [
    { family: 'Montserrat', label: 'Montserrat (sans)', style: 'sans', weights: [300, 400, 500, 600, 700, 800, 900] },
    { family: 'Inter', label: 'Inter (sans)', style: 'sans', weights: [300, 400, 500, 600, 700, 800, 900] },
    { family: 'Playfair Display', label: 'Playfair Display (serif)', style: 'serif', weights: [400, 700, 900] },
    { family: 'Nunito', label: 'Nunito (redondeada)', style: 'rounded', weights: [400, 700, 900] },
    { family: 'Caveat', label: 'Caveat (manuscrita)', style: 'handwritten', weights: [400, 700] },
    { family: 'Anton', label: 'Anton (titulares)', style: 'display', weights: [400] },
    { family: 'Bebas Neue', label: 'Bebas Neue (titulares)', style: 'display', weights: [400] },
  ],
};

export function defaultFontFor(lang: 'ko' | 'ja' | 'es', style: FontStyle): string {
  return (FONTS[lang].find((f) => f.style === style) ?? FONTS[lang][0]).family;
}

export function fontOption(lang: 'ko' | 'ja' | 'es', family: string): FontOption {
  return FONTS[lang].find((f) => f.family === family) ?? FONTS[lang][0];
}

/** 폰트에 없는 굵기를 요청하면 가장 가까운 굵기로 맞춥니다. */
export function nearestWeight(option: FontOption, weight: number): number {
  return option.weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best));
}
