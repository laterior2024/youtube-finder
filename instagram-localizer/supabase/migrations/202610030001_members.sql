-- 새 프로젝트 설치 전 owner@example.com을 실제 관리자 이메일로 바꾸세요.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null default 'member' check (role in ('member', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'suspended', 'rejected')),
  daily_limit integer not null default 100 check (daily_limit between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.app_settings (
  id boolean primary key default true check (id),
  announcement text not null default '' check (length(announcement) <= 2000),
  maintenance boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (true);
create table public.daily_usage (
  member_id uuid not null references public.members(id) on delete cascade,
  day date not null,
  requests integer not null default 0,
  primary key (member_id, day)
);
create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.members(id) on delete set null,
  target_id uuid references public.members(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table private.owner_bootstrap (email text primary key, claimed boolean not null default false);
alter table private.owner_bootstrap enable row level security;
insert into private.owner_bootstrap(email) values ('owner@example.com');

alter table public.members enable row level security;
alter table public.app_settings enable row level security;
alter table public.daily_usage enable row level security;
alter table public.admin_audit enable row level security;
revoke all on public.members, public.app_settings, public.daily_usage, public.admin_audit from anon, authenticated;
grant select on public.members, public.app_settings, public.daily_usage, public.admin_audit to authenticated;

create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members where id = auth.uid() and role = 'admin' and status = 'approved');
$$;
-- RLS evaluates this private helper; it cannot modify data or reveal other members.
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;
create policy members_read on public.members for select to authenticated using (id = (select auth.uid()) or (select private.is_admin()));
create policy settings_read on public.app_settings for select to authenticated using (true);
create policy usage_read on public.daily_usage for select to authenticated using (member_id = (select auth.uid()) or (select private.is_admin()));
create policy audit_read on public.admin_audit for select to authenticated using ((select private.is_admin()));

create function private.new_member() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.members(id, email, display_name)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data->>'display_name', ''), 60));
  return new;
end;
$$;
create trigger on_localizer_signup after insert on auth.users for each row execute function private.new_member();
insert into public.members(id,email,display_name)
select id,coalesce(email,''),left(coalesce(raw_user_meta_data->>'display_name',''),60) from auth.users
on conflict (id) do nothing;

-- Bootstrap only a verified owner email, once. Never trust editable user_metadata roles.
create function public.get_access() returns public.members language plpgsql security definer set search_path = '' as $$
declare m public.members; owner_email text; verified boolean;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.' using errcode = '42501'; end if;
  select email, email_confirmed_at is not null into owner_email, verified from auth.users where id = auth.uid();
  if not coalesce(verified, false) then raise exception '이메일 인증을 먼저 완료해 주세요.' using errcode = '42501'; end if;
  perform 1 from private.owner_bootstrap where email = lower(owner_email) and not claimed for update;
  if found then
    update public.members set role='admin', status='approved', updated_at=now() where id=auth.uid();
    update private.owner_bootstrap set claimed=true where email=lower(owner_email);
    insert into public.admin_audit(actor_id,target_id,action) values(auth.uid(),auth.uid(),'owner_bootstrap');
  end if;
  select * into m from public.members where id=auth.uid();
  if m.id is null then raise exception '회원 정보를 찾을 수 없어요.' using errcode='42501'; end if;
  return m;
end;
$$;

-- Atomic per-day reservation, Korea time. Counts attempts (including provider errors), not money.
create function public.reserve_request() returns integer language plpgsql security definer set search_path = '' as $$
declare m public.members; used integer; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  m := public.get_access();
  if m.status <> 'approved' then raise exception '관리자 승인 후 사용할 수 있어요.' using errcode='42501'; end if;
  if m.role <> 'admin' and (select maintenance from public.app_settings where id) then
    raise exception '현재 점검 중이에요. 잠시 후 다시 시도해 주세요.' using errcode='42501';
  end if;
  insert into public.daily_usage(member_id,day,requests) values(m.id,today,0) on conflict do nothing;
  update public.daily_usage set requests=requests+1
  where member_id=m.id and day=today and requests < m.daily_limit returning requests into used;
  if used is null then raise exception '오늘 앱 사용 한도에 도달했어요. 관리자에게 문의해 주세요.' using errcode='P0001'; end if;
  return used;
end;
$$;

create function public.admin_update_member(target uuid, new_status text, new_limit integer) returns void
language plpgsql security definer set search_path = '' as $$
declare previous public.members;
begin
  if not private.is_admin() then raise exception '관리자만 변경할 수 있어요.' using errcode='42501'; end if;
  if new_status not in ('pending','approved','suspended','rejected') or new_status is null
    or new_limit is null or new_limit not between 0 and 10000 then raise exception '잘못된 설정이에요.'; end if;
  select * into previous from public.members where id=target for update;
  if previous.id is null then raise exception '회원이 없어요.'; end if;
  if previous.role='admin' then raise exception '관리자 계정은 이 화면에서 변경할 수 없어요.'; end if;
  update public.members set status=new_status,daily_limit=new_limit,updated_at=now() where id=target;
  insert into public.admin_audit(actor_id,target_id,action,detail) values(auth.uid(),target,'member_update',
    jsonb_build_object('before_status',previous.status,'after_status',new_status,'before_limit',previous.daily_limit,'after_limit',new_limit));
end;
$$;

create function public.admin_update_settings(message text, paused boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception '관리자만 변경할 수 있어요.' using errcode='42501'; end if;
  if message is null or length(message)>2000 or paused is null then raise exception '잘못된 설정이에요.'; end if;
  update public.app_settings set announcement=message,maintenance=paused,updated_at=now() where id;
  insert into public.admin_audit(actor_id,action,detail) values(auth.uid(),'settings_update',jsonb_build_object('maintenance',paused));
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;
revoke all on function public.get_access(),public.reserve_request(),public.admin_update_member(uuid,text,integer),public.admin_update_settings(text,boolean) from public, anon;
grant execute on function public.get_access(),public.reserve_request(),public.admin_update_member(uuid,text,integer),public.admin_update_settings(text,boolean) to authenticated;
commit;
