import { useCallback, useState } from 'react';
import type { Layer, Rect, TemplateSpec } from '../spec/template-spec';
import { analyzeFrames, makeSpec, videoLayer } from './analyze/detect';
import { canvasFor } from './analyze/frames';
import { fileToDataUrl, loadImage, loadShots, type Shot } from './lib/images';
import { ExportPanel } from './ui/ExportPanel';
import { LayerPanel } from './ui/LayerPanel';
import { Stage } from './ui/Stage';
import { VariationsPanel } from './ui/VariationsPanel';

export default function App() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [spec, setSpec] = useState<TemplateSpec | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mix, setMix] = useState(0.55);
  const [showFrames, setShowFrames] = useState(true);
  const [pickCb, setPickCb] = useState<((hex: string) => void) | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);

  const analyze = async (files: File[]) => {
    setBusy(true);
    setError(null);
    try {
      const images = files.filter((f) => f.type.startsWith('image/')).slice(0, 5);
      if (images.length === 0) throw new Error('이미지 파일(png, jpg)을 올려 주세요.');
      const loaded = await loadShots(images);
      // 무거운 계산 전에 화면이 한 번 그려지도록 양보
      await new Promise((r) => setTimeout(r, 30));
      const result = analyzeFrames(loaded.map((s) => s.frame));
      setShots(loaded);
      setSpec(result.spec);
      setNotes(result.notes);
      setFrameIdx(0);
      setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadTemplate = async (file: File) => {
    try {
      const loaded = JSON.parse(await file.text()) as TemplateSpec;
      if (loaded.version !== 1 || !Array.isArray(loaded.layers)) throw new Error('틀복사 template.json 파일이 아니에요.');
      setSpec(loaded);
      setShots([]);
      setNotes([]);
      setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const startBlank = () => {
    const c = canvasFor(1080, 1920);
    setSpec(makeSpec(c, [videoLayer({ x: 0, y: 0, w: 1, h: 1 }, 1)]));
    setShots([]);
    setNotes([]);
  };

  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => {
    setSpec((s) => s && { ...s, layers: s.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) });
  }, []);
  const setRect = useCallback((id: string, rect: Rect) => updateLayer(id, { rect }), [updateLayer]);

  const shot = shots[frameIdx] ?? null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-black">🎬 틀복사 스튜디오 <span className="ml-1 align-middle text-xs font-normal text-neutral-500">1단계 MVP</span></h1>
        <p className="mt-1 text-sm text-neutral-400">떡상 영상 스크린샷을 올리면 고정 틀(박스·제목·자막·로고)을 찾아서 <b>캡컷 PC 초안</b>으로 바로 만들어 드려요.</p>
      </header>

      {!spec && (
        <section
          className="rounded-2xl border-2 border-dashed border-neutral-700 p-8 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); analyze([...e.dataTransfer.files]); }}
        >
          <p className="text-lg font-bold">① 같은 영상(또는 같은 채널)의 스크린샷 3~5장을 올려 주세요</p>
          <p className="mt-2 text-sm text-neutral-400">
            <b>장면이 서로 다른 순간</b>을 찍어야 "안 변하는 틀"을 찾을 수 있어요. 자막이 보이는 장면이면 더 좋아요.<br />
            휴대폰 화면 캡처라면 유튜브 버튼·상태표시줄이 없도록 영상 부분만 잘라 주세요.
          </p>
          <label className="mt-5 inline-block cursor-pointer rounded-lg bg-emerald-500 px-6 py-3 font-bold text-black hover:bg-emerald-400">
            {busy ? '분석 중…' : '스크린샷 고르기'}
            <input type="file" accept="image/*" multiple className="hidden" disabled={busy}
              onChange={(e) => e.target.files && analyze([...e.target.files])} />
          </label>
          <p className="mt-3 text-xs text-neutral-500">또는 이 상자에 끌어다 놓기</p>
          <div className="mt-6 flex justify-center gap-3 text-xs">
            <label className="cursor-pointer text-neutral-400 underline">
              template.json 불러오기
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && loadTemplate(e.target.files[0])} />
            </label>
            <button onClick={startBlank} className="text-neutral-400 underline">빈 틀에서 시작</button>
          </div>
          {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        </section>
      )}

      {spec && (
        <div className="grid gap-6 md:grid-cols-[minmax(0,420px)_1fr]">
          <div>
            <Stage
              spec={spec} shot={shot} mix={mix} showFrames={showFrames}
              selectedId={selectedId} onSelect={setSelectedId} onRect={setRect}
              picking={!!pickCb} onPick={(hex) => { pickCb?.(hex); setPickCb(null); }}
              logo={logo} captionIndex={frameIdx}
            />
            {pickCb && <p className="mt-2 text-center text-sm text-amber-400">💧 원본에서 색을 찍을 곳을 클릭하세요 <button className="underline" onClick={() => setPickCb(null)}>취소</button></p>}
            {shots.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  {shots.map((s, i) => (
                    <button key={s.name + i} onClick={() => setFrameIdx(i)}
                      className={`w-12 overflow-hidden rounded border-2 ${i === frameIdx ? 'border-emerald-400' : 'border-transparent'}`}>
                      <img src={s.url} alt="" />
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-xs text-neutral-400">
                  원본
                  <input type="range" min={0} max={1} step={0.05} value={mix} onChange={(e) => setMix(+e.target.value)} className="flex-1" />
                  재현
                </label>
                <label className="flex items-center gap-2 text-xs text-neutral-400">
                  <input type="checkbox" checked={showFrames} onChange={(e) => setShowFrames(e.target.checked)} /> 레이어 테두리 보기
                </label>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {notes.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-300">
                {notes.map((n) => <li key={n}>• {n}</li>)}
              </ul>
            )}
            <section>
              <h2 className="mb-2 font-bold">② 분석 결과 확인·수정</h2>
              <p className="mb-3 text-xs text-neutral-400">왼쪽 화면에서 틀을 드래그해서 옮기고, 선택하면 오른쪽 아래 모서리로 크기를 바꿀 수 있어요. 💧로 원본 색을 찍어요.</p>
              <LayerPanel
                layers={spec.layers} selectedId={selectedId} onSelect={setSelectedId}
                onChange={updateLayer}
                onAdd={(l) => { setSpec({ ...spec, layers: [...spec.layers, l] }); setSelectedId(l.id); }}
                onDelete={(id) => { setSpec({ ...spec, layers: spec.layers.filter((l) => l.id !== id) }); setSelectedId(null); }}
                onPick={(cb) => setPickCb(() => cb)} picking={!!pickCb}
              />
            </section>
            <section>
              <h2 className="mb-2 font-bold">③ 내 것으로</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-neutral-400">
                  틀 이름 (캡컷 초안 이름이 돼요)
                  <input value={spec.name} onChange={(e) => setSpec({ ...spec, name: e.target.value })}
                    className="mt-1 w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100" />
                </label>
                <label className="block text-xs text-neutral-400">
                  내 로고 (선택, PNG 권장)
                  <input type="file" accept="image/*" className="mt-1 block w-full text-xs"
                    onChange={async (e) => { const f = e.target.files?.[0]; if (f) setLogo(await loadImage(await fileToDataUrl(f))); }} />
                </label>
              </div>
              <p className="mt-2 text-[11px] text-neutral-500">원본 채널의 로고·그래픽은 가져오지 않아요. 로고 자리는 내 로고나 "LOGO" 표시로 채워져요.</p>
            </section>
            <section>
              <h2 className="mb-2 font-bold">④ 받기 (지금 편집 중인 틀)</h2>
              <ExportPanel spec={spec} logo={logo} />
            </section>
          </div>
          <section className="md:col-span-2">
            <h2 className="mb-1 font-bold">⑤ 비슷한 틀 5개</h2>
            <p className="mb-3 text-xs text-neutral-400">
              위에서 만든 틀을 바탕으로 배치·대비 규칙은 지키고 겉모습만 바꾼 틀이에요. 원본과 구분되도록 하나 이상 바꿔 쓰는 걸 추천해요.
            </p>
            <VariationsPanel spec={spec} logo={logo} onEdit={(v) => { setSpec(v); setSelectedId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
          </section>
          <div>
            <button onClick={() => { setSpec(null); setShots([]); }} className="text-xs text-neutral-500 underline">처음부터 다시</button>
          </div>
        </div>
      )}
    </div>
  );
}
