/**
 * TemplateSpec — 분석 결과, 캡컷 내보내기, 변형 생성이 모두 공유하는 데이터 구조.
 *
 * 좌표 규칙
 * - 모든 위치/크기는 캔버스 대비 비율(0~1), 원점은 왼쪽 위.
 * - px 값은 캔버스 너비 1080 기준 참고값 (캡컷 폰트 크기 환산 등에 사용).
 * - 캡컷 좌표(중앙 기준 -1~1)로의 변환은 export/capcut 모듈에서만 한다.
 */

export type Hex = `#${string}`;

export interface Rect {
  x: number; // 0~1, 왼쪽 위 기준
  y: number;
  w: number;
  h: number;
}

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

export interface Fill {
  type: 'solid' | 'linear-gradient';
  colors: Hex[]; // solid면 1개, gradient면 2개 이상
  angleDeg?: number;
  opacity: number; // 0~1
}

export interface Stroke {
  color: Hex;
  widthPx: number;
}

export interface Shadow {
  color: Hex;
  opacity: number;
  offsetXPx: number;
  offsetYPx: number;
  blurPx: number;
}

export interface FontGuess {
  family: string; // 예: "Gmarket Sans"
  weight: number; // 100~900
  similarity: number; // 0~1, 렌더링 비교 점수
  capcutBuiltIn: boolean; // 캡컷 내장 폰트 여부
  license?: 'commercial-free' | 'personal-only' | 'unknown';
  downloadUrl?: string;
}

export interface TextStyle {
  font: FontGuess;
  alternatives: FontGuess[]; // 대안 후보 (최대 2개)
  sizePx: number; // 1080 기준 글자 크기
  lineHeight: number; // 배수 (1.2 등)
  letterSpacing: number; // em
  align: 'left' | 'center' | 'right';
  color: Hex;
  highlightColor?: Hex; // 강조 단어 색
  stroke?: Stroke;
  shadow?: Shadow;
  background?: Fill & { paddingPx: number; radiusPx: number }; // 글자 뒤 박스
}

interface LayerBase {
  id: string;
  label: string; // 사람이 읽는 이름: "상단 박스"
  rect: Rect;
  zIndex: number;
  confidence: number; // 0~1, 자동 분석 확신도 (낮으면 편집기에서 강조)
}

/** 매 영상 고정인 박스/배경 */
export interface BoxLayer extends LayerBase {
  kind: 'box';
  fill: Fill;
  radiusPx: number;
  stroke?: Stroke;
  shadow?: Shadow;
}

/** 위치·스타일 고정, 글자는 영상마다 바뀌는 텍스트 (제목 등) */
export interface TextSlotLayer extends LayerBase {
  kind: 'text-slot';
  role: 'title' | 'subtitle-top' | 'channel-name' | 'label';
  style: TextStyle;
  maxLines: number;
  sampleText: string; // 원본 문구가 아닌 자리표시 문구
}

/** 대사 자막 (시간에 따라 바뀜) */
export interface CaptionLayer extends LayerBase {
  kind: 'caption';
  style: TextStyle;
  maxCharsPerLine: number;
  maxLines: number;
  emphasisRule?: 'keyword-color' | 'none';
}

/** 로고/워터마크 자리 — 원본 이미지는 절대 저장하지 않음 */
export interface LogoLayer extends LayerBase {
  kind: 'logo';
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';
  opacity: number;
  userAsset?: string; // 사용자가 올린 로고 파일 id
}

/** 메인 영상이 들어가는 영역 */
export interface VideoAreaLayer extends LayerBase {
  kind: 'video-area';
  fit: 'cover' | 'contain';
}

export type Layer = BoxLayer | TextSlotLayer | CaptionLayer | LogoLayer | VideoAreaLayer;

export interface Palette {
  primary: Hex;
  secondary: Hex;
  accent: Hex;
  text: Hex;
  background: Hex;
}

export interface TemplateSpec {
  version: 1;
  id: string;
  name: string;
  canvas: { aspect: AspectRatio; widthPx: number; heightPx: number };
  layers: Layer[];
  palette: Palette;
  source: {
    type: 'youtube-video' | 'youtube-channel' | 'screenshots' | 'video-file';
    urls?: string[];
    videoIds?: string[];
    analyzedAt: string; // ISO
  };
  checks: {
    minContrastRatio: number; // 글자-배경 최소 대비율
    shortsSafeArea: boolean; // 쇼츠 UI 가림 영역 회피 여부
  };
  insights?: string[]; // "왜 먹히나" 요약
  variation?: {
    baseTemplateId: string;
    preset: 'faithful' | 'color-swap' | 'minimal' | 'impact' | 'mirror';
    description: string;
  };
}
