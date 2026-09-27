import { useRef, useState } from 'react';
import type { CountryCode, ImageMode, SourceImage } from '../types';
import { COUNTRIES, COUNTRY_ORDER } from '../lib/countries';
import { fileToSourceImage } from '../lib/files';

export interface UploadState {
  sourceUrl: string;
  credit: string;
  caption: string;
  images: SourceImage[];
  video: File | null;
  countries: CountryCode[];
  imageMode: ImageMode;
  perCountryImages: boolean;
  autoImages: boolean;
  skipSolid: boolean;
}

interface Props {
  state: UploadState;
  onChange: (s: UploadState) => void;
  onStart: () => void;
  busy: boolean;
}

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <div className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10">
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-500 text-sm font-bold">{n}</span>
      <h3 className="font-bold">{title}</h3>
    </div>
    {children}
  </div>
);

export default function UploadPanel({ state, onChange, onStart, busy }: Props) {
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const set = (patch: Partial<UploadState>) => onChange({ ...state, ...patch });

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const images = await Promise.all(list.filter((f) => f.type.startsWith('image/')).map((f) => fileToSourceImage(f)));
    const video = list.find((f) => f.type.startsWith('video/')) ?? null;
    onChange({ ...state, images: [...state.images, ...images], video: video ?? state.video });
  };

  const move = (i: number, d: number) => {
    const next = [...state.images];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ images: next });
  };

  const imageSlides = state.images.length;
  const imageCount = state.autoImages ? imageSlides * (state.perCountryImages ? state.countries.length : 1) : 0;
  const canStart = !busy && (state.images.length > 0 || state.video) && state.countries.length > 0;

  return (
    <div className="grid gap-4">
      <Step n={1} title="원본 게시물 정보">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-white/70">원본 인스타 링크 (기록·출처용)</span>
            <input
              value={state.sourceUrl}
              onChange={(e) => set({ sourceUrl: e.target.value })}
              placeholder="https://www.instagram.com/p/..."
              className="mt-1 w-full rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-pink-400"
            />
          </label>
          <label className="text-sm">
            <span className="text-white/70">원작자 계정 (캡션 끝에 출처로 들어가요 · 비워도 돼요)</span>
            <input
              value={state.credit}
              onChange={(e) => set({ credit: e.target.value })}
              placeholder="@original_account"
              className="mt-1 w-full rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-pink-400"
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-white/70">원본 게시글(캡션) 붙여넣기</span>
          <textarea
            value={state.caption}
            onChange={(e) => set({ caption: e.target.value })}
            rows={4}
            placeholder="인스타에서 게시글을 길게 눌러 복사한 뒤 여기에 붙여넣어 주세요."
            className="mt-1 w-full rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-pink-400"
          />
        </label>
      </Step>

      <Step n={2} title="원본 이미지 · 영상 올리기">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => imgInput.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
            dragging ? 'border-pink-400 bg-pink-500/10' : 'border-white/15 hover:border-white/30'
          }`}
        >
          <div className="text-3xl">🖼️</div>
          <p className="mt-2 font-semibold">여기를 눌러 이미지를 고르거나, 파일을 끌어다 놓으세요</p>
          <p className="mt-1 text-xs text-white/50">캐러셀이면 순서대로 모두 올려 주세요 (1장 = 첫 슬라이드)</p>
          <input
            ref={imgInput}
            type="file"
            accept="image/*,video/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {state.images.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {state.images.map((img, i) => (
              <div key={i} className="group relative overflow-hidden rounded-lg ring-1 ring-white/10">
                <img src={img.dataUrl} className="aspect-[4/5] w-full object-cover" />
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-xs font-bold">{i + 1}</span>
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 p-1 text-xs">
                  <button onClick={() => move(i, -1)} className="px-1">
                    ◀
                  </button>
                  <button onClick={() => set({ images: state.images.filter((_, j) => j !== i) })} className="px-1 text-red-300">
                    삭제
                  </button>
                  <button onClick={() => move(i, 1)} className="px-1">
                    ▶
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <button onClick={() => vidInput.current?.click()} className="rounded-lg bg-white/10 px-3 py-2 hover:bg-white/15">
            🎬 영상(릴스) 올리기
          </button>
          <input
            ref={vidInput}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => {
              set({ video: e.target.files?.[0] ?? null });
              e.target.value = '';
            }}
          />
          {state.video && (
            <span className="flex items-center gap-2 text-white/70">
              {state.video.name} ({(state.video.size / 1024 / 1024).toFixed(1)}MB)
              <button onClick={() => set({ video: null })} className="text-red-300">
                ✕
              </button>
            </span>
          )}
        </div>
      </Step>

      <Step n={3} title="어느 나라용으로 만들까요?">
        <div className="flex flex-wrap gap-2">
          {COUNTRY_ORDER.map((c) => {
            const on = state.countries.includes(c);
            return (
              <button
                key={c}
                onClick={() =>
                  set({ countries: on ? state.countries.filter((x) => x !== c) : COUNTRY_ORDER.filter((x) => x === c || state.countries.includes(x)) })
                }
                className={`rounded-full px-4 py-2 font-semibold ring-1 transition ${
                  on ? 'bg-pink-500 text-white ring-pink-400' : 'bg-white/5 text-white/70 ring-white/10 hover:bg-white/10'
                }`}
              >
                {COUNTRIES[c].flag} {COUNTRIES[c].nameKo}
              </button>
            );
          })}
        </div>
      </Step>

      <Step n={4} title="이미지는 어떻게 만들까요?">
        <div className="grid gap-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" checked={state.imageMode === 'new'} onChange={() => set({ imageMode: 'new' })} className="mt-1" />
            <span>
              <b>AI로 새로 그리기 (추천)</b>
              <span className="block text-white/60">원본의 구도·색감·분위기만 참고해서 새 이미지를 만들어요. 저작권 문제가 적고 나라에 맞게 바뀌어요.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" checked={state.imageMode === 'cleanup'} onChange={() => set({ imageMode: 'cleanup' })} className="mt-1" />
            <span>
              <b>원본에서 글자만 지우기</b>
              <span className="block text-white/60">원작자에게 허락을 받았거나, 내가 만든 원본일 때만 쓰세요.</span>
            </span>
          </label>
          <hr className="my-2 border-white/10" />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={state.autoImages} onChange={(e) => set({ autoImages: e.target.checked })} />
            번역이 끝나면 이미지도 자동으로 만들기
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={state.perCountryImages} onChange={(e) => set({ perCountryImages: e.target.checked })} />
            나라마다 이미지를 따로 만들기 (사람·장소가 그 나라에 맞게 바뀜 · 비용 증가)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={state.skipSolid} onChange={(e) => set({ skipSolid: e.target.checked })} />
            단색·그라데이션 배경은 AI 없이 원본 색으로 채우기 (무료 · 더 정확)
          </label>
          {imageCount > 0 && (
            <p className="mt-1 text-xs text-amber-300/90">
              AI 이미지 최대 {imageCount}장을 만들어요. 이미지 생성은 Google 요금이 들어요 (1장에 대략 수십~수백 원).
            </p>
          )}
        </div>
      </Step>

      <button
        disabled={!canStart}
        onClick={onStart}
        className="rounded-2xl bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 py-4 text-lg font-extrabold text-white shadow-lg transition disabled:opacity-40"
      >
        {busy ? '만드는 중…' : '✨ 분석하고 새 게시물 만들기'}
      </button>
    </div>
  );
}
