import test from 'node:test';
import assert from 'node:assert/strict';
import { keySlots } from '../src/lib/key-slots.ts';
import { DEFAULT_SETTINGS, saveSettings, loadSettings, clearCredentials } from '../src/lib/storage.ts';
import { friendlyError } from '../src/lib/gemini.ts';
import { apifyErrorMessage } from '../src/lib/apify.ts';

test('five slots migrate legacy key, normalize all slots, and never fall back from an empty selected key', () => {
  assert.deepEqual(keySlots({apiKey:' old-test-key '}),{apiKey:'old-test-key',geminiKeys:['old-test-key','','','',''],activeGeminiKey:0});
  const keys=[' one ','two','three','four','five','ignored'];
  assert.equal(keySlots({apiKey:'legacy',geminiKeys:keys,activeGeminiKey:4}).apiKey,'five');
  assert.equal(keySlots({apiKey:'legacy',geminiKeys:['one',''],activeGeminiKey:1}).apiKey,'');
  assert.equal(keySlots({apiKey:'legacy',geminiKeys:keys,activeGeminiKey:NaN}).activeGeminiKey,0);
});
test('all five keys remain member scoped and never enter non-secret preferences', async () => {
  class Store { values=new Map<string,string>(); getItem(k:string){return this.values.get(k)??null;} setItem(k:string,v:string){this.values.set(k,v);} removeItem(k:string){this.values.delete(k);} }
  const local=new Store(),session=new Store();
  Object.defineProperty(globalThis,'localStorage',{value:local,configurable:true});
  Object.defineProperty(globalThis,'sessionStorage',{value:session,configurable:true});
  const keys=Array.from({length:5},(_,i)=>`slot-test-${i}`);
  saveSettings({...DEFAULT_SETTINGS,geminiKeys:keys,activeGeminiKey:3,rememberKeys:true},'five');
  assert.equal(loadSettings('five').apiKey,keys[3]);
  const prefs=local.getItem('ig-localizer-settings:five')!;
  for(const key of keys) assert.ok(!prefs.includes(key));
  session.values.clear();
  const fresh=await import('../src/lib/storage.ts?fresh=five');
  assert.deepEqual(fresh.loadSettings('five').geminiKeys,keys);
  assert.equal(fresh.loadSettings('other').apiKey,'');
  clearCredentials('five'); assert.equal(local.getItem('ig-localizer-credentials:five'),null);
  assert.deepEqual(loadSettings('five').geminiKeys,['','','','','']);
});
test('provider and app limits cannot be mislabeled as the other provider',()=>{
  assert.match(friendlyError(new Error('오늘 앱 사용 한도에 도달했어요.')),/앱 일일 한도/);
  assert.match(friendlyError(new Error('429 RESOURCE_EXHAUSTED')),/Gemini 생성 한도/);
  assert.match(friendlyError(new Error(apifyErrorMessage(429,'quota'))),/인스타 가져오기.*요청 속도/);
  assert.match(friendlyError(new Error(apifyErrorMessage(402,'credits'))),/Apify 사용 한도/);
});
