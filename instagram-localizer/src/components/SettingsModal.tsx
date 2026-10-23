import { useState } from 'react';
import type { Settings } from '../types';
import { friendlyError, IMAGE_MODELS, TEXT_MODELS } from '../lib/gemini';

import { normalizeCredential } from '../lib/credentials';

import GeminiKeySlots from './GeminiKeySlots';
import { keySlots } from '../lib/key-slots';

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(settings);
  const [showApify, setShowApify] = useState(false);
  const [saveError, setSaveError] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="min-w-0 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--panel-bg)] p-5 sm:p-6 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <h2 id="settings-title" className="text-xl font-bold">⚙️ 설정</h2>

        <GeminiKeySlots draft={draft} onChange={setDraft} />
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
        <details className="editor-disclosure mt-4">
          <summary>사용 한도 확인 · 무제한 사용 안내</summary>
          <div className="disclosure-content space-y-2 text-sm">
            <p><b>앱 일일 한도:</b> 인스타 가져오기와 AI 분석·번역·사진 생성 요청을 함께 세어요. 실패한 시도도 포함하며 한국 시간 자정에 새 날짜로 계산해요. “오늘 앱 사용 한도”는 관리자 화면의 회원별 한도를 확인하세요.</p>
            <p><b>Gemini 한도:</b> “Google API 사용량 한도”는 선택 모델·프로젝트의 분당/일일 사용량·결제 한도예요. 키 5개가 같은 프로젝트라면 공유해요. <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer" className="underline">AI Studio 사용량 확인</a></p>
            <p><b>Apify 한도:</b> 링크 조회에만 사용해요. 사진 생성에는 사용하지 않아요. 무료 크레딧과 요금제 한도가 있으며 사진을 일부만 선택해도 게시물 조회 비용은 발생해요. <a href="https://console.apify.com/billing" target="_blank" rel="noreferrer" className="underline">Apify 사용량·결제 확인</a></p>
            <p>두 클라우드 서비스 모두 무료·무제한은 보장하지 않아요. 유료 한도 확대는 각 서비스에서 직접 신청할 수 있어요. 사진 직접 올리기와 AI 없이 직접 편집·PNG 저장은 이 두 API를 호출하지 않아요. 기존 사진 재사용·자동 배경 생성 끄기로 생성 요청을 줄일 수 있어요.</p>
          </div>
        </details>

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
            onClick={() => { try { onSave({ ...draft, ...keySlots(draft), apifyToken: normalizeCredential(draft.apifyToken) }); } catch (e) { setSaveError(friendlyError(e)); } }}
            className="rounded-lg bg-gradient-to-r from-pink-500 to-orange-400 px-5 py-2 font-bold text-white"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
