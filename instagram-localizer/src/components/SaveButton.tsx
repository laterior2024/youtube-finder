import { useRef, useState } from 'react';
import { isAndroidApp } from '../lib/android';

/** 실제 저장 응답까지 기다리고 중복 터치를 막습니다. 취소는 성공과 구분합니다. */
export default function SaveButton({ label, onSave, disabled = false }: {
  label: string; onSave: () => Promise<boolean>; disabled?: boolean;
}) {
  const locked = useRef(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'cancelled' | 'error'>('idle');
  const [error, setError] = useState('');
  const save = async () => {
    if (locked.current) return;
    locked.current = true; setState('saving'); setError('');
    try { setState(await onSave() ? 'saved' : 'cancelled'); }
    catch (e) { setState('error'); setError(e instanceof Error ? e.message : '저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { locked.current = false; }
  };
  const status = state === 'saving' ? '⏳ 저장 중…' : state === 'saved' ? (isAndroidApp() ? '✓ 저장 완료' : '✓ 다운로드 요청됨')
    : state === 'cancelled' ? '저장 취소 · 다시 저장' : state === 'error' ? '저장 실패 · 다시 시도' : label;
  return <div className="min-w-0">
    <button type="button" onClick={() => void save()} disabled={disabled || state === 'saving'}
      aria-label={status} aria-busy={state === 'saving'} className={`save-button save-${state}`}>
      <span role="status" aria-live="polite">{status}</span>
    </button>
    {error && <p role="alert" className="mt-1 max-w-md break-words text-sm text-red-300">{error}</p>}
  </div>;
}
