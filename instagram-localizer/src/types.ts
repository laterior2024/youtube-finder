export type CountryCode = 'KR' | 'JP' | 'TW' | 'ID' | 'US' | 'MX' | 'BR' | 'ES' | 'DE' | 'FR';
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
  /** 설명글 맨 끝에 붙는 카테고리·노출용 해시태그 3~5개 */
  hashtags: string[];
  hashtagReasons: string[];
  /** 원문 요점이 새 설명글에 빠짐없이, 지어낸 것 없이 들어갔는지 대조표 (한국어) */
  captionCheck: string[];
  /** ⑤ 💬 댓글을 부르는 한 줄 (질문, 또는 "댓글에 키워드 → DM으로 자료") */
  ctaComment: string;
  /** ④ ✈️ 특정한 사람을 떠올리게 해서 DM 공유를 부르는 한 줄 */
  ctaShare: string;
  ctaCommentOptions: string[];
  ctaShareOptions: string[];
  /** "출처: @원작자" 줄 (없으면 빈 글자) */
  creditLine: string;
  /** 첫 줄 훅에 넣은 검색 키워드 (인스타 AI가 주제를 분류할 때 읽어요) */
  seoKeywords: string[];
  /** 댓글→DM 자동화용 키워드 (DM 자료를 설정했을 때만) */
  commentKeyword: string;
  /** 슬라이드별 대체 텍스트 (인스타 고급 설정 → 접근성 → 대체 텍스트) */
  altTexts: string[];
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
  /** 배경 사진을 어떻게 만들었는지 (저작권 점검용): AI 새로 그리기 / 원본에서 글자 지우기 / 직접 올림 */
  bgSource?: 'ai-new' | 'ai-cleanup' | 'upload';
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
  /** 사용자가 선택한 기기 내 키 보관. 기본값은 꺼짐. */
  rememberKeys?: boolean;
  apiKey: string;
  textModel: string;
  imageModel: string;
  /** 인스타 링크로 자동 가져오기(Apify) 사용 여부 */
  apifyEnabled: boolean;
  apifyToken: string;
  /** 사용할 Apify 액터 (보통 바꿀 필요 없어요) */
  apifyActor: string;
}

/** 게시물 하나의 원본 입력 (사진·영상·설명글) */
export interface PostInput {
  sourceUrl: string;
  credit: string;
  caption: string;
  images: SourceImage[];
  video: File | null;
}

/** 모든 게시물에 똑같이 적용되는 공통 설정 */
export interface SharedOptions {
  countries: CountryCode[];
  imageMode: ImageMode;
  perCountryImages: boolean;
  autoImages: boolean;
  skipSolid: boolean;
  /** 댓글에 키워드를 남기면 DM으로 보내 줄 자료 (비우면 질문형 댓글 CTA) */
  dmOffer: string;
}

export type PostStatus = 'draft' | 'queued' | 'running' | 'done' | 'partial' | 'error';

/** 게시물 하나 = 입력 + 진행 상황 + 결과 */
export interface PostJob {
  id: string;
  input: PostInput;
  importing: boolean;
  importMessage: string;
  importError: string;
  /** 릴스 영상은 자동으로 못 가져와서, 직접 저장할 수 있게 영상 주소를 보여줘요 */
  importVideoUrl: string;
  status: PostStatus;
  log: string[];
  error: string;
  analysis: PostAnalysis | null;
  failedCountries?: CountryCode[];
  results: Partial<Record<CountryCode, CountryResult>>;
  aspect: AspectRatio;
  active: CountryCode | null;
}
