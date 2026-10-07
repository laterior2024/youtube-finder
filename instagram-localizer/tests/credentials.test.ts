import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCredential, requireApiKey, checkApiConnection } from '../src/lib/credentials.ts';
import { friendlyError, createClient } from '../src/lib/gemini.ts';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, clearCredentials } from '../src/lib/storage.ts';
class Store {
  values = new Map<string,string>();
  getItem(k:string) { return this.values.get(k) ?? null; }
  setItem(k:string,v:string) { this.values.set(k,v); }
  removeItem(k:string) { this.values.delete(k); }
}
function stores() {
  const local = new Store(), session = new Store();
  Object.defineProperty(globalThis,'localStorage',{value:local,configurable:true});
  Object.defineProperty(globalThis,'sessionStorage',{value:session,configurable:true});
  return { local, session };
}
const sample = 'test-key-not-a-real-credential';

test('mobile paste cleanup preserves key case and supports new key formats', () => {
  assert.equal(normalizeCredential(' A\nQ.test\u200BKey\t '),'AQ.testKey');
  assert.equal(requireApiKey('AQ.testKey'),'AQ.testKey');
  assert.throws(()=>requireApiKey(' \u200B '),/이 기기/);
  assert.throws(()=>requireApiKey('한글키'),/한글/);
});

test('missing key stops generation before auth or Google request', async () => {
  await assert.rejects(createClient(' ').models.generateContent({ model:'test',contents:'test' }),/이 기기/);
});

test('connection check uses a header, never a URL key, and preserves Google error category', async () => {
  let calls=0;
  await checkApiConnection(' '+sample+' ',async (url,init) => {
    calls++; assert.equal(String(url),'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1');
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'),sample);
    return Response.json({models:[]});
  });
  assert.equal(calls,1);
  await assert.rejects(checkApiConnection('',async()=>{throw new Error('must not call');}),/이 기기/);
  try { await checkApiConnection(sample,async()=>Response.json({error:{message:'PERMISSION_DENIED '+sample}},{status:403})); assert.fail('must reject'); }
  catch(e) { assert.match(friendlyError(e),/접근을 허용하지/); assert.ok(!String(e).includes(sample)); }
  assert.match(friendlyError(new Error('API_KEY_INVALID')),/올바르지/);
  assert.match(friendlyError(new Error('API_KEY_HTTP_REFERRER_BLOCKED')),/사이트 주소/);
  assert.match(friendlyError(new Error('429 RESOURCE_EXHAUSTED')),/한도/);
});

test('broken preferences cannot discard a valid tab key',()=>{
  const {local,session}=stores();
  local.setItem('ig-localizer-settings:corrupt','{');
  session.setItem('ig-localizer-settings:corrupt',JSON.stringify({apiKey:sample}));
  assert.equal(loadSettings('corrupt').apiKey,sample);
});

test('keys survive a new module/tab only after explicit device opt-in; logout is member scoped',async()=>{
  const {local,session}=stores();
  saveSettings({...DEFAULT_SETTINGS,apiKey:sample},'tab-only');
  assert.equal(local.getItem('ig-localizer-credentials:tab-only'),null);
  saveSettings({...DEFAULT_SETTINGS,apiKey:sample,rememberKeys:true},'remembered');
  saveSettings({...DEFAULT_SETTINGS,apiKey:'other-test-key',rememberKeys:true},'other');
  session.values.clear();
  const url=new URL('../src/lib/storage.ts',import.meta.url); url.search='fresh=mobile';
  const fresh=await import(url.href);
  assert.equal(fresh.loadSettings('tab-only').apiKey,'');
  assert.equal(fresh.loadSettings('remembered').apiKey,sample);
  clearCredentials('remembered');
  assert.equal(local.getItem('ig-localizer-credentials:remembered'),null);
  assert.equal(loadSettings('remembered').apiKey,'');
  assert.equal(loadSettings('other').apiKey,'other-test-key');
  clearCredentials('tab-only');clearCredentials('other');
});

test('blocked storage still allows current-screen keys and does not silently promise device persistence',()=>{
  for(const name of ['localStorage','sessionStorage']) Object.defineProperty(globalThis,name,{configurable:true,get(){throw new Error('SecurityError');}});
  assert.match(saveSettings({...DEFAULT_SETTINGS,apiKey:sample},'blocked'),/지금 열린 화면/);
  assert.equal(loadSettings('blocked').apiKey,sample);
  assert.throws(()=>saveSettings({...DEFAULT_SETTINGS,apiKey:sample,rememberKeys:true},'blocked'),/끄고/);
  clearCredentials('blocked'); assert.equal(loadSettings('blocked').apiKey,'');
});
