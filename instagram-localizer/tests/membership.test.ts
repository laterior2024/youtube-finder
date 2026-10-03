import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('가입 → 인증 → 승인, 권한 상승 차단, 정지·점검·한도 및 감사 기록', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated,anon;`);
    await db.exec(await readFile(new URL('../supabase/migrations/202610030001_members.sql', import.meta.url),'utf8'));
    const owner='00000000-0000-0000-0000-000000000001', member='00000000-0000-0000-0000-000000000002';
    await db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'owner@example.com','{}'),($2,'member@example.test','{"role":"admin","status":"approved"}')`,[owner,member]);
    const asUser = async (id: string) => { await db.exec('reset role; set role authenticated;'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); };
    await asUser(owner);
    await assert.rejects(db.query('select public.get_access()'),/이메일 인증/);
    await db.exec('reset role; update auth.users set email_confirmed_at=now();');
    await asUser(member);
    const pending = await db.query<{status: string; role: string}>('select status,role from public.get_access()');
    assert.equal(pending.rows[0].status,'pending'); assert.equal(pending.rows[0].role,'member');
    await assert.rejects(db.query('select public.reserve_request()'),/관리자 승인/);
    await assert.rejects(db.query("update public.members set role='admin'"),/permission denied/);
    await assert.rejects(db.query('select * from private.owner_bootstrap'),/permission denied/);
    assert.equal((await db.query('select * from public.members')).rows.length,1);
    await assert.rejects(db.query("select public.admin_update_member($1,'approved',2)",[member]),/관리자만/);
    await asUser(owner);
    assert.equal((await db.query<{role:string}>('select role from public.get_access()')).rows[0].role,'admin');
    assert.equal((await db.query('select * from public.members')).rows.length,2);
    await db.query("select public.admin_update_member($1,'approved',2)",[member]);
    await assert.rejects(db.query("select public.admin_update_member($1,'suspended',2)",[owner]),/관리자 계정/);
    await asUser(member);
    await db.query('select public.reserve_request()'); await db.query('select public.reserve_request()');
    await assert.rejects(db.query('select public.reserve_request()'),/한도/);
    await asUser(owner); await db.query("select public.admin_update_member($1,'suspended',100)",[member]);
    await asUser(member); await assert.rejects(db.query('select public.reserve_request()'),/관리자 승인/);
    await asUser(owner); await db.query("select public.admin_update_member($1,'approved',100)",[member]);
    await db.query("select public.admin_update_settings('공지',true)");
    await asUser(member); await assert.rejects(db.query('select public.reserve_request()'),/점검/);
    assert.equal((await db.query('select * from public.admin_audit')).rows.length,0);
    await asUser(owner); await db.query('select public.reserve_request()');
    assert.equal((await db.query('select * from public.admin_audit')).rows.length,5);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select public.get_access()'),/permission denied/);
  } finally { await db.close(); }
});
