import { useEffect, useState } from 'react';
import { authError, STATUS_LABEL, supabase, type AppSettings, type Member } from '../lib/auth';

interface Audit { id: number; action: string; target_id: string | null; created_at: string; detail: Record<string, unknown> }
const field = 'rounded-lg bg-black/30 px-3 py-2 ring-1 ring-white/15';
const actionNames: Record<string, string> = { member_update: '회원 설정 변경', settings_update: '운영 설정 변경', owner_bootstrap: '최초 관리자 등록' };

export default function AdminPanel({ onConfig }: { onConfig: (s: AppSettings) => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<Audit[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ announcement: '', maintenance: false });
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setBusy(true); setError('');
    try {
      let request = supabase!.from('members').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * 30, page * 30 + 29);
      if (status !== 'all') request = request.eq('status', status);
      if (query.trim()) request = request.ilike('email', `%${query.trim().replace(/[%_\\]/g, '')}%`);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
      const [m, c, l] = await Promise.all([request, supabase!.from('app_settings').select('announcement,maintenance').eq('id', true).single(), supabase!.from('admin_audit').select('*').order('id', { ascending: false }).limit(30)]);
      if (m.error || c.error || l.error) throw m.error || c.error || l.error;
      const ids = (m.data ?? []).map(x => x.id);
      const u = ids.length ? await supabase!.from('daily_usage').select('member_id,requests').eq('day', today).in('member_id', ids) : { data: [], error: null };
      if (u.error) throw u.error;
      setMembers(m.data ?? []); setCount(m.count ?? 0); setSettings(c.data); setLogs(l.data ?? []);
      setUsage(Object.fromEntries((u.data ?? []).map(x => [x.member_id, x.requests])));
    } catch (e) { setError(authError(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [page, status]); // explicit search avoids a request per keystroke

  const update = async (m: Member, next: Member['status']) => {
    if (busy || m.role === 'admin') return;
    if (next !== 'approved' && next !== m.status && !window.confirm(`${m.email} 회원을 '${STATUS_LABEL[next]}' 상태로 바꿀까요?`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: e } = await supabase!.rpc('admin_update_member', { target: m.id, new_status: next, new_limit: m.daily_limit });
      if (e) throw e;
      setNotice(`${m.email} · ${STATUS_LABEL[next]} · 하루 ${m.daily_limit}회로 저장했어요.`);
      await load();
    } catch (e) { setError(authError(e)); }
    finally { setBusy(false); }
  };
  const saveConfig = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: e } = await supabase!.rpc('admin_update_settings', { message: settings.announcement, paused: settings.maintenance });
      if (e) throw e;
      onConfig(settings); setNotice('공지와 운영 설정을 저장했어요.'); await load();
    } catch (e) { setError(authError(e)); }
    finally { setBusy(false); }
  };

  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
    <div><p className="text-sm text-pink-300">ADMIN</p><h1 className="mt-1 text-3xl font-extrabold">회원과 운영 관리</h1><p className="mt-2 text-sm text-white/55">승인한 회원만 작업할 수 있어요. 회원의 API 키와 사진은 서버에 수집하지 않아요.</p></div>
    {error && <p role="alert" className="rounded-xl bg-red-500/10 p-4 text-red-300">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-500/10 p-4 text-emerald-300">{notice}</p>}
    <section className="rounded-2xl border border-white/10 p-4 sm:p-6">
      <form className="mb-5 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (page) setPage(0); else void load(); }}>
        <label className="flex-1 text-sm">이메일 검색<input className={`${field} mt-1 w-full`} value={query} onChange={e => setQuery(e.target.value)} /></label>
        <label className="text-sm">가입 상태<select className={`${field} ml-2`} value={status} onChange={e => { setPage(0); setStatus(e.target.value); }}><option value="all">전체</option>{Object.entries(STATUS_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <button disabled={busy} className="rounded-lg bg-pink-500 px-4 py-2 font-bold">{busy ? '확인 중…' : '검색 / 새로고침'}</button>
      </form>
      <p className="mb-3 text-sm text-white/60">검색 결과 {count}명 · 오늘 사용량은 한국 시간 기준 AI·가져오기 요청 시도 횟수예요.</p>
      <div className="space-y-3">{members.map(m => <article key={m.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white/5 p-4">
        <div className="min-w-0"><h2 className="break-all font-bold">{m.email}</h2><p className="mt-1 text-xs text-white/55">{m.display_name} · {m.role === 'admin' ? '관리자' : STATUS_LABEL[m.status]} · 가입 {new Date(m.created_at).toLocaleDateString('ko-KR')}</p><p className="mt-1 text-xs text-white/55">오늘 {usage[m.id] ?? 0} / {m.daily_limit}회</p></div>
        {m.role !== 'admin' && <div className="flex flex-wrap items-center gap-2 text-sm">
          <label>하루 한도 <input aria-label={`${m.email} 하루 한도`} className={`${field} w-24`} type="number" min={0} max={10000} value={m.daily_limit} onChange={e => setMembers(list => list.map(x => x.id === m.id ? { ...x, daily_limit: Math.max(0, Math.min(10000, Math.trunc(Number(e.target.value)))) } : x))} /></label>
          <button disabled={busy} className={`${field} text-emerald-300`} onClick={() => void update(m, 'approved')}>승인</button>
          <button disabled={busy} className={`${field} text-amber-300`} onClick={() => void update(m, 'suspended')}>정지</button>
          {m.status === 'pending' && <button disabled={busy} className={`${field} text-red-300`} onClick={() => void update(m, 'rejected')}>거절</button>}
          <button disabled={busy} className={field} onClick={() => void update(m, m.status)}>한도 저장</button>
        </div>}
      </article>)}</div>
      {!members.length && !busy && <p className="py-8 text-center text-white/50">해당 회원이 없어요.</p>}
      <div className="mt-4 flex justify-end gap-4 text-sm"><button disabled={busy || !page} onClick={() => setPage(page-1)}>이전</button><span>{page+1} / {Math.max(1,Math.ceil(count/30))}</span><button disabled={busy || (page+1)*30>=count} onClick={() => setPage(page+1)}>다음</button></div>
    </section>
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/10 p-5"><h2 className="text-lg font-bold">공지 및 운영 설정</h2><label className="mt-4 block text-sm">회원에게 보일 공지<textarea className={`${field} mt-2 w-full`} rows={4} maxLength={2000} value={settings.announcement} onChange={e => setSettings({ ...settings, announcement:e.target.value })} /></label><label className="my-4 flex gap-2 text-sm"><input type="checkbox" checked={settings.maintenance} onChange={e => setSettings({...settings,maintenance:e.target.checked})} />점검 모드 — 일반 회원의 사용을 잠시 중지</label><button disabled={busy} className="rounded-lg bg-pink-500 px-4 py-2 font-bold" onClick={() => void saveConfig()}>운영 설정 저장</button></section>
      <section className="rounded-2xl border border-white/10 p-5"><h2 className="text-lg font-bold">최근 관리 기록</h2><div className="mt-3 max-h-80 space-y-3 overflow-y-auto">{logs.map(l => <div key={l.id} className="border-b border-white/10 pb-2 text-xs"><b>{actionNames[l.action] ?? l.action}</b><p className="mt-1 text-white/55">{new Date(l.created_at).toLocaleString('ko-KR')}{l.target_id ? ` · ${members.find(m => m.id === l.target_id)?.email ?? l.target_id}` : ''}</p>{l.detail.after_status ? <p>{STATUS_LABEL[l.detail.after_status as Member['status']]} · 한도 {String(l.detail.after_limit)}회</p> : null}</div>)}</div></section>
    </div>
  </main>;
}
