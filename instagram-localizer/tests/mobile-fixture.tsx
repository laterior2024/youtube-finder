// Development-only browser fixture. This entry is never imported by the production app.
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { createPersistence } from '../src/lib/persist';
import { manualResult } from '../src/lib/manual';
import type { PostJob } from '../src/types';
import type { Member } from '../src/lib/auth';
import '../src/index.css';

if (!import.meta.env.DEV || !['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Local tests only');
const member = { id: 'mobile-fixture-member', role: 'member', status: 'approved', display_name: '화면 검사' } as Member;
const fixture = window as any;
fixture.saveMode = 'hold'; fixture.messages = []; fixture.pendingBegin = null;
window.LocalizerNative = { postMessage(raw) {
  const message = JSON.parse(raw); fixture.messages.push(message);
  const respond = (status = 'ok') => window.LocalizerNative!.onmessage?.({ data: JSON.stringify({ id: message.id, status, error: '검사용 저장 공간 부족' }) });
  if (message.op === 'begin' && fixture.saveMode === 'hold') fixture.pendingBegin = respond;
  else setTimeout(() => respond(message.op === 'begin' && fixture.saveMode === 'cancel' ? 'cancelled' : message.op === 'chunk' && fixture.saveMode === 'error' ? 'error' : 'ok'), 30);
} };
fixture.completeBegin = () => { fixture.saveMode = 'ok'; fixture.pendingBegin?.(); };
const persistence = createPersistence(member.id);
if (!await persistence.loadState()) {
  const input = { caption: '교토의 두부 요리 가격은 500엔입니다.', images: [], video: null, sourceUrl: '', credit: '' };
  const posts: PostJob[] = Array.from({ length: 5 }, (_, index) => {
    const result = manualResult(input, 'KR');
    result.slides[0].textBlocks[0] = { ...result.slides[0].textBlocks[0], text: '교토 두부', h: 8, y: 30 };
    result.localization.altTexts = ['교토의 두부 요리'];
    return { id: `fixture-${index}`, input, status: 'done', importing: false, importMessage: '', importError: '', importVideoUrl: '',
      log: [], error: '', analysis: null, results: { KR: result }, active: 'KR', aspect: '4:5' };
  });
  await persistence.saveState({ posts, options: { countries: ['KR'], imageMode: 'new', perCountryImages: false, autoImages: false, skipSolid: true, dmOffer: '' }, view: 'result', activePostId: posts[0].id });
}
createRoot(document.getElementById('root')!).render(<App member={member} />);
