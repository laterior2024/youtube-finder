import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxyInstagramImage } from '../server/imageProxy';
import { authorizeMember } from '../server/authorize';

test('허용 주소만 가져오고 리다이렉트 우회를 차단', async () => {
  for (const url of ['http://a.cdninstagram.com/x','https://evil.test/x','https://a.cdninstagram.com.evil.test/x','https://a.cdninstagram.com:8443/x','https://u:p@a.cdninstagram.com/x']) {
    const out = await proxyInstagramImage(url, (()=>{throw Error('network must not run');}) as typeof fetch);
    assert.equal(out.status,403);
  }
  let calls=0;
  const out = await proxyInstagramImage('https://a.cdninstagram.com/x', (async () => { calls++; return new Response(null,{status:302,headers:{location:'https://evil.test/x'}}); }) as typeof fetch);
  assert.equal(out.status,403); assert.equal(calls,1);
});
test('헤더와 스트림 양쪽에서 4MB 초과 다운로드 중단', async () => {
  let cancelled=false;
  const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
  const out=await proxyInstagramImage('https://a.fbcdn.net/x',(async()=>new Response(stream,{headers:{'content-type':'image/png'}})) as typeof fetch);
  assert.equal(out.status,413); assert.equal(cancelled,true);
  const header=await proxyInstagramImage('https://a.fbcdn.net/x',(async()=>new Response('x',{headers:{'content-type':'image/png','content-length':'5000000'}})) as typeof fetch);
  assert.equal(header.status,413);
});
test('승인·세션 검증 실패시 프록시 차단, 비밀 키 불필요', async () => {
  const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test'};
  assert.equal((await authorizeMember(new Request('https://app.test/api/image'),env))?.status,401);
  const req=new Request('https://app.test/api/image',{headers:{Authorization:'Bearer test'}});
  assert.equal((await authorizeMember(req,env,(async()=>new Response('',{status:403})) as typeof fetch))?.status,403);
  assert.equal(await authorizeMember(req,env,(async(_url, init)=>{assert.equal((init?.headers as Record<string,string>).apikey,'public-test');return new Response('1');}) as typeof fetch),null);
});
