import type { Settings } from '../types';
export const DEFAULT_SETTINGS: Settings = {
  apiKey: '', textModel: 'gemini-flash-latest', imageModel: 'gemini-3.1-flash-image',
  apifyEnabled: false, apifyToken: '', apifyActor: 'apify~instagram-scraper',
};
const key = (id: string) => 'ig-localizer-settings:' + id;
export function loadSettings(id: string): Settings {
  try {
    const preferences = JSON.parse(localStorage.getItem(key(id)) || '{}');
    const secrets = JSON.parse(sessionStorage.getItem(key(id)) || '{}');
    return { ...DEFAULT_SETTINGS, ...preferences, apiKey: secrets.apiKey || '', apifyToken: secrets.apifyToken || '' };
  } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s: Settings, id: string) {
  const { apiKey, apifyToken, ...preferences } = s;
  localStorage.setItem(key(id), JSON.stringify(preferences));
  sessionStorage.setItem(key(id), JSON.stringify({ apiKey, apifyToken }));
}
export function clearCredentials(id: string) { sessionStorage.removeItem(key(id)); }
