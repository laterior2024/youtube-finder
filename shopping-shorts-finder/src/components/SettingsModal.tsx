import { useState } from 'react';

interface Props {
  apiKey: string;
  onSave: (key: string) => void;
  onClose: () => void;
}

/** ⚙️ 설정: 유튜브 API 키 넣기 */
export default function SettingsModal({ apiKey, onSave, onClose }: Props) {
  const [value, setValue] = useState(apiKey);
  const [show, setShow] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#151922] p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">⚙️ 설정</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-white/60 hover:bg-white/10" aria-label="닫기">
            ✕
          </button>
        </div>

        <label className="mb-1 block text-sm font-semibold">🔑 유튜브 API 키</label>
        <div className="flex gap-2">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="AIza로 시작하는 긴 글자"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 outline-none focus:border-red-400"
            autoComplete="off"
          />
          <button onClick={() => setShow(!show)} className="shrink-0 rounded-lg border border-white/15 px-3 text-sm hover:bg-white/10">
            {show ? '숨기기' : '보기'}
          </button>
        </div>
        <p className="mt-2 text-xs text-white/50">🔒 키는 이 브라우저에만 저장돼요. 다른 사람에게 보여주지 마세요.</p>

        <details className="mt-4 rounded-xl bg-white/5 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">🧒 API 키가 없어요 — 받는 방법 (5분)</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-white/80">
            <li>
              <a className="text-sky-300 underline" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">
                구글 클라우드 새 프로젝트 만들기
              </a>
              에 들어가서 구글 계정으로 로그인해요. 이름은 아무거나(예: <b>shopping-finder</b>) 쓰고 <b>만들기</b>를 눌러요.
            </li>
            <li>
              <a className="text-sky-300 underline" href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">
                YouTube Data API v3 페이지
              </a>
              에 들어가요. 위쪽에 방금 만든 프로젝트 이름이 보이는지 확인해요.
            </li>
            <li>
              파란 <b>사용</b>(Enable) 버튼을 눌러요.
            </li>
            <li>
              <a className="text-sky-300 underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
                사용자 인증 정보 페이지
              </a>
              에서 <b>+ 사용자 인증 정보 만들기 → API 키</b>를 눌러요.
            </li>
            <li>
              <b>AIza…</b>로 시작하는 글자가 나오면 <b>복사</b>해서 위 칸에 붙여넣고 <b>저장</b>을 눌러요.
            </li>
          </ol>
          <p className="mt-3 text-white/60">💳 카드 등록 없이 무료예요. 하루 10,000포인트를 주고, 이 앱은 검색 한 번에 보통 200~300포인트를 써요.</p>
        </details>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-white/70 hover:bg-white/10">
            취소
          </button>
          <button onClick={() => onSave(value.trim())} className="rounded-lg bg-red-500 px-5 py-2 font-bold text-white hover:bg-red-400">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
