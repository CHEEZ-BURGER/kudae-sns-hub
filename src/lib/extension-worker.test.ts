import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

async function worker(feature='one-click-v1') {
  const store:Record<string,any>={};const delivered:any[]=[];const relayed:any[]=[];
  let messageHandler:any;let connectHandler:any;let targetHandler:any;
  const storage={get:async(key:any)=>key===null?{...store}:{[key]:store[key]},set:async(data:any)=>{Object.assign(store,data);},remove:async(key:string)=>{delete store[key];}};
  const chrome={storage:{session:storage},tabs:{query:async()=>[{id:5,url:'https://www.koreapas.com/bbs/write.php',active:true}],update:async()=>{},get:async()=>({id:5,url:'https://www.koreapas.com/bbs/write.php'}),sendMessage:async(_id:any,msg:any)=>relayed.push(msg)},
    sidePanel:{setPanelBehavior:async()=>{}},runtime:{getURL:(p:string)=>`chrome-extension://fixture/${p}`,onMessage:{addListener:(f:any)=>{messageHandler=f;}},onConnect:{addListener:(f:any)=>{connectHandler=f;}},onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}},sendMessage:async(msg:any)=>relayed.push(msg)}};
  const context:Record<string,any>={URL,Date,AbortController,Blob,File,setTimeout,clearTimeout,console,chrome,
    fetch:async()=>new Response(new Blob(['unaltered-original'],{type:'image/png'}))};
  for(const name of ['shared/constants.js','shared/validators.js','shared/protocol.js']) runInNewContext(readFileSync(new URL(`../../extension/${name}`,import.meta.url),'utf8'),context);
  context.importScripts=()=>{};
  runInNewContext(readFileSync(new URL('../../extension/background/service-worker.js',import.meta.url),'utf8'),context);
  connectHandler({name:'KUDAE_SNS_UPLOAD',sender:{tab:{id:5}},postMessage:(msg:any)=>delivered.push(msg),onDisconnect:{addListener:()=>{}},onMessage:{addListener:(f:any)=>{targetHandler=f;}}});
  await targetHandler({type:'TARGET_READY',feature});
  const job={jobId:'01234567-89ab-cdef-0123-456789abcdef',target:'koreapas',createdAt:Date.now(),postId:'post-1',contentMode:'separate',title:'[고대신문 보도] 제목',body:'본문',caption:'제목\n\n본문',assets:[{order:0,url:'https://bcqqokdehkfaiuquktag.supabase.co/functions/v1/media-redirect?id=fixture',mimeType:'image/png',filename:'card-01.png'}]};
  const accepted=await new Promise<any>(resolve=>messageHandler({type:'PANEL_UPLOAD_REQUEST',payload:job,targetTabId:5},{url:'chrome-extension://fixture/sidepanel/index.html'},resolve));
  return {delivered,relayed,targetHandler,job,accepted,store};
}
describe('확장 worker 글/원본 전달 계약',()=>{
  it('원본 바이트와 제목·본문·글 번호를 함께 전달한다',async()=>{
    const {delivered,job,accepted}=await worker();
    expect(accepted.accepted).toBe(true);
    expect(delivered.find(m=>m.type==='JOB_START')).toMatchObject({title:job.title,body:job.body,contentMode:'separate',postId:'post-1'});
    expect(await delivered.find(m=>m.type==='ASSET').file.text()).toBe('unaltered-original');
  });
  it('글 입력 성공을 확인한 경우에만 웹/패널에 완료를 보낸다',async()=>{
    const {job,relayed,targetHandler}=await worker();
    await targetHandler({type:'TARGET_COMPLETE',jobId:job.jobId,count:1,contentInserted:true});
    expect(relayed.find(m=>m.event?.type==='SNS_UPLOAD_COMPLETE')?.event.payload).toMatchObject({postId:'post-1',count:1,contentInserted:true});
  });
  it('이미지 전달만 성공했거나 수량이 틀리면 오류로 처리한다',async()=>{
    for(const result of [{count:1,contentInserted:false},{count:0,contentInserted:true}]) {
      const {job,relayed,targetHandler}=await worker();
      await targetHandler({type:'TARGET_COMPLETE',jobId:job.jobId,...result});
      expect(relayed.some(m=>m.event?.type==='SNS_UPLOAD_COMPLETE')).toBe(false);
      expect(relayed.some(m=>m.event?.type==='SNS_UPLOAD_ERROR')).toBe(true);
    }
  });
  it('오래된 SNS 연결 코드에는 파일을 보내지 않고 새로고침을 안내한다',async()=>{
    const {delivered,relayed}=await worker('old');
    expect(delivered.some(m=>m.type==='JOB_START')).toBe(false);
    expect(relayed.find(m=>m.event?.payload?.userMessage?.includes('새로고침'))).toBeTruthy();
  });
});
