import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { access, authError, STATUS_LABEL, supabase, type AppSettings, type Member } from '../lib/auth';
import { clearCredentials } from '../lib/storage';
import { APP_NAME, APP_VERSION } from '../version';

const Workspace = lazy(() => import('../App'));
const AdminPanel = lazy(() => import('./AdminPanel'));
const field = 'w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 outline-none focus:border-pink-400';

export default function AccountGate() {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [config, setConfig] = useState<AppSettings>({ announcement: '', maintenance: false });

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    let revision = 0;
    let accountId: string | undefined;
    const refresh = async () => {
      const current = ++revision;
      try {
        const { data: { session }, error: sessionError } = await supabase!.auth.getSession();
        if (sessionError) throw sessionError;
        if (!alive || current !== revision) return;
        if (accountId && accountId !== session?.user.id) clearCredentials(accountId);
        accountId = session?.user.id;
        setSignedIn(!!session);
        if (!session) { setMember(null); setError(''); return; }
        const m = await access();
        const { data, error: configError } = await supabase!.from('app_settings').select('announcement,maintenance').eq('id', true).single();
        if (configError) throw configError;
        if (!alive || current !== revision) return;
        setMember(m); setConfig(data); setError('');
      } catch (e) {
        if (alive && current === revision) { setMember(null); setError(authError(e)); }
      } finally { if (alive && current === revision) setLoading(false); }
    };
    void refresh();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && accountId) clearCredentials(accountId);
      if (event === 'PASSWORD_RECOVERY') setMode('password');
      // Do not await another Supabase operation inside the auth lock callback.
      setTimeout(() => { if (alive) void refresh(); }, 0);
    });
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    window.addEventListener('focus', refresh);
    return () => { alive = false; revision++; listener.subscription.unsubscribe(); clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  const logout = async () => {
    setWorking(true);
    try {
      if (member) clearCredentials(member.id);
      const { error: outError } = await supabase!.auth.signOut();
      if (outError) throw outError;
      setMember(null); setAdmin(false); setSignedIn(false); setMode('login'); setPassword('');
    } catch (e) { setError(authError(e)); }
    finally { setWorking(false); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase || working) return;
    setWorking(true); setError(''); setNotice('');
    try {
      if (mode === 'signup') {
        const { error: e } = await supabase.auth.signUp({ email: email.trim(), password, options: {
          data: { display_name: name.trim() }, emailRedirectTo: window.location.origin,
        } });
        if (e) throw e;
        setNotice('가입 확인 메일을 보냈어요. 이메일 인증 후 로그인하면 관리자 승인을 기다릴 수 있어요.');
        setMode('login'); setPassword('');
      } else if (mode === 'reset') {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (e) throw e;
        setNotice('등록된 이메일이면 비밀번호 재설정 링크를 보내드려요.');
      } else if (mode === 'password') {
        const { error: e } = await supabase.auth.updateUser({ password });
        if (e) throw e;
        setNotice('비밀번호를 변경했어요.'); setPassword(''); setMode('login');
      } else {
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (e) throw e;
        setPassword('');
      }
    } catch (e) { setError(authError(e)); }
    finally { setWorking(false); }
  };

  if (loading) return <div className="grid min-h-screen place-items-center text-white/60">회원 정보를 확인하고 있어요…</div>;
  const allowed = member?.status === 'approved' && (!config.maintenance || member.role === 'admin');
  if (allowed && mode !== 'password') return <>
    <div className="border-b border-white/10 bg-[var(--panel-bg)] px-4 py-2">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-xs">
        <span>{member.display_name || member.email} · {member.role === 'admin' ? '관리자' : '회원'}</span>
        <div className="flex items-center gap-3">
          <span className="text-white/50">하루 요청 한도 {member.daily_limit}회</span>
          {member.role === 'admin' && <button className="font-bold text-pink-300" onClick={() => setAdmin(!admin)}>{admin ? '작업 화면' : '회원 관리'}</button>}
          <button disabled={working} onClick={() => void logout()}>로그아웃</button>
        </div>
      </div>
    </div>
    {config.announcement && <p className="mx-auto max-w-7xl whitespace-pre-wrap px-4 py-3 text-sm text-amber-200" role="status">📢 {config.announcement}</p>}
    {error && <p role="alert" className="p-3 text-red-300">{error}</p>}
    <Suspense fallback={<p className="p-8 text-center">화면을 준비하고 있어요…</p>}>
      <div hidden={admin}><Workspace key={member.id} member={member} /></div>
      {admin && <AdminPanel onConfig={setConfig} />}
    </Suspense>
  </>;

  return <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#41283e,_transparent_65%)] px-4 py-10">
    <section className="w-full max-w-md rounded-3xl border border-white/15 bg-[var(--panel-bg)] p-6 shadow-2xl sm:p-8">
      <p className="text-xs font-bold tracking-widest text-pink-300">CREATOR STUDIO · v{APP_VERSION}</p>
      <h1 className="mt-3 text-2xl font-extrabold">{APP_NAME}</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/60">하나의 아이디어를 여러 나라의 게시물로.<br />사진 편집은 무료로, AI는 내 키로 사용해요.</p>
      {!supabase ? <div className="mt-6 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-200">회원 서비스 연결을 준비하고 있어요. 관리자에게 문의해 주세요.</div>
        : signedIn && mode !== 'password' ? <div className="mt-6 space-y-4">
          <h2 className="text-xl font-bold">{member ? (config.maintenance && member.status === 'approved' ? '서비스 점검 중' : STATUS_LABEL[member.status]) : '회원 확인 필요'}</h2>
          <p className="text-sm text-white/70">{member?.status === 'pending' ? '가입이 완료됐어요. 관리자가 승인하면 작업 화면을 사용할 수 있어요. 이 화면은 30초마다 갱신돼요.' : '현재 작업 화면을 사용할 수 없어요. 관리자에게 문의해 주세요.'}</p>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button disabled={working} onClick={() => void logout()} className={field}>로그아웃</button>
        </div> : <>
          <h2 className="mt-7 text-lg font-bold">{{ login: '로그인', signup: '회원가입', reset: '비밀번호 찾기', password: '새 비밀번호' }[mode]}</h2>
          <form onSubmit={submit} className="mt-4 space-y-4">
            {mode === 'signup' && <label className="block text-sm">이름<input className={`${field} mt-1`} value={name} onChange={e => setName(e.target.value)} required maxLength={60} autoComplete="name" /></label>}
            {mode !== 'password' && <label className="block text-sm">이메일<input className={`${field} mt-1`} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>}
            {mode !== 'reset' && <label className="block text-sm">비밀번호<input className={`${field} mt-1`} type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={mode === 'login' ? 1 : 12} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />{mode !== 'login' && <span className="mt-1 block text-xs text-white/50">12자 이상으로 입력해 주세요.</span>}</label>}
            {mode === 'signup' && <p className="text-xs leading-relaxed text-white/50">이메일·이름·가입 상태는 Supabase에 저장돼요. 이메일 인증과 관리자 승인이 필요하며, AI 사용료는 회원 본인의 서비스 계정에 청구돼요.</p>}
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}
            <button disabled={working} className="w-full rounded-xl bg-gradient-to-r from-pink-500 to-orange-400 py-3 font-bold disabled:opacity-50">{working ? '처리 중…' : { login: '로그인', signup: '가입 신청', reset: '재설정 메일 받기', password: '비밀번호 변경' }[mode]}</button>
          </form>
          <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm text-white/60">
            <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); }}>{mode === 'signup' ? '로그인으로' : '회원가입'}</button>
            <button onClick={() => { setMode(mode === 'reset' ? 'login' : 'reset'); setError(''); }}>{mode === 'reset' ? '로그인으로' : '비밀번호 찾기'}</button>
          </div>
        </>}
    </section>
  </main>;
}
