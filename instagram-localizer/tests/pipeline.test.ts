import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { COUNTRIES } from '../src/lib/countries';
import { defaultGradient } from '../src/lib/gradient';

// Exercise the actual orchestration functions with deterministic provider failures.
async function pipeline(failImage: () => boolean, failCountry: () => boolean) {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url),'utf8');
  const code = source.slice(source.indexOf('  const runJobs ='), source.indexOf('  /** 사진·영상이 있는 게시물을 모두'));
  const analysis = { slides:[{index:0,backgroundType:'photo',backgroundColors:[],textBlocks:[],visualDescription:'photo'}],videoScenes:[] };
  let post:any = { id:'post',input:{images:[],video:null,caption:'',sourceUrl:'',credit:''},results:{},active:null,analysis:null,log:[],status:'draft' };
  const patchPost = (_id:string, patch:any) => { post = {...post,...patch}; ref.current=[post]; };
  const ref = {current:[post]};
  const deps:any = {
    settings:{apiKey:'test',textModel:'text',imageModel:'image'},member:{id:'member'},createClient:()=>({}),
    postsRef:ref, patchPost,addLog:(_id:string,line:string)=>{post.log.push(line);},
    patchSlide:(_id:string,c:string,index:number,patch:any)=>{post.results[c].slides=post.results[c].slides.map((s:any)=>s.index===index?{...s,...patch}:s);},
    runLimited:async(items:any[],_limit:number,fn:any)=>Promise.all(items.map(fn)),
    generateBackground:async()=>{if(failImage())throw Error('simulated image error');return 'data:image/png;base64,success';},
    friendlyError:(e:Error)=>e.message, needsAiImage:()=>true,analyzePost:async()=>analysis,
    detectAspect:()=> '4:5',COUNTRIES,
    localizePost:async(_ai:any,_model:any,_a:any,c:string)=>{if(c==='JP'&&failCountry())throw Error('simulated country error');return {country:c,slides:[{index:0,texts:[],imagePrompt:'photo'}]};},
    writeCaption:async()=>({caption:'generated'}),localizedBlocks:()=>[],defaultGradient,
  };
  const compiled=stripTypeScriptTypes(code,{mode:'transform'});
  const {processPost}=new Function(...Object.keys(deps), compiled+';return {processPost};')(...Object.values(deps));
  const options={countries:['KR','JP'],imageMode:'new',perCountryImages:true,autoImages:true,skipSolid:true,dmOffer:''};
  return { run:(retry=false)=>processPost('post',options,retry), post:()=>post };
}

test('이미지 실패를 완료로 표시하지 않고 재시도하면 복구',async()=>{
  let fail=true; const p=await pipeline(()=>fail,()=>false); await p.run();
  assert.equal(p.post().status,'partial'); assert.equal(p.post().results.KR.slides[0].bgStatus,'error');
  assert.ok(!p.post().log.some((s:string)=>s.startsWith('✅ 이미지 생성 완료')));
  fail=false; await p.run(true); assert.equal(p.post().status,'done'); assert.equal(p.post().results.KR.slides[0].bgStatus,'done');
});
test('한 나라 실패 후 재시도해도 성공한 나라의 사용자 편집은 보존',async()=>{
  let fail=true; const p=await pipeline(()=>false,()=>fail); await p.run();
  assert.equal(p.post().status,'partial'); assert.deepEqual(p.post().failedCountries,['JP']);
  p.post().results.KR.localization.caption='사용자가 수정한 설명글';
  p.post().results.KR.slides[0].background='user-background';
  fail=false; await p.run(true);
  assert.equal(p.post().status,'done'); assert.equal(p.post().results.KR.localization.caption,'사용자가 수정한 설명글');
  assert.equal(p.post().results.KR.slides[0].background,'user-background'); assert.ok(p.post().results.JP);
});
