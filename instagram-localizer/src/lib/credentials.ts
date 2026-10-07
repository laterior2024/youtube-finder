/** 모바일 복사/붙여넣기에 섞인 줄바꿈과 보이지 않는 공백만 제거합니다. */
export function normalizeCredential(value: string): string {
  return value.replace(/[\s\u200B-\u200D\uFEFF]/g, '');
}
export const MISSING_KEY_MESSAGE = '이 기기에서 사용할 Gemini API 키를 설정해 주세요. PC의 키는 휴대폰에 자동으로 옮겨지지 않아요. 직접 편집과 다운로드는 키 없이 사용할 수 있어요.';
export function requireApiKey(value: string): string {
  const key = normalizeCredential(value);
  if (!key) throw new Error(MISSING_KEY_MESSAGE);
  if (!/^[\x21-\x7E]+$/.test(key)) throw new Error('API 키에 한글이나 특수 문자가 섞였어요. AI Studio에서 키 전체를 다시 복사해 주세요.');
  return key;
}

/** 모델 목록 요청으로 연결만 확인합니다. 콘텐츠를 생성하지 않습니다. */
export async function checkApiConnection(value: string, fetcher: typeof fetch = fetch): Promise<void> {
  const key = requireApiKey(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      headers: { 'x-goog-api-key': key }, signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const detail = typeof data?.error?.message === 'string' ? data.error.message : '';
      // 응답에 요청 키가 포함돼도 화면에 그대로 노출하지 않습니다.
      throw new Error(('Google ' + response.status + ': ' + detail).split(key).join('[키 숨김]'));
    }
  } catch (e) {
    if (controller.signal.aborted) throw new Error('연결 확인 시간이 초과됐어요. 네트워크를 확인하고 다시 시도해 주세요.');
    throw e;
  } finally { clearTimeout(timer); }
}
