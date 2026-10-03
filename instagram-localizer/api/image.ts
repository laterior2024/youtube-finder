import { proxyInstagramImage } from '../server/imageProxy';
import { authorizeMember } from '../server/authorize';
export const config = { maxDuration: 20 };
export async function GET(request: Request): Promise<Response> {
  const denial = await authorizeMember(request);
  if (denial) { denial.headers.set('Cache-Control','no-store'); return denial; }
  const out = await proxyInstagramImage(new URL(request.url).searchParams.get('url'));
  return new Response(out.body, { status: out.status, headers: {
    'Content-Type': out.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
  } });
}
