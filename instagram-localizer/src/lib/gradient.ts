import type { BackgroundType, GradientSettings } from '../types';

export const GRADIENT_PRESETS: { label: string; value: Omit<GradientSettings, 'enabled' | 'position' | 'color'> }[] = [
  { label: '은은하게', value: { height: 35, opacity: 0.45, softness: 1 } },
  { label: '보통', value: { height: 50, opacity: 0.7, softness: 0.8 } },
  { label: '진하게', value: { height: 60, opacity: 0.9, softness: 0.6 } },
];

/** 사진·그림 배경이면 아래쪽 그라데이션을 기본으로 켜고, 단색 배경이면 꺼 둡니다. */
export function defaultGradient(backgroundType: BackgroundType): GradientSettings {
  return {
    enabled: backgroundType === 'photo' || backgroundType === 'illustration',
    position: 'bottom',
    color: '#000000',
    ...GRADIENT_PRESETS[1].value,
  };
}
