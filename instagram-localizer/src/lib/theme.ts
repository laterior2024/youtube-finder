/**
 * 화면 색 테마: 어둡게(dark) / 밝게(light)
 * 고른 테마는 이 브라우저에 기억해 뒀다가 다음에 열 때도 그대로 써요.
 */
export type Theme = 'dark' | 'light';

const KEY = 'ig-localizer-theme';

export function loadTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** 화면 전체에 테마를 적용하고 기억해요. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('theme-light', theme === 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f7fb' : '#0b0d12');
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // 개인정보 보호 모드 등에서는 기억하지 못해도 괜찮아요.
  }
}
