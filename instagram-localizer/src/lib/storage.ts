import type { Settings } from '../types';
import { normalizeCredential } from './credentials';
export const DEFAULT_SETTINGS: Settings = {
  apiKey: '', textModel: 'gemini-flash-latest', imageModel: 'gemini-3.1-flash-image',
  apifyEnabled: false, apifyToken: '', apifyActor: 'apify~instagram-scraper', rememberKeys: false,
};
const key = (id: string) => 'ig-localizer-settings:' + id;
const deviceKey = (id: string) => 'ig-localizer-credentials:' + id;
const memory = new Map<string, Pick<Settings, 'apiKey' | 'apifyToken'>>();
function read(store: () => Storage, name: string): Record<string, unknown> {
  try { const value = JSON.parse(store().getItem(name) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}
const text = (v: unknown, fallback = '') => typeof v === 'string' ? v : fallback;
export function loadSettings(id: string): Settings {
  const preferences = read(() => localStorage, key(id));
  const device = read(() => localStorage, deviceKey(id));
  const session = read(() => sessionStorage, key(id));
  const secrets = memory.get(id) ?? (typeof session.apiKey === 'string' ? session : device);
  return { ...DEFAULT_SETTINGS,
    textModel: text(preferences.textModel, DEFAULT_SETTINGS.textModel),
    imageModel: text(preferences.imageModel, DEFAULT_SETTINGS.imageModel),
    apifyActor: text(preferences.apifyActor, DEFAULT_SETTINGS.apifyActor),
    apifyEnabled: preferences.apifyEnabled === true,
    rememberKeys: device.rememberKeys === true,
    apiKey: normalizeCredential(text(secrets.apiKey)), apifyToken: normalizeCredential(text(secrets.apifyToken)),
  };
}
export function saveSettings(s: Settings, id: string): string {
  const { apiKey, apifyToken, rememberKeys, ...preferences } = s;
  const secrets = { apiKey: normalizeCredential(apiKey), apifyToken: normalizeCredential(apifyToken) };
  // 영구 저장은 사용자가 직접 선택했을 때만 사용합니다.
  if (rememberKeys) {
    try { localStorage.setItem(deviceKey(id), JSON.stringify({ ...secrets, rememberKeys: true })); }
    catch { throw new Error('이 브라우저는 기기에 키를 저장할 수 없어요. “이 기기에 키 기억하기”를 끄고 다시 저장해 주세요.'); }
  } else {
    try { localStorage.removeItem(deviceKey(id)); }
    catch { if (read(() => localStorage, deviceKey(id)).rememberKeys) throw new Error('이전에 기억한 키를 지울 수 없어요. 브라우저의 이 사이트 저장 데이터를 확인해 주세요.'); }
  }
  memory.set(id, secrets);
  let sessionSaved = true;
  try { sessionStorage.setItem(key(id), JSON.stringify(secrets)); } catch { sessionSaved = false; }
  let preferencesSaved = true;
  try { localStorage.setItem(key(id), JSON.stringify(preferences)); } catch { preferencesSaved = false; }
  return !sessionSaved && !rememberKeys ? '키는 지금 열린 화면에서 사용할 수 있어요. 이 브라우저가 저장을 막고 있어 새로 열면 다시 입력해야 해요.'
    : !preferencesSaved ? '키는 적용했지만 모델 설정은 저장하지 못했어요.' : '';
}
export function clearCredentials(id: string) {
  memory.delete(id);
  try { sessionStorage.removeItem(key(id)); } catch { /* 저장소 차단 시에도 로그아웃은 진행 */ }
  try { localStorage.removeItem(deviceKey(id)); } catch { /* 다음 접속 전에 브라우저 저장 데이터를 정리할 수 있음 */ }
}
