import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window, type HTMLInputElement as HappyInput } from 'happy-dom';
import { describe, expect, it } from 'vitest';

async function compose(existingBody='') {
  const window=new Window({url:'https://www.koreapas.com/bbs/write.php'});
  Object.defineProperty(window.HTMLElement.prototype,'getClientRects',{configurable:true,value:()=>[{width:100,height:40}]});
  window.document.body.innerHTML='<form><input name="subject"><textarea name="content"></textarea><input type="file" accept="image/*" multiple><button type="button" id="publish">게시</button></form>';
  window.document.querySelector('textarea')!.value=existingBody;
  let publishes=0;window.document.querySelector('#publish')!.addEventListener('click',()=>publishes++);
  const sent:any[]=[];let receive:(message:any)=>void=()=>{};
  const port={postMessage:(message:any)=>sent.push(message),onMessage:{addListener:(listener:any)=>{receive=listener;}}};
  const context:Record<string,unknown>={document:window.document,location:window.location,URL,AbortController,
    setTimeout:(callback:()=>void,delay:number)=>setTimeout(callback,Math.min(delay,5)),clearTimeout,
    HTMLInputElement:window.HTMLInputElement,DataTransfer:window.DataTransfer,File:window.File,Event:window.Event,
    MutationObserver:window.MutationObserver,chrome:{runtime:{connect:()=>port}}};
  for(const name of ['shared/constants.js','shared/validators.js','content/text-input.js']) runInNewContext(readFileSync(new URL(`../../extension/${name}`,import.meta.url),'utf8'),context);
  (context.KudaeSNS as any).StatusOverlay=class{update(){}complete(){}error(){}remove(){}};
  runInNewContext(readFileSync(new URL('../../extension/content/site-upload.js',import.meta.url),'utf8'),context);
  receive({type:'JOB_START',jobId:'job-1',target:'koreapas',total:2,contentMode:'separate',title:'[고대신문 보도] 테스트',body:'본문\n\n링크\n크레딧',caption:'테스트',postId:'post-1'});
  for(let index=0;index<2;index++) receive({type:'ASSET',jobId:'job-1',index,file:new window.File([`original-${index}`],`card-${index}.png`,{type:'image/png'})});
  receive({type:'JOB_END',jobId:'job-1'});
  for(let attempt=0;attempt<100 && !sent.some(message=>['TARGET_COMPLETE','TARGET_ERROR'].includes(message.type));attempt++) await new Promise(resolve=>setTimeout(resolve,10));
  return {window,sent,publishes};
}
describe('고파스 원본 두 개 + 제목/본문 통합 전달',()=>{
  it('두 파일과 제목·본문이 모두 들어간 뒤에만 완료를 보낸다',async()=>{
    const {window,sent,publishes}=await compose();
    expect(window.document.querySelector<HappyInput>('input[name="subject"]')!.value).toBe('[고대신문 보도] 테스트');
    expect(window.document.querySelector('textarea')!.value).toBe('본문\n\n링크\n크레딧');
    const files=window.document.querySelector<HappyInput>('input[type="file"]')!.files!;
    expect(files.length).toBe(2);expect(await files[0].text()).toBe('original-0');
    expect(sent.find(message=>message.type==='TARGET_COMPLETE')).toMatchObject({count:2,contentInserted:true});
    expect(publishes).toBe(0);
  });
  it('기존 글이 있으면 파일도 넣지 않고 오류를 보내며 게시하지 않는다',async()=>{
    const {window,sent,publishes}=await compose('작성 중인 다른 기사');
    expect(window.document.querySelector('textarea')!.value).toBe('작성 중인 다른 기사');
    expect(window.document.querySelector<HappyInput>('input[type="file"]')!.files!.length).toBe(0);
    expect(sent.find(message=>message.type==='TARGET_ERROR')?.error.code).toBe('TEXT_NOT_EMPTY');
    expect(sent.some(message=>message.type==='TARGET_COMPLETE')).toBe(false);expect(publishes).toBe(0);
  });
});
