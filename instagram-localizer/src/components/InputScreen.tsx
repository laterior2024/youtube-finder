import { useRef, useState } from 'react';
import type { PostInput, PostJob, Settings, SharedOptions } from '../types';
import { COUNTRIES, COUNTRY_ORDER, REGIONS } from '../lib/countries';
import { fileToSourceImage } from '../lib/files';
import ImageLightbox from './ImageLightbox';

export const MAX_POSTS = 5;

export function hasContent(input: PostInput) {
  return input.images.length > 0 || !!input.video;
}

interface Props {
  posts: PostJob[];
  options: SharedOptions;
  settings: Settings;
  busy: boolean;
  onChangeInput: (id: string, patch: Partial<PostInput>) => void;
  onAddPost: () => void;
  onRemovePost: (id: string) => void;
  onImport: (id: string) => void;
  onBulkLinks: (urls: string[]) => void;
  onBulkPhotos: (files: File[]) => void;
  onOptions: (o: SharedOptions) => void;
  onOpenSettings: () => void;
  onStart: () => void;
}

const Section = ({ n, title, children }: { n: number | string; title: string; children: React.ReactNode }) => (
  <div className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10">
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-pink-500 px-2 text-sm font-bold">{n}</span>
      <h3 className="font-bold">{title}</h3>
    </div>
    {children}
  </div>
);

const inputCls = 'w-full rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-pink-400';

