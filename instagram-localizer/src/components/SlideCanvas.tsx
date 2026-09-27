import { useEffect, useRef } from 'react';
import type { AspectRatio, WorkingSlide } from '../types';
import { renderSlide } from '../lib/render';

interface Props {
  slide: WorkingSlide;
  lang: 'ko' | 'ja' | 'es';
  aspect: AspectRatio;
  className?: string;
}

/** 슬라이드를 미리보기로 그립니다. 빠르게 수정해도 마지막 상태만 화면에 반영돼요. */
export default function SlideCanvas({ slide, lang, aspect, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const token = useRef(0);

  useEffect(() => {
    const my = ++token.current;
    const off = document.createElement('canvas');
    const t = setTimeout(async () => {
      await renderSlide(off, slide, lang, aspect);
      const target = ref.current;
      if (!target || my !== token.current) return;
      target.width = off.width;
      target.height = off.height;
      target.getContext('2d')!.drawImage(off, 0, 0);
    }, 60);
    return () => clearTimeout(t);
  }, [slide, lang, aspect]);

  return <canvas ref={ref} className={className} style={{ width: '100%', height: 'auto', display: 'block' }} />;
}
