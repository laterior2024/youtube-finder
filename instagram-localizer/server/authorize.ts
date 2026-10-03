export async function authorizeMember(request: Request, env: Record<string,string | undefined> = process.env, fetcher: typeof fetch = fetch): Promise<Response | null> {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return new Response('회원 서비스가 연결되지 않았어요.', { status: 503 });
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return new Response('로그인이 필요해요.', { status: 401 });
  try {
    const res = await fetcher(url + '/rest/v1/rpc/reserve_request', {
      method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { apikey: key, Authorization: authorization, 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!res.ok) return new Response('승인 상태와 오늘 사용 한도를 확인해 주세요.', { status: res.status === 401 ? 401 : 403 });
    return null;
  } catch { return new Response('회원 확인에 실패했어요. 잠시 뒤 다시 시도해 주세요.', { status: 503 }); }
}
