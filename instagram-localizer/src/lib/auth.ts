import { createClient } from '@supabase/supabase-js';

const url = import.meta.env?.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
}) : null;

export interface Member {
  id: string; email: string; display_name: string; role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'suspended' | 'rejected'; daily_limit: number; created_at: string;
}
export interface AppSettings { announcement: string; maintenance: boolean }
export const STATUS_LABEL = { pending: '승인 대기', approved: '승인됨', suspended: '이용 정지', rejected: '가입 거절' };

export async function access(): Promise<Member> {
  if (!supabase) throw new Error('회원 서비스 연결이 필요해요.');
  const { data, error } = await supabase.rpc('get_access');
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('회원 정보를 불러오지 못했어요.');
  return data as Member;
}

export async function authorizeRequest(expectedMemberId?: string) {
  if (!supabase) throw new Error('회원 서비스 연결이 필요해요.');
  if (expectedMemberId) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id !== expectedMemberId) throw new Error('계정이 바뀌어서 이전 작업을 중단했어요.');
  }
  const { error } = await supabase.rpc('reserve_request');
  if (error) throw new Error(error.message);
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) throw new Error('로그인이 필요해요.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('다시 로그인해 주세요.');
  return { Authorization: `Bearer ${session.access_token}` };
}

export function authError(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  if (/Invalid login credentials/i.test(message)) return '이메일 또는 비밀번호를 확인해 주세요.';
  if (/Email not confirmed/i.test(message)) return '이메일로 받은 인증 링크를 먼저 눌러 주세요.';
  if (/rate limit/i.test(message)) return '요청이 많아요. 잠시 후 다시 시도해 주세요.';
  if (/Failed to fetch/i.test(message)) return '회원 서비스에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
  return message;
}
