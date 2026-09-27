export type CountryCode = 'KR' | 'JP' | 'ES';
export type FontStyle = 'sans' | 'serif' | 'rounded' | 'handwritten' | 'display';
export type Align = 'left' | 'center' | 'right';
export type AspectRatio = '1:1' | '4:5' | '9:16';
export type BackgroundType = 'photo' | 'illustration' | 'solid' | 'gradient';
export type ImageMode = 'new' | 'cleanup';

/** 이미지 위에 올라가는 글자 한 덩어리. 위치/크기는 캔버스 대비 % 단위. */
export interface TextBlock {
  id: string;
  role: string;
  text: string;
  originalText: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontStyle: FontStyle;
  fontFamily: string;
  fontWeight: number;
  fontSizePct: number;
  color: string;
  /** 줄마다 다른 색 (Enter로 나눈 줄 순서대로). 비어 있으면 모든 줄이 color */
  lineColors?: string[];
  align: Align;
  lineHeight: number;
  italic: boolean;
  uppercase: boolean;
  strokeColor: string;
  shadow: boolean;
  highlightColor: string;
}

export interface SlideSpec {
  index: number;
  purpose: string;
  backgroundType: BackgroundType;
  backgroundColors: string[];
  visualDescription: string;
  textBlocks: TextBlock[];
}

export interface VideoScene {
  start: number;
  end: number;
  description: string;
  spokenText: string;
  onScreenText: string;
}

export interface PostAnalysis {
  topic: string;
  summaryKo: string;
  whyViral: string[];
  hookPattern: string;
  tone: string;
  captionOriginal: string;
  slides: SlideSpec[];
  videoSummary: string;
  videoScenes: VideoScene[];
}

export interface Subtitle {
  start: number;
  end: number;
  text: string;
}

export interface Localization {
  country: CountryCode;
  /** 설명글 본문 (해시태그 제외, 출처 줄 포함) */
  caption: string;
  /** 설명글 맨 끝에 붙는 노출용 해시태그 3개 */
  hashtags: string[];
  hashtagReasons: string[];
  /** 원문 요점이 새 설명글에 빠짐없이, 지어낸 것 없이 들어갔는지 대조표 (한국어) */
  captionCheck: string[];
  hookAlternatives: string[];
  postingTip: string;
  culturalNotes: string[];
  slides: { index: number; texts: { id: string; text: string }[]; imagePrompt: string }[];
  videoSubtitles: Subtitle[];
  videoScenePrompts: string[];
}

export type GradientPosition = 'bottom' | 'top' | 'both';

/** 글자가 잘 보이도록 사진 가장자리에 까는 그라데이션 설정 */
export interface GradientSettings {
  enabled: boolean;
  position: GradientPosition;
  color: string;
  /** 그라데이션이 차지하는 높이 (이미지 높이의 %) */
  height: number;
  /** 가장 진한 곳의 진하기 (0~1) */
  opacity: number;
  /** 0.1(금방 진해짐) ~ 1(아주 천천히 진해짐) */
  softness: number;
}

export type BgStatus = 'idle' | 'loading' | 'done' | 'error';

/** 편집 화면에서 다루는 슬라이드 한 장 (나라별로 따로 존재). */
export interface WorkingSlide {
  index: number;
  backgroundType: BackgroundType;
  backgroundColors: string[];
  textBlocks: TextBlock[];
  imagePrompt: string;
  sourceImage: string | null;
  background: string | null;
  bgStatus: BgStatus;
  bgError: string;
  overlay: number;
  gradient: GradientSettings;
}

export interface CountryResult {
  localization: Localization;
  slides: WorkingSlide[];
}

export interface SourceImage {
  dataUrl: string;
  width: number;
  height: number;
}

export interface Settings {
  apiKey: string;
  textModel: string;
  imageModel: string;
}
