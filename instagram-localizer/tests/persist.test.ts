import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createPersistence } from '../src/lib/persist';
import { manualResult } from '../src/lib/manual';
import { captionSource } from '../src/lib/gemini';
import type { PostAnalysis, PostJob } from '../src/types';

test('회원별 저장 격리, 복구 및 삭제 후 다른 회원 결과 보존', async () => {
  const a=createPersistence('member-a'), b=createPersistence('member-b');
  const input={images:[],caption:'원문',credit:'',sourceUrl:'',video:null};
  const post={id:'a',input,status:'running',log:[],results:{KR:manualResult(input,'KR')},analysis:null} as unknown as PostJob;
  const payload={posts:[post],options:{countries:['KR'],imageMode:'new',perCountryImages:true,autoImages:true,skipSolid:true,dmOffer:''},view:'result',activePostId:'a'} as const;
  await a.saveState(payload as any);
  assert.equal(await b.loadState(),null);
  const saved=await a.loadState(); assert.equal(saved?.posts[0].input.caption,'원문');
  assert.equal(a.reviveAfterReload(saved!.posts)[0].status,'partial');
  await b.saveState({...payload,posts:[{...post,id:'b'}]} as any);
  await a.clearState(); assert.equal(await a.loadState(),null); assert.equal((await b.loadState())?.posts[0].id,'b');
});
test('영상만 있어도 설명글에 발화·화면 글·장면 내용을 전달', () => {
  const source=captionSource({captionOriginal:'',slides:[],videoSummary:'영상 요약',videoScenes:[{start:0,end:3,spokenText:'물 200ml',onScreenText:'2분',description:'젓기'}]} as PostAnalysis);
  for(const fact of ['물 200ml','2분','젓기','영상 요약']) assert.ok(source.includes(fact));
});
