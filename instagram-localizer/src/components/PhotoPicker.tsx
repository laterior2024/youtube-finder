import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SourceImage } from '../types';

export default function PhotoPicker({ images, onDone }: { images: SourceImage[]; onDone: (indexes: number[] | null) => void }) {
  const [chosen, setChosen] = useState(() => images.map((_, i) => i));
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return createPortal(<dialog ref={ref} onCancel={e => { e.preventDefault(); onDone(null); }} className="photo-dialog" aria-labelledby="photo-picker-title">
    <h2 id="photo-picker-title" className="text-lg font-bold">가져올 인스타 사진 선택</h2>
    <p className="mt-2 text-sm">선택한 {chosen.length} / {images.length}장만 입력에 넣어요. 미리보기를 준비하는 Apify 조회는 이미 1회 실행됐어요. 취소해도 조회 비용은 취소되지 않아요.</p>
    <div className="my-3 flex gap-2"><button className="secondary-action" onClick={() => setChosen(images.map((_, i) => i))}>전체 선택</button><button className="secondary-action" onClick={() => setChosen([])}>선택 해제</button></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{images.map((image, i) => <label key={i} className={`cursor-pointer rounded-lg border-2 p-2 ${chosen.includes(i) ? 'border-pink-500 bg-pink-500/10' : 'border-gray-400/40'}`}>
      <img src={image.dataUrl} alt={`인스타 사진 ${i + 1}`} className="h-32 w-full object-contain" />
      <span className="mt-2 flex min-h-10 items-center gap-2"><input aria-label={`사진 ${i + 1}`} type="checkbox" checked={chosen.includes(i)} onChange={e => setChosen(e.target.checked ? [...chosen, i].sort((a, b) => a - b) : chosen.filter(n => n !== i))} />사진 {i + 1}</span>
    </label>)}</div>
    <div className="sticky bottom-0 mt-4 flex flex-wrap justify-end gap-2 bg-[var(--panel-bg)] py-3"><button className="secondary-action" onClick={() => onDone(null)}>취소</button><button disabled={!chosen.length} className="rounded-lg bg-pink-600 px-4 py-3 font-bold text-white disabled:opacity-40" onClick={() => onDone(chosen)}>선택한 {chosen.length}장 가져오기</button></div>
  </dialog>, document.body);
}
