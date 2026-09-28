/** 비슷한 틀 5개: 미리보기 + 골라서 캡컷 초안으로 받기 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateSpec } from '../../spec/template-spec';
import { buildCapcutZip } from '../export/packs';
import { renderSpec } from '../export/render';
import { downloadBlob } from '../lib/images';
import { makeVariations, PRESETS } from '../variations/variations';

interface Props {
  spec: TemplateSpec;
  logo: HTMLImageElement | null;
  onEdit: (spec: TemplateSpec) => void;
}

export function VariationsPanel({ spec, logo, onEdit }: Props) {
  const [useBrand, setUseBrand] = useState(false);
  const [brand, setBrand] = useState('#FF3366');
  const [picked, setPicked] = useState<boolean[]>(() => PRESETS.map(() => true));
  const [busy, setBusy] = useState<string | null>(null);
  const variants = useMemo(() => makeVariations(spec, { brandColor: useBrand ? brand : undefined }), [spec, useBrand, brand]);

  const download = async (list: TemplateSpec[]) => {
    for (const v of list) {
      setBusy(v.name);
      const { blob, name } = await buildCapcutZip(v, logo);
      downloadBlob(blob, `${name}.zip`);
      // 브라우저가 여러 파일을 한꺼번에 막지 않도록 조금씩 띄운다
      await new Promise((r) => setTimeout(r, 600));
    }
    setBusy(null);
  };

  return (
    <div className="space-y-3">
      <label className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
        <input type="checkbox" checked={useBrand} onChange={(e) => setUseBrand(e.target.checked)} />
        컬러 스왑에 내 브랜드 색 쓰기
        <input type="color" value={brand} disabled={!useBrand} onChange={(e) => setBrand(e.target.value.toUpperCase())} className="h-6 w-8 rounded bg-transparent disabled:opacity-40" />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {variants.map((v, i) => (
          <div key={v.id} className={`rounded-lg border p-2 ${picked[i] ? 'border-emerald-500' : 'border-neutral-700'}`}>
            <Thumb spec={v} logo={logo} />
            <label className="mt-2 flex items-center gap-1.5 text-sm font-bold">
              <input type="checkbox" checked={picked[i]} onChange={(e) => setPicked(picked.map((p, k) => (k === i ? e.target.checked : p)))} />
              {PRESETS[i].title}
            </label>
            <p className="mt-1 text-[11px] leading-snug text-neutral-400">{PRESETS[i].description}</p>
            <div className="mt-2 flex gap-1">
              <button onClick={() => onEdit(v)} className="flex-1 rounded bg-neutral-800 px-1 py-1 text-[11px] hover:bg-neutral-700">편집하기</button>
              <button disabled={!!busy} onClick={() => download([v])} className="flex-1 rounded bg-neutral-800 px-1 py-1 text-[11px] hover:bg-neutral-700 disabled:opacity-50">zip</button>
            </div>
          </div>
        ))}
      </div>
      <button
        disabled={!!busy || !picked.some(Boolean)}
        onClick={() => download(variants.filter((_, i) => picked[i]))}
        className="w-full rounded-lg bg-emerald-500 px-4 py-3 font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy ? `만드는 중… (${busy})` : `💻 고른 틀 ${picked.filter(Boolean).length}개 캡컷 초안으로 받기`}
      </button>
      <p className="text-[11px] text-neutral-500">
        틀마다 zip 파일이 하나씩 받아져요. 브라우저가 "여러 파일 다운로드"를 물으면 <b>허용</b>을 눌러 주세요.
        각 zip을 캡컷 초안 폴더에서 압축 풀기 하면 초안 목록에 따로따로 보여요.
      </p>
    </div>
  );
}

function Thumb({ spec, logo }: { spec: TemplateSpec; logo: HTMLImageElement | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { widthPx: W, heightPx: H } = spec.canvas;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    renderSpec(ctx, spec, { logo: logo ?? 'placeholder' });
  }, [spec, logo, W, H]);
  return <canvas ref={ref} width={W} height={H} className="w-full rounded" style={{ aspectRatio: `${W} / ${H}` }} />;
}
