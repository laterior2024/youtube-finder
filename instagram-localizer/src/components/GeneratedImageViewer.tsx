import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AspectRatio, WorkingSlide } from '../types';
import type { Lang } from '../lib/countries';
import SlideCanvas from './SlideCanvas';

export default function GeneratedImageViewer({ slides, startIndex, lang, aspect, onClose }: {
  slides: WorkingSlide[]; startIndex: number; lang: Lang; aspect: AspectRatio; onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const ref = useRef<HTMLDialogElement>(null);
  const ratio = aspect === '1:1' ? 1 : aspect === '4:5' ? 0.8 : 0.5625;
  const current = Math.min(index, slides.length - 1);
  const move = (step: number) => { setIndex(i => Math.max(0, Math.min(slides.length - 1, i + step))); setZoom(1); };
  useEffect(() => {
    const dialog = ref.current!; const overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, []);
  return createPortal(<dialog ref={ref} className="generated-viewer" aria-label="생성된 사진 크게보기" onCancel={e => { e.preventDefault(); onClose(); }}
    onKeyDown={e => { if ((e.target as HTMLElement).tagName === 'INPUT') return; if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); move(1); } }}>
    <div className="flex flex-wrap items-center justify-between gap-2 p-3"><b>사진 {current + 1} / {slides.length}</b><button autoFocus className="secondary-action" onClick={onClose}>크게보기 닫기 ✕</button></div>
    <div className="min-h-0 flex-1 overflow-auto p-2" data-testid="zoom-scroll">
      {slides[current] && <div className="mx-auto" style={{ width: `calc(min(90vw, 68dvh * ${ratio}) * ${zoom})`, maxWidth: 'none' }}><SlideCanvas slide={slides[current]} lang={lang} aspect={aspect} /></div>}
    </div>
    <div className="flex flex-wrap items-center justify-center gap-3 p-3">
      <button className="secondary-action" disabled={current <= 0} onClick={() => move(-1)}>← 이전 사진</button>
      <label className="flex items-center gap-2">확대 {Math.round(zoom * 100)}%<input aria-label="사진 확대 비율" type="range" min="1" max="3" step="0.25" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-28" /></label>
      <button className="secondary-action" disabled={current >= slides.length - 1} onClick={() => move(1)}>다음 사진 →</button>
    </div>
  </dialog>, document.body);
}
