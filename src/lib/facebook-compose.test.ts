import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window, type HTMLElement as HappyElement, type HTMLInputElement as HappyInput } from 'happy-dom';
import { describe, expect, it } from 'vitest';

async function compose({ack=true,onePreview=false,existing='',duplicateEnd=false,replaceEditor=false,resetPicker=false,imageOnly=false,addIcons=false}={}) {
  const window=new Window({url:'https://www.facebook.com/post/create'});
  Object.defineProperty(window.HTMLElement.prototype,'getClientRects',{configurable:true,value:()=>[{width:100,height:40}]});
  window.document.body.innerHTML='<input id="unrelated" type="file" accept="image/*" multiple><div role="dialog"><form><img src="https://example.test/avatar.png" alt="프로필 사진"><div contenteditable="true" role="textbox" data-lexical-editor="true"></div><div id="attachments"></div><input id="photos" type="file" accept="image/*,video/*" multiple><button id="publish">게시</button></form></div><input id="last-unrelated" type="file" accept="image/*" multiple>';
  let editor=window.document.querySelector<HappyElement>('[contenteditable]')!;
  const caption='[아랑졸띠] 시나몬 향이 맴도는 곳, 대즐링\n\n169. 제기동 ‘대즐링’\n\n첫 문단\n\n두 번째 문단\n\n조혜민(문과대 영문22)';
  const nativeSetter=Object.getOwnPropertyDescriptor(window.HTMLElement.prototype,'innerText')!.set!;
  let pastes=0;
  const prepare=(el:HappyElement)=>{
    Object.defineProperty(el,'innerText',{get:()=>[...el.childNodes].map(node=>node.nodeName==='BR'?'\n':node.textContent).join(''),set:(text:string)=>nativeSetter.call(el,text)});
    el.addEventListener('paste',(event)=>{event.preventDefault();pastes++;el.innerText=(event as any).clipboardData.getData('text/plain');});
  };
  prepare(editor);editor.innerText=existing;
  let publishes=0;window.document.querySelector('#publish')!.addEventListener('click',()=>publishes++);
  const photos=window.document.querySelector<HappyInput>('#photos')!;
  let changes=0;let bodyAtAttachment='';
  photos.addEventListener('change',()=>{
    changes++;bodyAtAttachment=editor.innerText;
    if(!ack)return;
    if(replaceEditor){const next=editor.cloneNode(false) as HappyElement;editor.replaceWith(next);editor=next;prepare(editor);}
    if(addIcons)for(let index=0;index<4;index++){
      const icon=window.document.createElement('img');icon.src=`data:image/png;test-icon-${index}`;
      Object.defineProperty(icon,'getClientRects',{value:()=>[{width:24,height:24}]});
      window.document.querySelector('#attachments')!.append(icon);
    }
    for(let index=0;index<(onePreview?1:photos.files!.length);index++){
      const image=window.document.createElement('img');image.src=`blob:https://www.facebook.com/test-${index}`;window.document.querySelector('#attachments')!.append(image);
      const mirror=image.cloneNode();window.document.querySelector('#attachments')!.append(mirror);
    }
    if(resetPicker)photos.value='';
  });
  const sent:any[]=[];let receive:(message:any)=>void=()=>{};
  const port={postMessage:(message:any)=>sent.push(message),onMessage:{addListener:(listener:any)=>{receive=listener;}}};
  const context:Record<string,unknown>={document:window.document,location:window.location,URL,AbortController,
    setTimeout:(callback:()=>void,delay:number)=>setTimeout(callback,Math.min(delay,5)),clearTimeout,
    HTMLInputElement:window.HTMLInputElement,DataTransfer:window.DataTransfer,File:window.File,Event:window.Event,
    MutationObserver:window.MutationObserver,chrome:{runtime:{connect:()=>port,onMessage:{addListener(){}}}}};
  for(const name of ['shared/constants.js','shared/validators.js','content/text-input.js'])runInNewContext(readFileSync(new URL(`../../extension/${name}`,import.meta.url),'utf8'),context);
  const api=context.KudaeSNS as any;
  api.StatusOverlay=class{update(){}complete(){}error(){}remove(){}};
  api.waitForMutation=async(test:()=>unknown)=>{for(let i=0;i<5;i++){const result=test();if(result)return result;await new Promise(r=>setTimeout(r,5));}throw new Error('timeout');};
  runInNewContext(readFileSync(new URL('../../extension/content/site-upload.js',import.meta.url),'utf8'),context);
  receive({type:'JOB_START',jobId:'facebook-job',target:'facebook',total:2,...(imageOnly?{}:{contentMode:'caption',title:'제목',body:'본문',caption,postId:'post-1'})});
  for(let index=0;index<2;index++)receive({type:'ASSET',jobId:'facebook-job',index,file:new window.File([`original-${index}`],`card-${index}.png`,{type:'image/png'})});
  receive({type:'JOB_END',jobId:'facebook-job'});if(duplicateEnd)receive({type:'JOB_END',jobId:'facebook-job'});
  for(let i=0;i<100&&!sent.some(message=>['TARGET_COMPLETE','TARGET_ERROR'].includes(message.type));i++)await new Promise(r=>setTimeout(r,10));
  return {window,sent,photos,editor,caption,pastes,changes,bodyAtAttachment,publishes};
}

