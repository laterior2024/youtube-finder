import { useState } from 'react';
import type { Settings } from '../types';
import { friendlyError, IMAGE_MODELS, TEXT_MODELS } from '../lib/gemini';

import { checkApiConnection, normalizeCredential } from '../lib/credentials';

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(settings);
  const [show, setShow] = useState(false);
  const [showApify, setShowApify] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connection, setConnection] = useState('');
  const [saveError, setSaveError] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="min-w-0 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--panel-bg)] p-5 sm:p-6 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <h2 id="settings-title" className="text-xl font-bold">⚙️ 설정</h2>

        <label htmlFor="gemini-key" className="mt-5 block text-sm font-semibold">Gemini API 키</label>
        <div className="mt-1 flex gap-2">
          <input
            id="gemini-key" type={show ? 'text' : 'password'}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
            value={draft.apiKey}
            onChange={(e) => { setDraft({ ...draft, apiKey: normalizeCredential(e.target.value) }); setConnection(''); }}
            placeholder="AI Studio에서 복사한 키 전체"
            className="min-w-0 w-full flex-1 rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-pink-400"
          />
          <button onClick={() => setShow(!show)} className="rounded-lg bg-white/10 px-3 text-sm">
            {show ? '숨기기' : '보기'}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-white/60">
          키 받는 곳:{' '}
          <a className="text-pink-300 underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
            aistudio.google.com/apikey
          </a>
          <br />
          PC와 휴대폰의 키는 자동으로 공유되지 않아요. 기본은 <b>현재 회원의 이 탭에만</b> 보관하며, 탭을 새로 열면 다시 입력해야 할 수 있어요. Google에만 직접 보내며 관리자에게 수집하지 않아요. 이미지를 만들려면 Google AI Studio에서 결제(Billing)를 등록해야 해요.
        </p>

        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 shrink-0" checked={!!draft.rememberKeys} onChange={e => setDraft({ ...draft, rememberKeys: e.target.checked })} />
          <span>이 기기에 키 기억하기<span className="mt-1 block text-xs text-white/60">Gemini·Apify 키를 현재 브라우저에 저장해 다음 방문에 사용해요. 로그아웃하면 지워져요. 본인 기기에서만 선택해 주세요.</span></span>
        </label>
        <button disabled={checking || !draft.apiKey} className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm disabled:opacity-50" onClick={async () => {
          setChecking(true); setConnection('');
          try { await checkApiConnection(draft.apiKey); setConnection('Google 연결을 확인했어요. 이미지 생성 권한과 사용량 한도는 모델별로 다를 수 있어요.'); }
          catch (e) { setConnection(friendlyError(e)); }
          finally { setChecking(false); }
        }}>{checking ? '연결 확인 중…' : '키 연결 확인 (콘텐츠 생성 안 함)'}</button>
        {connection && <p role="status" className="mt-2 break-words text-sm text-white/70">{connection}</p>}

        <label className="mt-5 block text-sm font-semibold">분석·번역 AI</label>
        <select
          value={draft.textModel}
          onChange={(e) => setDraft({ ...draft, textModel: e.target.value })}
          className="mt-1 w-full rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10"
        >
          {TEXT_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-sm font-semibold">이미지 생성 AI</label>
        <select
          value={draft.imageModel}
          onChange={(e) => setDraft({ ...draft, imageModel: e.target.value })}
          className="mt-1 w-full rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10"
        >
          {IMAGE_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>

        <div className="mt-6 rounded-xl bg-white/[0.04] p-4 ring-1 ring-white/10">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-semibold">🔗 인스타 링크로 자동 가져오기 (Apify)</span>
              <span className="block text-xs text-white/55">켜면 링크만 넣고 &quot;가져오기&quot;를 눌러 사진·설명글을 자동으로 채워요. 끄면 지금처럼 직접 올려요.</span>
            </span>
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0"
              checked={draft.apifyEnabled}
              onChange={(e) => setDraft({ ...draft, apifyEnabled: e.target.checked })}
            />
          </label>
          {draft.apifyEnabled && (
            <div className="mt-3">
              <label className="block text-xs font-semibold">Apify API 토큰</label>
              <div className="mt-1 flex gap-2">
                <input
                  aria-label="Apify API 토큰" type={showApify ? 'text' : 'password'}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
                  value={draft.apifyToken}
                  onChange={(e) => setDraft({ ...draft, apifyToken: normalizeCredential(e.target.value) })}
                  placeholder="apify_api_로 시작하는 글자"
                  className="min-w-0 w-full flex-1 rounded-lg bg-black/40 px-3 py-2 text-sm ring-1 ring-white/10 outline-none focus:ring-pink-400"
                />
                <button onClick={() => setShowApify(!showApify)} className="rounded-lg bg-white/10 px-3 text-sm">
                  {showApify ? '숨기기' : '보기'}
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-white/55">
                토큰 받는 곳:{' '}
                <a className="text-pink-300 underline" href="https://console.apify.com/settings/integrations" target="_blank" rel="noreferrer">
                  console.apify.com → Settings → API &amp; Integrations
                </a>
                <br />
                Apify는 사용한 만큼 요금이 나가요 (무료 크레딧이 있어요). 토큰도 위에서 선택한 키 보관 방식이 적용돼요.
              </p>
              <details className="mt-2 text-xs text-white/55">
                <summary className="cursor-pointer">고급 설정 (보통 건드리지 않아도 돼요)</summary>
                <label className="mt-2 block">
                  Apify 액터 이름
                  <input
                    value={draft.apifyActor}
                    onChange={(e) => setDraft({ ...draft, apifyActor: e.target.value.trim() })}
                    placeholder="apify~instagram-scraper"
                    className="mt-1 w-full rounded-lg bg-black/40 px-3 py-1.5 ring-1 ring-white/10 outline-none focus:ring-pink-400"
                  />
                </label>
              </details>
            </div>
          )}
        </div>

        {saveError && <p role="alert" className="mt-3 text-sm text-red-300">{saveError}</p>}
        <div className="sticky bottom-0 mt-6 flex justify-end gap-2 bg-[var(--panel-bg)] py-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-white/70 hover:bg-white/5">
            취소
          </button>
          <button
            disabled={checking}
            onClick={() => { try { onSave({ ...draft, apiKey: normalizeCredential(draft.apiKey), apifyToken: normalizeCredential(draft.apifyToken) }); } catch (e) { setSaveError(friendlyError(e)); } }}
            className="rounded-lg bg-gradient-to-r from-pink-500 to-orange-400 px-5 py-2 font-bold text-white"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