/** 여러 게시물을 한 번에 채우는 도구: 링크 여러 개 / 사진 여러 장 */
function BulkTools({
  settings,
  freeSlots,
  onBulkLinks,
  onBulkPhotos,
  onOpenSettings,
}: {
  settings: Settings;
  freeSlots: number;
  onBulkLinks: (urls: string[]) => void;
  onBulkPhotos: (files: File[]) => void;
  onOpenSettings: () => void;
}) {
  const [links, setLinks] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);
  const urls = links
    .split(/\s+/)
    .map((l) => l.trim())
    .filter((l) => /instagram\.com\//i.test(l));
  const apifyOn = settings.apifyEnabled;

  return (
    <div className="grid gap-4 rounded-2xl bg-gradient-to-br from-pink-500/10 to-orange-400/5 p-5 ring-1 ring-pink-400/25 lg:grid-cols-2">
      <div>
        <h3 className="font-bold">🔗 링크 여러 개 한 번에 넣기</h3>
        <p className="mt-1 text-xs text-white/55">
          한 줄에 링크 하나씩, 최대 {MAX_POSTS}개. 링크마다 게시물 칸이 하나씩 만들어져요.
          {apifyOn ? ' 사진·설명글도 자동으로 가져와요.' : ''}
        </p>
        <textarea
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          rows={4}
          placeholder={'https://www.instagram.com/p/...\nhttps://www.instagram.com/p/...'}
          className={`${inputCls} mt-2 text-sm`}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            disabled={!urls.length || !freeSlots}
            onClick={() => {
              onBulkLinks(urls.slice(0, freeSlots));
              setLinks('');
            }}
            className="rounded-lg bg-pink-500 px-3 py-1.5 text-sm font-bold disabled:opacity-40"
          >
            {apifyOn ? `🔗 ${Math.min(urls.length, freeSlots)}개 게시물로 나누고 자동 가져오기` : `📋 ${Math.min(urls.length, freeSlots)}개 게시물 칸에 나눠 넣기`}
          </button>
          {urls.length > freeSlots && <span className="text-xs text-amber-300">빈 칸이 {freeSlots}개라 앞의 {freeSlots}개만 넣어요.</span>}
        </div>
        {!apifyOn && (
          <p className="mt-2 text-[11px] text-white/45">
            💡 링크만으로 사진까지 자동으로 가져오려면{' '}
            <button onClick={onOpenSettings} className="text-pink-300 underline">
              ⚙️ 설정
            </button>
            에서 &quot;인스타 링크로 자동 가져오기(Apify)&quot;를 켜세요.
          </p>
        )}
      </div>
      <div>
        <h3 className="font-bold">🖼️ 사진 여러 장 → 각각 다른 게시물로</h3>
        <p className="mt-1 text-xs text-white/55">
          사진을 여러 장 고르면 <b>1장씩 따로</b> 게시물 칸에 들어가요 (최대 {MAX_POSTS}개). 한 게시물에 여러 장(캐러셀)을 넣으려면 아래 게시물 칸에 직접 올려 주세요.
        </p>
        <button
          disabled={!freeSlots}
          onClick={() => photoInput.current?.click()}
          className="mt-2 w-full rounded-xl border-2 border-dashed border-white/20 py-6 text-sm font-semibold hover:border-white/40 disabled:opacity-40"
        >
          🖼️ 사진 여러 장 고르기 (빈 칸 {freeSlots}개)
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) onBulkPhotos(Array.from(e.target.files).slice(0, freeSlots));
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

/** 게시물 하나의 입력 칸 */
function PostCard({
  post,
  number,
  settings,
  canRemove,
  onChange,
  onRemove,
  onImport,
}: {
  post: PostJob;
  number: number;
  settings: Settings;
  canRemove: boolean;
  onChange: (patch: Partial<PostInput>) => void;
  onRemove: () => void;
  onImport: () => void;
}) {
  const { input } = post;
  const imgInput = useRef<HTMLInputElement>(null);
  const vidInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState(true);
  /** 크게 보고 있는 사진 번호 (null이면 닫힘) */
  const [viewing, setViewing] = useState<number | null>(null);

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const images = await Promise.all(list.filter((f) => f.type.startsWith('image/')).map((f) => fileToSourceImage(f)));
    const video = list.find((f) => f.type.startsWith('video/')) ?? null;
    onChange({ images: [...input.images, ...images], video: video ?? input.video });
  };

  const move = (i: number, d: number) => {
    const next = [...input.images];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ images: next });
  };

  const summary = [
    input.images.length ? `사진 ${input.images.length}장` : '',
    input.video ? '영상 1개' : '',
    input.caption.trim() ? '설명글 ✓' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
      <div className="flex items-center gap-3 px-5 py-3">
        <button onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-3 text-left">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-500 font-extrabold">{number}</span>
          {input.images[0] && <img src={input.images[0].dataUrl} className="h-10 w-8 rounded object-cover" />}
          <span>
            <span className="block font-bold">게시물 {number}</span>
            <span className="block text-xs text-white/50">{summary || '아직 비어 있어요'}</span>
          </span>
          <span className="ml-auto text-white/40">{open ? '▲' : '▼'}</span>
        </button>
        {canRemove && (
          <button onClick={onRemove} className="rounded-lg px-2 py-1 text-xs text-red-300/80 hover:bg-red-500/10">
            삭제
          </button>
        )}
      </div>

      {open && (
        <div className="grid gap-3 border-t border-white/10 p-5">
          <label className="text-sm">
            <span className="text-white/70">원본 인스타 링크 {settings.apifyEnabled ? '(넣고 "가져오기"를 누르세요)' : '(기록·출처용)'}</span>
            <div className="mt-1 flex gap-2">
              <input
                value={input.sourceUrl}
                onChange={(e) => onChange({ sourceUrl: e.target.value })}
                placeholder="https://www.instagram.com/p/..."
                className={inputCls}
              />
              {settings.apifyEnabled && (
                <button
                  onClick={onImport}
                  disabled={post.importing || !input.sourceUrl.trim()}
                  className="shrink-0 rounded-lg bg-pink-500 px-4 text-sm font-bold disabled:opacity-40"
                >
                  {post.importing ? '가져오는 중…' : '🔗 가져오기'}
                </button>
              )}
            </div>
          </label>
          {(post.importMessage || post.importError || post.importVideoUrl) && (
            <div className="grid gap-1 text-xs">
              {post.importMessage && <p className={post.importing ? 'animate-pulse text-amber-300' : 'text-emerald-300'}>{post.importMessage}</p>}
              {post.importError && <p className="rounded-lg bg-red-500/15 px-3 py-2 text-red-200">❌ {post.importError}</p>}
              {post.importVideoUrl && !input.video && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200">
                  🎬 릴스 영상은 파일이 커서 자동으로 못 가져와요. 영상까지 분석하려면{' '}
                  <a href={post.importVideoUrl} target="_blank" rel="noreferrer" className="underline">
                    여기를 눌러 영상을 열고
                  </a>{' '}
                  저장한 뒤, 아래 &quot;🎬 영상 올리기&quot;로 올려 주세요. (안 올려도 표지 사진으로 만들 수 있어요)
                </p>
              )}
            </div>
          )}
          <label className="text-sm">
            <span className="text-white/70">원작자 계정 (설명글 끝에 출처로 들어가요 · 비워도 돼요)</span>
            <input
              value={input.credit}
              onChange={(e) => onChange({ credit: e.target.value })}
              placeholder="@original_account"
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="text-sm">
            <span className="text-white/70">원본 게시글(설명글)</span>
            <textarea
              value={input.caption}
              onChange={(e) => onChange({ caption: e.target.value })}
              rows={3}
              placeholder="인스타에서 게시글을 복사해서 붙여넣어 주세요."
              className={`${inputCls} mt-1`}
            />
          </label>

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
            className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center text-sm transition ${
              dragging ? 'border-pink-400 bg-pink-500/10' : 'border-white/15 hover:border-white/30'
            }`}
          >
            🖼️ <b>이 게시물의 사진 올리기</b>
            <span className="block text-xs text-white/50">캐러셀이면 순서대로 모두 올려 주세요 (1장 = 첫 슬라이드)</span>
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

          {input.images.length > 0 && (
            <>
              <p className="-mb-1 text-[11px] text-white/45">🔍 사진을 누르면 크게 보고 저장할 수 있어요.</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                {input.images.map((img, i) => (
                  <div key={i} className="relative overflow-hidden rounded-lg ring-1 ring-white/10">
                    <button onClick={() => setViewing(i)} className="block w-full cursor-zoom-in" title="크게 보기 · 저장">
                      <img src={img.dataUrl} alt={`${i + 1}번째 사진`} className="aspect-[4/5] w-full object-cover transition hover:opacity-80" />
                    </button>
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 text-[10px] font-bold">{i + 1}</span>
                    <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/70 px-1 text-[10px]">
                      <button onClick={() => move(i, -1)}>◀</button>
                      <button onClick={() => onChange({ images: input.images.filter((_, j) => j !== i) })} className="text-red-300">
                        삭제
                      </button>
                      <button onClick={() => move(i, 1)}>▶</button>
                    </div>
                  </div>
                ))}
              </div>
              {input.images.length > 1 && (
                <button onClick={() => setViewing(0)} className="justify-self-start text-xs text-pink-300 underline">
                  📦 사진 {input.images.length}장 크게 보기 · 한 번에 저장
                </button>
              )}
            </>
          )}
          {viewing !== null && input.images.length > 0 && (
            <ImageLightbox
              images={input.images}
              startIndex={Math.min(viewing, input.images.length - 1)}
              filePrefix={`post${number}`}
              onClose={() => setViewing(null)}
            />
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button onClick={() => vidInput.current?.click()} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15">
              🎬 영상 올리기
            </button>
            <input
              ref={vidInput}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => {
                onChange({ video: e.target.files?.[0] ?? null });
                e.target.value = '';
              }}
            />
            {input.video && (
              <span className="flex items-center gap-2 text-white/70">
                {input.video.name} ({(input.video.size / 1024 / 1024).toFixed(1)}MB)
                <button onClick={() => onChange({ video: null })} className="text-red-300">
                  ✕
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OptionsPanel({ options, onOptions, imageSlides }: { options: SharedOptions; onOptions: (o: SharedOptions) => void; imageSlides: number }) {
  const set = (patch: Partial<SharedOptions>) => onOptions({ ...options, ...patch });
  const imageCount = options.autoImages ? imageSlides * (options.perCountryImages ? options.countries.length : 1) : 0;

  return (
    <>
      <Section n="🌏" title="어느 나라용으로 만들까요? (모든 게시물에 똑같이 적용)">
        <p className="-mt-1 mb-3 text-xs text-white/50">
          💰 = 광고·협찬 단가가 높아 수익에 유리 · 👀 = 사용자가 많아 조회수에 유리. 나라를 많이 고를수록 AI 비용과 시간이 늘어나요.
        </p>
        <div className="grid gap-3">
          {REGIONS.map((r) => (
            <div key={r.id}>
              <div className="mb-1.5 text-xs font-semibold text-white/50">{r.label}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {COUNTRY_ORDER.filter((c) => COUNTRIES[c].region === r.id).map((c) => {
                  const on = options.countries.includes(c);
                  const info = COUNTRIES[c];
                  return (
                    <button
                      key={c}
                      onClick={() =>
                        set({
                          countries: on
                            ? options.countries.filter((x) => x !== c)
                            : COUNTRY_ORDER.filter((x) => x === c || options.countries.includes(x)),
                        })
                      }
                      className={`rounded-xl px-3 py-2 text-left ring-1 transition ${
                        on ? 'bg-pink-500 text-white ring-pink-400' : 'bg-white/5 text-white/80 ring-white/10 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-bold">
                        {info.flag} {info.nameKo}
                      </div>
                      <div className={`text-[11px] ${on ? 'text-white/85' : 'text-white/45'}`}>
                        {info.languageKo} · {info.why}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/60">
          {options.countries.length > 0 ? (
            <>
              선택: {options.countries.map((c) => `${COUNTRIES[c].flag} ${COUNTRIES[c].nameKo}`).join(', ')} ({options.countries.length}개)
            </>
          ) : (
            <span className="text-amber-300">나라를 하나 이상 골라 주세요.</span>
          )}
        </p>
      </Section>

      <Section n="🎨" title="이미지는 어떻게 만들까요? (모든 게시물에 똑같이 적용)">
        <div className="grid gap-2 text-sm">
          <label className="flex items-start gap-2">
            <input type="radio" checked={options.imageMode === 'new'} onChange={() => set({ imageMode: 'new' })} className="mt-1" />
            <span>
              <b>AI로 새로 그리기 (추천)</b>
              <span className="block text-white/60">원본의 구도·색감·분위기만 참고해서 새 이미지를 만들어요. 저작권 문제가 적고 나라에 맞게 바뀌어요.</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="radio" checked={options.imageMode === 'cleanup'} onChange={() => set({ imageMode: 'cleanup' })} className="mt-1" />
            <span>
              <b>원본에서 글자만 지우기</b>
              <span className="block text-white/60">원작자에게 허락을 받았거나, 내가 만든 원본일 때만 쓰세요.</span>
            </span>
          </label>
          <hr className="my-2 border-white/10" />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.autoImages} onChange={(e) => set({ autoImages: e.target.checked })} />
            번역이 끝나면 이미지도 자동으로 만들기
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.perCountryImages} onChange={(e) => set({ perCountryImages: e.target.checked })} />
            나라마다 이미지를 따로 만들기 (사람·장소가 그 나라에 맞게 바뀜 · 비용 증가)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={options.skipSolid} onChange={(e) => set({ skipSolid: e.target.checked })} />
            단색·그라데이션 배경은 AI 없이 원본 색으로 채우기 (무료 · 더 정확)
          </label>
          {imageCount > 0 && (
            <p className="mt-1 text-xs text-amber-300/90">
              모든 게시물을 합쳐 AI 이미지 최대 {imageCount}장을 만들어요. 이미지 생성은 Google 요금이 들어요 (1장에 대략 수십~수백 원).
            </p>
          )}
        </div>
      </Section>

      <Section n="💬" title="댓글 → DM 자동화 (선택 · 모든 게시물에 적용)">
        <p className="-mt-1 text-xs leading-relaxed text-white/55">
          설명글 마지막에 <b>&quot;💬 댓글에 &apos;키워드&apos;를 남기면 ○○를 DM으로 보내드려요&quot;</b> 문구를 넣어요. 댓글과 DM 대화가 함께 늘어서 노출에 유리해요.
          <br />
          <b className="text-amber-200">보낼 자료가 실제로 있고, DM 자동 응답(인스타 자동 응답 · ManyChat 등)을 설정할 때만</b> 쓰세요. 비워 두면 쉽게 답할 수 있는 질문형 댓글 문구를 넣어요.
        </p>
        <label className="mt-3 block text-sm">
          <span className="text-white/70">DM으로 보낼 자료</span>
          <input
            value={options.dmOffer}
            onChange={(e) => set({ dmOffer: e.target.value })}
            placeholder="예: 풀버전 가이드 PDF, 추천 제품 링크 모음 (비워 두면 사용 안 함)"
            className="mt-1 w-full rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-pink-400"
          />
        </label>
        <p className="mt-1 text-[11px] text-white/40">AI가 나라별로 짧은 댓글 키워드를 정해 주고, 결과 화면에 그 키워드가 표시돼요. 그 키워드로 DM 자동 응답을 설정하세요.</p>
      </Section>
    </>
  );
}

