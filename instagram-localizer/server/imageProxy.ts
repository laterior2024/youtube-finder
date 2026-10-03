const MAX_BYTES = 4 * 1024 * 1024;
const allowed = (url: URL) => url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && /\.(cdninstagram\.com|fbcdn\.net)$/i.test(url.hostname);
export interface ProxyResult { status: number; contentType: string; body: ArrayBuffer | string }
const text = (status: number, body: string): ProxyResult => ({ status, body, contentType: 'text/plain; charset=utf-8' });
export async function proxyInstagramImage(rawUrl: string | null, fetcher: typeof fetch = fetch): Promise<ProxyResult> {
  if (!rawUrl) return text(400, 'url 값이 없어요.');
  let url: URL;
  try { url = new URL(rawUrl); } catch { return text(400, '잘못된 주소예요.'); }
  const signal = AbortSignal.timeout(10000);
  try {
    for (let hop = 0; hop <= 3; hop++) {
      if (!allowed(url)) return text(403, '인스타그램 사진 주소만 가져올 수 있어요.');
      const res = await fetcher(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/jpeg,image/png,image/webp,image/avif' } });
      if ([301,302,303,307,308].includes(res.status)) {
        await res.body?.cancel();
        const location = res.headers.get('location');
        if (!location || hop === 3) return text(502, '사진 주소가 너무 많이 변경돼요.');
        url = new URL(location, url); continue;
      }
      if (!res.ok) { await res.body?.cancel(); return text(502, '사진을 가져오지 못했어요.'); }
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['image/jpeg','image/png','image/webp','image/avif','image/gif'].includes(type)) {
        await res.body?.cancel(); return text(415, '지원하는 사진 파일이 아니에요.');
      }
      if (Number(res.headers.get('content-length')) > MAX_BYTES) { await res.body?.cancel(); return text(413, '사진이 너무 커요.'); }
      if (!res.body) return text(502, '빈 사진이에요.');
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) { await reader.cancel(); return text(413, '사진이 너무 커요.'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const body = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return { status: 200, contentType: type, body: body.buffer };
    }
    return text(502, '사진을 가져오지 못했어요.');
  } catch { return text(signal.aborted ? 504 : 502, signal.aborted ? '사진 응답 시간이 초과됐어요.' : '사진을 가져오지 못했어요.'); }
}
