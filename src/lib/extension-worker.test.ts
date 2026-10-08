import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

async function worker(feature='one-click-v6',target='koreapas',assetCount=target==='x'?9:1,disconnected=false,options:{mode?:string;rejectPreflight?:boolean;rejectIntent?:boolean}={}) {
  const store:Record<string,any>={};const delivered:any[]=[];const relayed:any[]=[];
  let messageHandler:any;let connectHandler:any;let targetHandler:any;let disconnectHandler:any;let reconnects=0;
  const opened:any[]=[];let fetched=0;
  const storage={get:async(key:any)=>key===null?{...store}:{[key]:store[key]},set:async(data:any)=>{Object.assign(store,data);},remove:async(key:string)=>{delete store[key];}};
  const targetUrl=target==='x'?'https://x.com/compose/post':'https://www.koreapas.com/bbs/write.php';
  const chrome={storage:{session:storage},tabs:{query:async()=>[{id:5,url:targetUrl,active:true}],update:async()=>{},get:async()=>({id:5,url:targetUrl}),sendMessage:async(_id:any,msg:any)=>{
    if(msg.type==='KUDAE_X_PREFLIGHT')return {ok:!options.rejectPreflight&&!(options.rejectIntent&&msg.expectedCaption),mode:options.mode||'article',error:{code:'TEXT_NOT_EMPTY',userMessage:'기존 초안 보존'}};
    if(msg.type==='KUDAE_RECONNECT_TARGET'){reconnects++;attach(_id);await targetHandler({type:'TARGET_READY',feature});return {ready:true,feature};}
    relayed.push(msg);
  },create:async(info:any)=>{opened.push(info);return {id:6,status:'loading'};}},
    sidePanel:{setPanelBehavior:async()=>{}},runtime:{getURL:(p:string)=>`chrome-extension://fixture/${p}`,onMessage:{addListener:(f:any)=>{messageHandler=f;}},onConnect:{addListener:(f:any)=>{connectHandler=f;}},onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}},sendMessage:async(msg:any)=>relayed.push(msg)}};
  const context:Record<string,any>={URL,Date,AbortController,Blob,File,setTimeout,clearTimeout,console,chrome,
    fetch:async()=>{fetched++;return new Response(new Blob(['unaltered-original'],{type:'image/png'}));}};
  for(const name of ['shared/constants.js','shared/x-thread.js','shared/validators.js','shared/protocol.js']) runInNewContext(readFileSync(new URL(`../../extension/${name}`,import.meta.url),'utf8'),context);
  context.importScripts=()=>{};
  runInNewContext(readFileSync(new URL('../../extension/background/service-worker.js',import.meta.url),'utf8'),context);
  function attach(id=5){connectHandler({name:'KUDAE_SNS_UPLOAD',sender:{tab:{id}},postMessage:(msg:any)=>delivered.push(msg),onDisconnect:{addListener:(f:any)=>disconnectHandler=f},onMessage:{addListener:(f:any)=>{targetHandler=f;}}});}
  attach();
  await targetHandler({type:'TARGET_READY',feature});
  if(disconnected)disconnectHandler();
  const job={jobId:'01234567-89ab-cdef-0123-456789abcdef',target,createdAt:Date.now(),postId:'post-1',contentMode:target==='x'?'caption':'separate',title:'[고대신문 보도] 제목',body:'본문',caption:'제목\n\nhttps://www.kunews.ac.kr/',assets:Array.from({length:assetCount},(_,order)=>({order,url:'https://bcqqokdehkfaiuquktag.supabase.co/functions/v1/media-redirect?id=fixture',mimeType:'image/png',filename:`card-${order}.png`}))};
  const accepted=await new Promise<any>(resolve=>messageHandler({type:'PANEL_UPLOAD_REQUEST',payload:job,targetTabId:5},{url:'chrome-extension://fixture/sidepanel/index.html'},resolve));
  return {delivered,relayed,targetHandler,job,accepted,store,reconnects,opened,fetched};
}
describe('확장 worker 글/원본 전달 계약',()=>{
  it('빈 X 작성창 확인 후 한 번만 작성 링크를 열고 X가 채운 글을 확인한 뒤 원본을 가져온다',async()=>{
    const f=await worker('one-click-v6','x',6);
    expect(f.opened).toHaveLength(1);const url=new URL(f.opened[0].url);
    expect(url.origin+url.pathname).toBe('https://x.com/intent/post');expect(url.searchParams.get('text')).toBe(f.job.caption);
    expect(f.fetched).toBe(6);expect(f.delivered.filter(m=>m.type==='JOB_START')).toHaveLength(1);
    expect(f.delivered.find(m=>m.type==='JOB_START')).toMatchObject({xIntentPrepared:true});
    expect(f.store[`job:${f.job.jobId}`].targetTabId).toBe(6);
  });
  it.each([{rejectPreflight:true},{rejectIntent:true}])('기존 초안이나 잘못 채운 X 글에는 사진을 가져오거나 입력하지 않는다 %j',async options=>{
    const f=await worker('one-click-v6','x',6,false,options);
    expect(f.fetched).toBe(0);expect(f.delivered.some(m=>m.type==='JOB_START')).toBe(false);
    expect(f.opened).toHaveLength(options.rejectPreflight?0:1);
    expect(f.relayed.some(m=>m.event?.type==='SNS_UPLOAD_ERROR')).toBe(true);
  });
  it('열린 답글에는 새 글 링크를 열거나 제목을 덧붙이지 않는다',async()=>{
    const f=await worker('one-click-v6','x',2,false,{mode:'media'});
    expect(f.opened).toHaveLength(0);expect(f.fetched).toBe(2);expect(f.delivered.find(m=>m.type==='JOB_START').xIntentPrepared).toBe(false);
  });
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
  it.each(['one-click-v1','one-click-v2','one-click-v3','one-click-v4','one-click-v5'])('오래된 %s SNS 연결 코드에는 파일을 보내지 않고 새로고침을 안내한다',async feature=>{
    const {delivered,relayed}=await worker(feature);
    expect(delivered.some(m=>m.type==='JOB_START')).toBe(false);
    expect(relayed.find(m=>m.event?.payload?.userMessage?.includes('새로고침'))).toBeTruthy();
  });
  it('worker 재시작으로 사라진 유휴 탭 연결은 메시지로 복구하고 한 번만 전송한다',async()=>{
    const f=await worker('one-click-v6','x',6,true);expect(f.reconnects).toBe(2);
    expect(f.delivered.filter(m=>m.type==='JOB_START')).toHaveLength(1);
    expect(f.delivered.filter(m=>m.type==='ASSET')).toHaveLength(6);expect(f.accepted.accepted).toBe(true);
  });
  it('X 스레드 계획을 재계산해 전달하며 전체 스레드 수까지 일치해야 완료한다',async()=>{
    const first=await worker('one-click-v6','x');
    expect(first.accepted.accepted).toBe(true);
    expect(first.delivered.find(m=>m.type==='JOB_START').xThread.flatMap((p:any)=>p.assetOrders)).toEqual([0,1,2,3,4,5,6,7,8]);
    await first.targetHandler({type:'TARGET_COMPLETE',jobId:first.job.jobId,count:9,contentInserted:true,threadCount:2});
    expect(first.relayed.some(m=>m.event?.type==='SNS_UPLOAD_COMPLETE')).toBe(false);
    const second=await worker('one-click-v6','x');
    await second.targetHandler({type:'TARGET_COMPLETE',jobId:second.job.jobId,count:9,contentInserted:true,threadCount:4,xMode:'article'});
    expect(second.relayed.find(m=>m.event?.type==='SNS_UPLOAD_COMPLETE')?.event.payload).toMatchObject({count:9,contentInserted:true});
  });
  it('열린 답글의 이미지 전용 완료는 4장 이내만 허용하고 4장 초과 완료 주장은 거부한다',async()=>{
    const valid=await worker('one-click-v6','x',2,false,{mode:'media'});
    await valid.targetHandler({type:'TARGET_COMPLETE',jobId:valid.job.jobId,count:2,contentInserted:true,threadCount:1,xMode:'media'});
    expect(valid.relayed.some(m=>m.event?.type==='SNS_UPLOAD_COMPLETE')).toBe(true);
    const invalid=await worker('one-click-v6','x',9,false,{mode:'media'});
    await invalid.targetHandler({type:'TARGET_COMPLETE',jobId:invalid.job.jobId,count:9,contentInserted:true,threadCount:1,xMode:'media'});
    expect(invalid.relayed.some(m=>m.event?.type==='SNS_UPLOAD_COMPLETE')).toBe(false);
  });
});
