import { useState } from 'react';
import type { TemplateSpec } from '../../spec/template-spec';
import { buildCapcutZip, buildTemplatePack, draftNameFor } from '../export/packs';
import { downloadBlob } from '../lib/images';

const ROOT_KEY = 'tbc.draftsRoot';

function readRoot(): string {
  try { return localStorage.getItem(ROOT_KEY) ?? ''; } catch { return ''; }
}

export function ExportPanel({ spec, logo }: { spec: TemplateSpec; logo: HTMLImageElement | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [root, setRoot] = useState(readRoot);
  const name = draftNameFor(spec);

  const run = async (label: string, fn: () => Promise<{ blob: Blob; name: string }>) => {
    setBusy(label);
    setError(null);
    try {
      const { blob, name } = await fn();
      downloadBlob(blob, `${name}.zip`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const saveRoot = (v: string) => {
    setRoot(v);
    try { localStorage.setItem(ROOT_KEY, v); } catch { /* 저장 안 돼도 괜찮음 */ }
  };

  return (
    <div className="space-y-3">
      <button
        disabled={!!busy}
        onClick={() => run('capcut', () => buildCapcutZip(spec, logo, root || undefined))}
        className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-base font-bold text-black hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy === 'capcut' ? '만드는 중…' : '💻 캡컷 PC 초안 받기 (.zip)'}
      </button>
      <details className="rounded-lg bg-neutral-900 p-3 text-sm text-neutral-300">
        <summary className="cursor-pointer font-bold">캡컷에서 여는 방법</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>캡컷을 완전히 꺼요.</li>
          <li>캡컷 초안 폴더를 열어요.<br />
            <span className="text-neutral-400">파일 탐색기 주소창에 <code className="rounded bg-neutral-800 px-1">%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft</code> 입력 후 Enter</span>
          </li>
          <li>받은 <b>{name}.zip</b>을 그 폴더로 옮기고, 오른쪽 클릭 → <b>"압축 풀기"</b> (또는 반디집 "{name}\에 풀기")<br />
            <span className="text-neutral-400">→ 초안 폴더 안에 <b>{name}</b> 폴더가 생기고, 그 안에 draft_content.json이 바로 보이면 성공</span>
          </li>
          <li>캡컷을 켜면 초안 목록에 <b>{name}</b>이 보여요. 열어서 VIDEO 자리에 내 영상을 넣으면 끝!</li>
        </ol>
      </details>
      <label className="block text-xs text-neutral-400">
        (선택) 내 캡컷 초안 폴더 경로 — 캡컷 설정 → 초안 위치
        <input value={root} onChange={(e) => saveRoot(e.target.value)} placeholder="C:\Users\내이름\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft"
          className="mt-1 w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-100" />
      </label>

      <button
        disabled={!!busy}
        onClick={() => run('pack', () => buildTemplatePack(spec, logo))}
        className="w-full rounded-lg bg-neutral-700 px-4 py-2.5 text-sm font-bold hover:bg-neutral-600 disabled:opacity-50"
      >
        {busy === 'pack' ? '만드는 중…' : '📱 틀 팩 받기 (투명 PNG + 스타일카드, 모바일용)'}
      </button>
      <button
        onClick={() => downloadBlob(new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' }), `${name}.json`)}
        className="w-full rounded-lg bg-neutral-800 px-4 py-2 text-xs hover:bg-neutral-700"
      >
        template.json만 받기 (나중에 다시 불러오기용)
      </button>
      {error && <p className="text-sm text-red-400">문제가 생겼어요: {error}</p>}
    </div>
  );
}