describe('Facebook attachment + Lexical regression',()=>{
  it('현재 작성창에 원본 두 개의 미리보기 확인 후 줄바꿈을 보존해 본문을 한 번만 넣는다',async()=>{
    const result=await compose({duplicateEnd:true});
    expect(result.photos.files!.length).toBe(2);expect(await result.photos.files![0].text()).toBe('original-0');
    expect(result.window.document.querySelector<HappyInput>('#unrelated')!.files!.length).toBe(0);
    expect(result.window.document.querySelector<HappyInput>('#last-unrelated')!.files!.length).toBe(0);
    expect(result.bodyAtAttachment).toBe('');expect(result.editor.innerText).toBe(result.caption);
    expect(result.pastes).toBe(1);expect(result.changes).toBe(1);
    expect(result.sent.filter(message=>message.type==='TARGET_COMPLETE')).toHaveLength(1);
    expect(result.sent.find(message=>message.type==='TARGET_COMPLETE')).toMatchObject({count:2,contentInserted:true});expect(result.publishes).toBe(0);
    await result.window.close();
  });
  it('FileList만 채워지고 사진 미리보기가 없으면 글을 넣거나 완료·다음 글을 보내지 않는다',async()=>{
    const result=await compose({ack:false});
    expect(result.photos.files!.length).toBe(2);expect(result.editor.innerText).toBe('');expect(result.pastes).toBe(0);
    expect(result.sent.some(message=>message.type==='TARGET_COMPLETE')).toBe(false);
    expect(result.sent.find(message=>message.type==='TARGET_ERROR')?.error.code).toBe('COMPOSER_DID_NOT_REACT');
    expect(result.publishes).toBe(0);await result.window.close();
  });
  it('같은 이미지가 미리보기 두 곳에 나와도 두 장 전달로 세지 않는다',async()=>{
    const result=await compose({onePreview:true});
    expect(result.sent.some(message=>message.type==='TARGET_COMPLETE')).toBe(false);expect(result.pastes).toBe(0);
    await result.window.close();
  });
  it('사진 한 장과 새 첨부 버튼 아이콘을 사진 두 장으로 오인하지 않는다',async()=>{
    const result=await compose({onePreview:true,addIcons:true});
    expect(result.sent.some(message=>message.type==='TARGET_COMPLETE')).toBe(false);expect(result.pastes).toBe(0);
    expect(result.sent.find(message=>message.type==='TARGET_ERROR')?.error.code).toBe('COMPOSER_DID_NOT_REACT');
    await result.window.close();
  });
  it('작성 중인 다른 글이 있으면 사진과 본문 모두 변경하지 않는다',async()=>{
    const result=await compose({existing:'기자가 작성 중인 다른 글'});
    expect(result.photos.files!.length).toBe(0);expect(result.editor.innerText).toBe('기자가 작성 중인 다른 글');
    expect(result.sent.find(message=>message.type==='TARGET_ERROR')?.error.code).toBe('TEXT_NOT_EMPTY');
    await result.window.close();
  });
  it('사진 첨부 후 편집기가 새로 만들어져도 새 편집기에 한 번만 입력한다',async()=>{
    const result=await compose({replaceEditor:true});
    expect(result.editor.innerText).toBe(result.caption);expect(result.pastes).toBe(1);
    expect(result.sent.find(message=>message.type==='TARGET_COMPLETE')).toMatchObject({count:2,contentInserted:true});
    await result.window.close();
  });
  it('사진을 받은 사이트가 파일 선택칸을 비워도 미리보기로 성공을 확인한다',async()=>{
    const result=await compose({resetPicker:true});
    expect(result.photos.files!.length).toBe(0);expect(result.pastes).toBe(1);
    expect(result.sent.find(message=>message.type==='TARGET_COMPLETE')).toMatchObject({count:2,contentInserted:true});
    expect(result.publishes).toBe(0);await result.window.close();
  });
  it('기존 이미지 전용 작업도 현재 작성창의 첨부칸을 사용한다',async()=>{
    const result=await compose({imageOnly:true});
    expect(result.photos.files!.length).toBe(2);expect(result.editor.innerText).toBe('');expect(result.pastes).toBe(0);
    expect(result.sent.find(message=>message.type==='TARGET_COMPLETE')).toMatchObject({count:2,contentInserted:false});
    await result.window.close();
  });
});
