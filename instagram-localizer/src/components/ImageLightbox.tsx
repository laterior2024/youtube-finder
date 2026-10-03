import { useEffect, useState } from 'react';
import type { SourceImage } from '../types';
import { downloadBlob } from '../lib/files';

interface Props {
  images: SourceImage[];
  startIndex: number;
  /** 저장할 때 파일 이름 앞에 붙는 글자 (예: post1) */
  filePrefix: string;
  onClose: () => void;
}

function extensionOf(dataUrl: string) {
  const mime = /^data:image\/(\w+)/.exec(dataUrl)?.[1] ?? 'jpeg';
  return mime === 'jpeg' ? 'jpg' : mime;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

/** 사진을 화면 가득 크게 보고, 한 장 또는 전체를 저장하는 창 */
export default function ImageLightbox({ images, startIndex, filePrefix, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [saving, setSaving] = useState(false);
  const img = images[index];
  const count = images.length;
  const go = (d: number) => setIndex((i) => (i + d + count) % count);
  const fileName = (i: number) => `${filePrefix}_${String(i + 1).padStart(2, '0')}.${extensionOf(images[i].dataUrl)}`;

  // 키보드: ← → 로 넘기고, Esc 로 닫아요.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!img) return null;

  const saveOne = async () => downloadBlob(await dataUrlToBlob(img.dataUrl), fileName(index));

  const saveAll = async () => {
    setSaving(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (let i = 0; i < count; i++) zip.file(fileName(i), await dataUrlToBlob(images[i].dataUrl));
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `${filePrefix}_images.zip`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm" onClick={onClose}>
      <div className="flex items-center justify-between gap-2 px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-bold text-white/80">
          {index + 1} / {count}
          <span className="ml-2 font-normal text-white/40">
            {img.width}×{img.height}
          </span>
        </span>
        <div className="flex flex-wrap gap-2">
          <button onClick={saveOne} className="rounded-lg bg-pink-500 px-3 py-1.5 text-sm font-bold">
            ⬇️ 이 사진 저장
          </button>
          {count > 1 && (
            <button onClick={saveAll} disabled={saving} className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-bold disabled:opacity-50">
              {saving ? '묶는 중…' : `📦 ${count}장 모두 저장 (ZIP)`}
            </button>
          )}
          <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm" aria-label="닫기">
            ✕ 닫기
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <img
          src={img.dataUrl}
          alt={`${index + 1}번째 사진`}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
        {count > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl hover:bg-black/80"
              aria-label="이전 사진"
            >
              ‹
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-2xl hover:bg-black/80"
              aria-label="다음 사진"
            >
              ›
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 pb-4" onClick={(e) => e.stopPropagation()}>
          {images.map((im, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-16 w-12 shrink-0 overflow-hidden rounded ring-2 ${i === index ? 'ring-pink-400' : 'ring-transparent opacity-60 hover:opacity-100'}`}
            >
              <img src={im.dataUrl} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
