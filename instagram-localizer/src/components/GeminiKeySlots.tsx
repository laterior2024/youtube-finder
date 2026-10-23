import { useEffect, useState } from 'react';
import { checkApiConnection, normalizeCredential } from '../lib/credentials';
import { friendlyError } from '../lib/gemini';
import { keySlots } from '../lib/key-slots';
import type { Settings } from '../types';

function KeyField({ value, index, active, onChange, onSelect }: {
  value: string; index: number; active: boolean; onChange: (value: string) => void; onSelect: () => void;
}) {
  const [show, setShow] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState({ key: '', state: 'empty', message: '' });
  useEffect(() => {
    if (!value) return;
    let live = true;
    const timer = setTimeout(async () => {
      if (live) setResult({ key: value, state: 'checking', message: 'Google 연결 확인 중…' });
      try {
        await checkApiConnection(value);
        if (live) setResult({ key: value, state: 'valid', message: '연결 가능 · 생성 한도는 별도' });
      } catch (error) {
        if (live) setResult({ key: value, state: 'error', message: friendlyError(error) });
      }
    }, 900);
    return () => { live = false; clearTimeout(timer); };
  }, [value, retry]);
  const state = !value ? 'empty' : result.key === value ? result.state : 'waiting';
  const color = state === 'valid' ? 'border-emerald-500 bg-emerald-500/10' : state === 'error' ? 'border-red-500 bg-red-500/10' : state === 'empty' ? 'border-gray-400/40' : 'border-amber-500 bg-amber-500/10';
  return <div className={`rounded-xl border-2 p-3 ${color}`} data-key-state={state}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={`gemini-key-${index}`} className="font-semibold">Gemini 키 {index + 1}</label>
      <button type="button" aria-pressed={active} onClick={onSelect} className="secondary-action">{active ? '✓ 사용 중' : '이 키 사용'}</button>
    </div>
    <div className="flex gap-2">
      <input id={`gemini-key-${index}`} type={show ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={value} onChange={e => onChange(normalizeCredential(e.target.value))} placeholder="API 키 붙여넣기"
        className="min-w-0 flex-1 rounded-lg bg-black/40 px-3 py-2" />
      <button type="button" aria-label={`키 ${index + 1} ${show ? '숨기기' : '보기'}`} onClick={() => setShow(!show)} className="secondary-action">{show ? '숨기기' : '보기'}</button>
    </div>
    <p role="status" className="mt-2 break-words text-xs">{state === 'empty' ? '미입력' : state === 'waiting' ? '입력 완료 후 자동 확인해요…' : result.message}</p>
    {value && <button type="button" onClick={() => setRetry(n => n + 1)} className="mt-2 text-xs underline">연결 다시 확인</button>}
  </div>;
}

export default function GeminiKeySlots({ draft, onChange }: { draft: Settings; onChange: (s: Settings) => void }) {
  const slots = keySlots(draft);
  return <details className="editor-disclosure mt-5">
    <summary><span>Gemini API 키 5개 · 키 {slots.activeGeminiKey + 1} 선택됨</span><span className="disclosure-hint" aria-hidden="true" /></summary>
    <div className="disclosure-content grid gap-3">
      <p className="text-xs">입력하면 자동으로 확인해요. 초록: 연결 가능 · 빨강: 확인 실패 · 노랑: 확인 중. 연결 성공은 이미지 생성 권한·남은 한도를 보장하지 않아요.</p>
      {slots.geminiKeys.map((value, index) => <KeyField key={index} value={value} index={index} active={slots.activeGeminiKey === index}
        onSelect={() => onChange({ ...draft, ...keySlots({ ...slots, activeGeminiKey: index }) })}
        onChange={value => onChange({ ...draft, ...keySlots({ ...slots, geminiKeys: slots.geminiKeys.map((key, i) => i === index ? value : key) }) })} />)}
      <p className="text-xs">선택한 키 하나로 실행해요. 같은 Google 프로젝트의 키는 한도를 공유하며, 키를 추가해도 무제한이 되지 않아요. 콘텐츠를 생성하지 않는 연결 검사만 자동으로 실행합니다.</p>
    </div>
  </details>;
}
