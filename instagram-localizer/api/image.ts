import { proxyInstagramImage } from '../server/imageProxy';

// Vercel 서버 함수: GET /api/image?url=<인스타 사진 주소>
export const config = { maxDuration: 20 };

export async function GET(request: Request): Promise<Response> {
  try {
    const out = await proxyInstagramImage(new URL(request.url).searchParams.get('url'));
    return new Response(out.body, {
      status: out.status,
      headers: { 'Content-Type': out.contentType, 'Cache-Control': 'public, max-age=86400' },
    });
  } catch {
    return new Response('사진을 가져오는 중 오류가 났어요.', { status: 502 });
  }
}