export default function InputScreen(props: Props) {
  const { posts, options, settings, busy } = props;
  const ready = posts.filter((p) => hasContent(p.input));
  const freeSlots = MAX_POSTS - posts.length + posts.filter((p) => !hasContent(p.input) && !p.input.sourceUrl.trim()).length;
  const imageSlides = ready.reduce((n, p) => n + p.input.images.length, 0);
  const importing = posts.some((p) => p.importing);
  const canStart = !busy && !importing && ready.length > 0 && options.countries.length > 0;

  return (
    <div className="grid gap-4">
      <BulkTools
        settings={settings}
        freeSlots={freeSlots}
        onBulkLinks={props.onBulkLinks}
        onBulkPhotos={props.onBulkPhotos}
        onOpenSettings={props.onOpenSettings}
      />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-extrabold">
          📦 만들 게시물 <span className="text-pink-300">{posts.length}</span>
          <span className="text-white/40">/{MAX_POSTS}</span>
        </h2>
        {posts.length < MAX_POSTS && (
          <button onClick={props.onAddPost} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15">
            + 게시물 추가
          </button>
        )}
      </div>

      {posts.map((p, i) => (
        <PostCard
          key={p.id}
          post={p}
          number={i + 1}
          settings={settings}
          canRemove={posts.length > 1}
          onChange={(patch) => props.onChangeInput(p.id, patch)}
          onRemove={() => props.onRemovePost(p.id)}
          onImport={() => props.onImport(p.id)}
        />
      ))}

      <OptionsPanel options={options} onOptions={props.onOptions} imageSlides={imageSlides} />

      <button
        disabled={!canStart}
        onClick={props.onStart}
        className="rounded-2xl bg-gradient-to-r from-pink-500 via-fuchsia-500 to-orange-400 py-4 text-lg font-extrabold text-white shadow-lg transition disabled:opacity-40"
      >
        {busy
          ? '만드는 중…'
          : importing
            ? '링크에서 가져오는 중…'
            : ready.length > 1
              ? `✨ 게시물 ${ready.length}개 한 번에 만들기`
              : '✨ 분석하고 새 게시물 만들기'}
      </button>
      {ready.length > 0 && ready.length < posts.length && (
        <p className="-mt-2 text-center text-xs text-white/45">사진이나 영상이 없는 게시물 칸은 건너뛰어요.</p>
      )}
    </div>
  );
}
