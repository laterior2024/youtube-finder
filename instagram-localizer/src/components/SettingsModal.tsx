import { useState } from 'react';
import type { Settings } from '../types';
import { IMAGE_MODELS, TEXT_MODELS } from '../lib/gemini';

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(settings);
  const [show, setShow] = useState(false);
  const [showApify, setShowApify] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[#151922] p-6 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold">⚙️ 설정</h2>

        <label className="mt-5 block text-sm font-semibold">Gemini API 키</label>
        <div className="mt-1 flex gap-2">
          <input
            type={show ? 'text' : 'password'}
            value={draft.apiKey}
            onChange={(e) => setDraft({ ...draft, apiKey: e.target.value.trim() })}
            placeholder="AIza로 시작하는 긴 글자"
            className="flex-1 rounded-lg bg-black/40 px-3 py-2 ring-1 ring-white/10 outline-none focus:ring-pink-400"
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
          키는 <b>지금 쓰는 이 브라우저에만</b> 저장되고, Google 외의 다른 곳으로는 보내지 않아요. 이미지를 만들려면 Google AI Studio에서 결제(Billing)를 등록해야 해요.
        </p>

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
                  type={showApify ? 'text' : 'password'}
                  value={draft.apifyToken}
                  onChange={(e) => setDraft({ ...draft, apifyToken: e.target.value.trim() })}
                  placeholder="apify_api_로 시작하는 글자"
                  className="flex-1 rounded-lg bg-black/40 px-3 py-2 text-sm ring-1 ring-white/10 outline-none focus:ring-pink-400"
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
                Apify는 사용한 만큼 요금이 나가요 (무료 크레딧이 있어요). 토큰도 이 브라우저에만 저장돼요.
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

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-white/70 hover:bg-white/5">
            취소
          </button>
          <button
            onClick={() => onSave(draft)}
            className="rounded-lg bg-gradient-to-r from-pink-500 to-orange-400 px-5 py-2 font-bold text-white"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
