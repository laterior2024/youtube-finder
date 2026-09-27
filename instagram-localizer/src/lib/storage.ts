import type { Settings } from '../types';

const KEY = 'ig-localizer-settings';

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  textModel: 'gemini-flash-latest',
  imageModel: 'gemini-3.1-flash-image',
  apifyEnabled: false,
  apifyToken: '',
  apifyActor: 'apify~instagram-scraper',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 개인정보 보호 모드 등에서는 저장이 안 될 수 있어요. 이 경우 이번 접속 동안만 기억합니다.
  }
}
