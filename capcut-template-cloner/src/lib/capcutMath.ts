/**
 * TemplateSpec(0~1, 왼쪽 위 기준) → 캡컷 초안 값 변환.
 * phase0/spec_to_capcut.py를 옮긴 것. 두 파일의 공식과 보정값은 항상 같게 유지한다.
 *
 * 캡컷 좌표: transform_x는 오른쪽이 +1, transform_y는 위쪽이 +1 (단위: 캔버스 절반)
 * 이미지는 캔버스에 contain으로 맞춘 뒤 scale이 곱해진다. (0단계 T3에서 확인)
 */
import type { Rect } from '../../spec/template-spec';

export const CALIBRATION = {
  /** T3 스크린샷으로 정밀 보정 전의 추정치. T2가 캡컷 9.0에서 "비슷함"으로 확인됨 */
  calibrated: false,
  /** 1080px 너비 캔버스에서 캡컷 글자 크기 1단위 = 몇 px */
  pxPerSizeUnit: 5.0,
  /** 캡컷 테두리 두께(UI 0~100) 1단위 = 몇 px */
  strokePxPerUnit: 0.2,
};

export function rectCenterTransform(rect: Rect): { x: number; y: number } {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { x: cx * 2 - 1, y: 1 - cy * 2 };
}

/** img(imgW×imgH)가 rect 크기로 보이게 하는 캡컷 scale. 이미지 비율 = rect 비율 가정 */
export function imageScaleForRect(rect: Rect, canvasW: number, canvasH: number, imgW: number, imgH: number): number {
  const fit = Math.min(canvasW / imgW, canvasH / imgH);
  return (rect.w * canvasW) / (imgW * fit);
}

export function textSizeUnits(sizePx: number, canvasW: number): number {
  const on1080 = sizePx * (1080 / canvasW);
  return Math.round((on1080 / CALIBRATION.pxPerSizeUnit) * 100) / 100;
}

/** 테두리 px → 캡컷 UI 값(0~100) */
export function strokeUiWidth(strokePx: number): number {
  return Math.max(0, Math.min(100, Math.round((strokePx / CALIBRATION.strokePxPerUnit) * 10) / 10));
}

/** 캡컷 UI 테두리 값 → 초안 JSON의 width (pycapcut과 같은 매핑) */
export function strokeJsonWidth(uiWidth: number): number {
  return (uiWidth / 100) * 0.2;
}

export function rectToPx(rect: Rect, w: number, h: number) {
  return {
    left: Math.round(rect.x * w),
    top: Math.round(rect.y * h),
    width: Math.max(1, Math.round(rect.w * w)),
    height: Math.max(1, Math.round(rect.h * h)),
  };
}
