/**
 * 인스타그램 사진 주소를 받아서 사진 파일을 대신 내려받아 주는 작은 서버 부품이에요.
 * (브라우저가 인스타 사진 서버에서 직접 받으면 보안 규칙(CORS) 때문에 막혀요.)
 * 아무 사이트나 대신 열어 주는 통로가 되지 않도록 인스타그램 사진 서버만 허용해요.
 */
const ALLOWED_HOSTS = [/\.cdninstagram\.com$/i, /\.fbcdn\.net$/i, /^scontent[\w.-]*\.cdninstagram\.com$/i];
const MAX_BYTES = 4 * 1024 * 1024;

export interface ProxyResult {
  status: number;
  contentType: string;
  body: ArrayBuffer | string;
}

export async function proxyInstagramImage(rawUrl: string | null): Promise<ProxyResult> {
  const text = (status: number, message: string): ProxyResult => ({
    status,
    contentType: 'text/plain; charset=utf-8',
    body: message,
  });
  if (!rawUrl) return text(400, 'url 값이 없어요.');
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return text(400, '잘못된 주소예요.');
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.some((re) => re.test(url.hostname))) {
    return text(403, '인스타그램 사진 주소만 가져올 수 있어요.');
  }
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' } });
  if (!res.ok) return text(502, `사진을 가져오지 못했어요 (${res.status}).`);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  if (!contentType.startsWith('image/')) return text(415, '사진 파일이 아니에요.');
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return text(413, '사진이 너무 커요.');
  return { status: 200, contentType, body: buf };
}
