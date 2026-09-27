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
  caption: string;
  hashtags: string[];
  hookAlternatives: string[];
  postingTip: string;
  culturalNotes: string[];
  slides: { index: number; texts: { id: string; text: string }[]; imagePrompt: string }[];
  videoSubtitles: Subtitle[];
  videoScenePrompts: string[];
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
