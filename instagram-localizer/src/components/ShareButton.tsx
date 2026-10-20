import { useRef, useState } from 'react';
import { shareFile, supportsFileSharing } from '../lib/android';

/** Preparing and opening are separate clicks so browsers retain user activation. */
export default function ShareButton({ label, prepare, disabled = false }: { label: string; prepare: () => Promise<File>; disabled?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const run = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage('');
    try {
      if (!supportsFileSharing()) { setMessage('이 브라우저는 파일 공유를 지원하지 않아요. 다운로드한 파일을 원하는 앱에 첨부해 주세요.'); return; }
      if (!file) { setFile(await prepare()); setMessage('공유할 파일이 준비됐어요. 아래 버튼으로 공유 창을 여세요.'); }
      else { setMessage(await shareFile(file) ? '공유 창을 열었어요.' : '공유를 취소했어요.'); setFile(null); }
    } catch (e) { setFile(null); setMessage(e instanceof Error ? e.message : '공유하지 못했어요.'); }
    finally { locked.current = false; setBusy(false); }
  };
  return <div className="min-w-0">
    <button className="secondary-action" disabled={disabled || busy} onClick={() => void run()}>{busy ? '준비 중…' : file ? `${label} · 공유 창 열기` : label}</button>
    {file && <button className="secondary-action ml-2" onClick={() => { setFile(null); setMessage(''); }}>준비 취소</button>}
    {message && <p role="status" className="mt-1 text-xs text-white/65">{message}</p>}
  </div>;
}
