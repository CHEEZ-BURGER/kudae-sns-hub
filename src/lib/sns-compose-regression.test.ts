import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {Window,type HTMLElement as Element,type HTMLInputElement as Input} from 'happy-dom';
import {describe,it,expect} from 'vitest';
import {buildXThread} from '../../extension/shared/x-thread.mjs';
const twitterText=createRequire(import.meta.url)('twitter-text');
const source=(file:string)=>readFileSync(new URL(`../../extension/${file}`,import.meta.url),'utf8');

async function fixture(target:'everytime'|'youtube'|'facebook'|'x',options:{ack?:boolean;count?:number;existing?:string;delayed?:boolean;failAt?:number;createPost?:boolean;existingPhoto?:boolean;xContext?:'reply'|'quote';xRejectPaste?:boolean;xPartialPaste?:boolean;xInline?:boolean;disconnectBeforeJob?:boolean;disconnectAt?:number;xNative?:boolean;xNativeReject?:boolean;xIntentPrepared?:boolean;xMissingCaption?:boolean;preflightOnly?:'blank'|'prepared'}={}) {
  const count=options.count || 2, ack=options.ack!==false;
  const window=new Window({url:`https://${target==='everytime'?'everytime.kr':target==='x'?'x.com':`www.${target}.com`}/compose`});
  Object.defineProperty(window.HTMLElement.prototype,'getClientRects',{value:()=>[{width:100,height:100}],configurable:true});
  const doc=window.document;
  if(target==='everytime')doc.body.innerHTML='<form class="write"><input name="title"><textarea name="text"></textarea><input name="file" type="file" multiple><ol class="thumbnails"><li class="new"></li></ol><button id="publish">완료</button></form>';
  if(target==='facebook')doc.body.innerHTML='<input id="outside" type="file" multiple><main><section id="composer"><input type="file" multiple accept="image/*"><div contenteditable="true" role="textbox" aria-label="고대신문님, 무슨 생각을 하고 계신가요?"></div><div id="attachments"></div><button id="publish">게시</button></section></main>';
  if(target==='youtube')doc.body.innerHTML='<input id="lens" type="file" accept="image/*"><ytd-backstage-post-dialog-renderer><div id="contenteditable-root" contenteditable="true" aria-label="Post an update to your fans"></div><button id="image" aria-label="Add an image">Image</button><ytd-backstage-multi-image-select-renderer><input id="photos" type="file" multiple accept="image/*" hidden><div id="thumbnail-drag-drop-area"></div></ytd-backstage-multi-image-select-renderer><ytd-backstage-image-poll-creation-renderer><input id="poll" type="file" accept="image/*"></ytd-backstage-image-poll-creation-renderer><button id="publish">Post</button></ytd-backstage-post-dialog-renderer><div contenteditable="true" aria-label="Add a comment..."></div>';
  if(target==='x')doc.body.innerHTML='<div role="dialog"><div id="rows"></div><button id="add" aria-label="Add post">+</button><button id="publish">Post all</button></div><div contenteditable="true" data-testid="tweetTextarea_0"></div>';
  if(target==='x' && options.xInline)doc.body.innerHTML='<a data-testid="SideNav_NewTweet_Button" href="/compose/post" id="open" aria-label="Post">Post</a><form id="inline"><div id="rows"></div><a id="add" data-testid="addButton" aria-label="Add post" href="/compose/post">+</a><button id="publish">Post all</button></form><div contenteditable="true" data-testid="tweetTextarea_0" hidden></div>';
  const title='[보도] 테스트',caption=title+'\n\n'+(target==='x'?'https://www.kunews.ac.kr/news/articleView.html?idxno=51524':'첫 문단\n\n두 번째 문단\n글 | 기자');
  if(target==='x') {
    const timeline=doc.createElement('article');timeline.setAttribute('data-testid','tweet');doc.body.append(timeline);
    if(options.xContext) {const article=doc.createElement('article');article.setAttribute('data-testid',options.xContext==='quote'?'quoteTweet':'tweet');article.textContent='기존 원문 제목과 링크';doc.querySelector('[role="dialog"]')!.prepend(article);}
  }
  let modes=0,publishes=0,connects=0,nativeCommands=0,pastes=0;const captionsAtOpen:string[]=[];const assigned:{name:string;bytes:string;row:number}[]=[];
  let receive=(message:any)=>{},disconnect=()=>{},runtimeReceive=(message:any,_sender:any,respond:any)=>{};
  doc.querySelector('#publish')!.addEventListener('click',()=>publishes++);
  function wire(input:Input,row:Element,number=0) {
    input.addEventListener('change',async()=>{
      const originals=[...input.files!];
      for(const file of originals)assigned.push({name:file.name,bytes:await file.text(),row:number});
      if(options.disconnectAt===number) {disconnect();runtimeReceive({type:'KUDAE_RECONNECT_TARGET'},null,()=>{});receive({type:'REQUEST_READY'});}
      input.value=''; // Actual sites consume and clear their picker.
      if(!ack || options.failAt===number)return;
      await new Promise(r=>setTimeout(r,5));
      for(const file of originals) {
        if(target==='everytime') {const li=doc.createElement('li');li.className='thumbnail attached';li.style.backgroundImage=`url("blob:eta/${file.name}")`;row.querySelector('ol')!.append(li);}
        else {const image=doc.createElement('img');image.src=`blob:test/${number}/${file.name}`;
          if(target==='youtube') {const thumbnail=doc.createElement('ytd-backstage-multi-image-thumbnail-renderer');thumbnail.append(image);row.querySelector('#thumbnail-drag-drop-area')!.append(thumbnail);}
          else row.querySelector(target==='x'?'[data-testid="attachments"]':'#attachments')!.append(image);
        }
      }
    });
  }
  const nativeSetter=Object.getOwnPropertyDescriptor(window.HTMLElement.prototype,'innerText')!.set!;
  const prepareEditor=(editor:Element)=>Object.defineProperty(editor,'innerText',{get:()=>[...editor.childNodes].map(node=>node.nodeName==='BR'?'\n':node.textContent).join(''),set:(text:string)=>nativeSetter.call(editor,text)});
  function renderXBlocks(editor:Element,text:string) {
    const contents=doc.createElement('div');contents.setAttribute('data-contents','true');
    for(const line of text.split('\n')) {
      const block=doc.createElement('div');block.setAttribute('data-block','true');
      const inner=doc.createElement('div');inner.className='public-DraftStyleDefault-block';
      const span=doc.createElement('span');span.setAttribute('data-text','true');span.textContent=line;
      if(!line)span.append(doc.createElement('br'));inner.append(span);block.append(inner);contents.append(block);
    }
    editor.replaceChildren(contents);
  }
  function wireXEditor(editor:Element) {
    editor.addEventListener('paste',event=>{
      pastes++;
      event.preventDefault();if(options.xRejectPaste)return;
      const text=(event as any).clipboardData.getData('text/plain');
      // Actual X rerenders its editor; the old element becomes disconnected.
      const replacement=editor.cloneNode(false) as Element;
      renderXBlocks(replacement,options.xPartialPaste?text.split('\n')[0]:text);
      wireXEditor(replacement);editor.replaceWith(replacement);
    });
  }
  if(target==='x' && options.xNative)Object.defineProperty(doc,'execCommand',{value:(_command:string,_ui:boolean,text:string)=>{
    nativeCommands++;if(options.xNativeReject)return false;
    const editor=doc.activeElement as Element;const replacement=editor.cloneNode(false) as Element;
    renderXBlocks(replacement,text);wireXEditor(replacement);editor.replaceWith(replacement);return true;
  }});
  function addXRow() {
    const index=doc.querySelectorAll('#rows .row').length;
    const row=doc.createElement('section');row.className='row';
    row.innerHTML=`<div contenteditable="true" role="textbox" data-testid="tweetTextarea_${index}"></div><div data-testid="attachments"></div><input type="file" data-testid="fileInput" accept="image/*" multiple>`;
    const editor=row.querySelector('[contenteditable]') as Element;renderXBlocks(editor,'');wireXEditor(editor);
    doc.querySelector('#rows')!.append(row);wire(row.querySelector('input')!,row,index);
  }
  if(target==='x') {
    addXRow();
    const openEmptyComposer=()=>{
      const first=doc.querySelector('#rows [contenteditable]') as Element;
      captionsAtOpen.push(first.textContent||'');renderXBlocks(first,'');
      const modal=doc.createElement('div');modal.setAttribute('role','dialog');
      const composer=doc.querySelector('#inline')!;composer.replaceWith(modal);modal.append(composer);
    };
    doc.querySelector('#open')?.addEventListener('click',event=>{event.preventDefault();openEmptyComposer();});
    doc.querySelector('#add')!.addEventListener('click',event=>{
      event.preventDefault();
      if(options.xInline && !doc.querySelector('[role="dialog"]')) {openEmptyComposer();return;}
      addXRow();
    });
  }
  else {const input=doc.querySelector<Input>(target==='youtube'?'#photos':target==='facebook'?'#composer input':'form input[type=file]')!;wire(input,input.closest('form,section,ytd-backstage-post-dialog-renderer') as Element);}
  for(const editor of doc.querySelectorAll('[contenteditable]'))if(target!=='x'&&!Object.hasOwn(editor,'innerText'))prepareEditor(editor as Element);
  if(target==='youtube')doc.querySelector('#image')!.addEventListener('click',()=>{modes++;doc.querySelector<Input>('#photos')!.hidden=false;doc.querySelector('#contenteditable-root')!.setAttribute('aria-label','Write a message...');});
  if(target==='youtube' && options.createPost) {
    const composer=doc.querySelector('ytd-backstage-post-dialog-renderer')!;composer.remove();
    const create=doc.createElement('button');create.setAttribute('aria-label','Create');doc.body.append(create);
    create.addEventListener('click',()=>{const postAction=doc.createElement('a');postAction.textContent='Create post';doc.body.append(postAction);postAction.addEventListener('click',()=>{doc.body.append(composer);postAction.remove();});});
  }
  if(options.existingPhoto && target==='everytime') {const item=doc.createElement('li');item.className='thumbnail attached';item.style.backgroundImage='url("blob:existing")';doc.querySelector('ol')!.append(item);}
  const editor=doc.querySelector<Element>(target==='facebook'?'#composer [contenteditable]':target==='youtube'?'#contenteditable-root':target==='x'?'#rows [contenteditable]':'textarea')!;
  if(options.existing) {if(target==='everytime')(editor as any).value=options.existing;else editor.innerText=options.existing;}
  const xIntentPrepared=target==='x'&&!options.xContext&&options.xIntentPrepared!==false;
  if(xIntentPrepared&&!options.existing&&!options.xInline)renderXBlocks(editor,options.xMissingCaption?'':options.xPartialPaste?title:caption);
  if(options.existingPhoto&&target==='x') {const image=doc.createElement('img');image.src='blob:existing';doc.querySelector('[data-testid="attachments"]')!.append(image);}
  if(options.delayed && target==='facebook'){const old=editor.cloneNode(true);editor.replaceWith(doc.createElement('span'));setTimeout(()=>{doc.querySelector('#composer')!.append(old);prepareEditor(old as Element);},15);}
  const sent:any[]=[];
  const connect=()=>{connects++;return {postMessage:(message:any)=>sent.push(message),onMessage:{addListener:(fn:any)=>receive=fn},onDisconnect:{addListener:(fn:any)=>disconnect=fn}};};
  const context:Record<string,unknown>={document:doc,location:window.location,URL,AbortController,Intl,TextEncoder,
    setTimeout:(fn:any,ms:number)=>setTimeout(fn,Math.min(ms,5)),clearTimeout,HTMLInputElement:window.HTMLInputElement,DataTransfer:window.DataTransfer,File:window.File,Event:window.Event,chrome:{runtime:{connect,onMessage:{addListener:(fn:any)=>runtimeReceive=fn}}},MutationObserver:window.MutationObserver};
  for(const file of ['shared/constants.js','shared/x-thread.js','shared/validators.js','content/text-input.js'])runInNewContext(source(file),context);
  const api=context.KudaeSNS as any;api.StatusOverlay=class{update(){}complete(){}error(){}remove(){}};
  api.waitForMutation=async(test:any)=>{for(let i=0;i<35;i++){const value=test();if(value)return value;await new Promise(r=>setTimeout(r,5));}throw Error('timeout');};
  runInNewContext(source('content/site-upload.js'),context);
  if(options.preflightOnly) {
    const preflight=await new Promise<any>(resolve=>runtimeReceive({type:'KUDAE_X_PREFLIGHT',expectedCaption:options.preflightOnly==='prepared'?caption:null},null,resolve));
    return {window,doc,sent,modes,publishes,assigned,caption,readField:api.readTextField,captionsAtOpen,connects,nativeCommands,pastes,preflight};
  }
  if(options.disconnectBeforeJob){disconnect();runtimeReceive({type:'KUDAE_RECONNECT_TARGET'},null,()=>{});receive({type:'REQUEST_READY'});}
  receive({type:'JOB_START',jobId:'job-regression',target,total:count,contentMode:target==='everytime'?'separate':'caption',title,body:'첫 문단\n\n두 번째 문단\n글 | 기자',caption,postId:'post-1',xIntentPrepared});
  for(let i=0;i<count;i++)receive({type:'ASSET',jobId:'job-regression',index:i,file:new window.File([`original-${i}`],`card-${i}.png`,{type:'image/png'})});
  receive({type:'JOB_END',jobId:'job-regression'});
  for(let i=0;i<300&&!sent.some(m=>['TARGET_COMPLETE','TARGET_ERROR'].includes(m.type));i++)await new Promise(r=>setTimeout(r,5));
  return {window,doc,sent,modes,publishes,assigned,caption,readField:api.readTextField,captionsAtOpen,connects,nativeCommands,pastes,preflight:undefined as any};
}

describe('실제 SNS 작성창 구조 회귀',()=>{
  it('X 빈 작성창 사전 확인은 글이나 파일을 변경하지 않는다',async()=>{
    const f=await fixture('x',{xIntentPrepared:false,preflightOnly:'blank'});
    expect(f.preflight).toMatchObject({ok:true,mode:'article'});expect(f.assigned).toHaveLength(0);expect(f.pastes+f.nativeCommands+f.publishes).toBe(0);await f.window.close();
  });
  it.each([{existing:'기존 작성 중인 글'},{existingPhoto:true}])('X 기존 글이나 사진이 있으면 새 글 링크 사전 확인을 거절한다 %j',async options=>{
    const f=await fixture('x',{...options,xIntentPrepared:false,preflightOnly:'blank'});
    expect(f.preflight).toMatchObject({ok:false,error:{code:'TEXT_NOT_EMPTY'}});expect(f.assigned).toHaveLength(0);expect(f.pastes+f.nativeCommands+f.publishes).toBe(0);await f.window.close();
  });
  it.each(['reply','quote'] as const)('빈 %s 작성창은 이미지 전용 모드로 확인한다',async xContext=>{
    const f=await fixture('x',{xContext,preflightOnly:'blank'});expect(f.preflight).toMatchObject({ok:true,mode:'media'});expect(f.pastes+f.nativeCommands+f.publishes).toBe(0);await f.window.close();
  });
  it('X가 제목·빈 줄·기사 URL을 채웠는지 읽기 전용으로 확인한다',async()=>{
    const f=await fixture('x',{preflightOnly:'prepared'});expect(f.preflight).toMatchObject({ok:true,mode:'article'});expect(f.readField(f.doc.querySelector('#rows [contenteditable]'))).toBe(f.caption);expect(f.pastes+f.nativeCommands).toBe(0);await f.window.close();
  });
  it('에타 배경 이미지 + 파일 선택칸 초기화도 원본 2개와 분리 본문 입력 완료로 인식한다',async()=>{
    const f=await fixture('everytime');expect(f.sent.find(m=>m.type==='TARGET_COMPLETE')).toMatchObject({count:2,contentInserted:true});
    expect(f.doc.querySelector('textarea')!.value).toContain('글 | 기자');expect(f.doc.querySelectorAll('.thumbnail.attached')).toHaveLength(2);expect(f.publishes).toBe(0);await f.window.close();
  });
  it('에타 실제 첨부 실패는 완료로 바꾸지 않고 이미 입력된 글임을 정확히 안내한다',async()=>{
    const f=await fixture('everytime',{ack:false});expect(f.sent.some(m=>m.type==='TARGET_COMPLETE')).toBe(false);
    expect(f.sent.find(m=>m.type==='TARGET_ERROR')?.error.detail).toContain('글은 입력되어');await f.window.close();
  });
  it('YouTube 이미지 모드로 먼저 바꾸고 검색/이미지 설문 입력칸을 피한다',async()=>{
    const f=await fixture('youtube');expect(f.modes).toBe(1);expect(f.doc.querySelector<Input>('#lens')!.files!.length).toBe(0);expect(f.doc.querySelector<Input>('#poll')!.files!.length).toBe(0);
    expect(f.sent.find(m=>m.type==='TARGET_COMPLETE'),JSON.stringify(f.sent)).toMatchObject({count:2,contentInserted:true});expect((f.doc.querySelector('#contenteditable-root') as Element).innerText).toBe(f.caption);expect(f.publishes).toBe(0);await f.window.close();
  });
  it('YouTube 이미지가 안 들어가면 본문이나 다음 글 완료를 보내지 않는다',async()=>{
    const f=await fixture('youtube',{ack:false});expect(f.sent.some(m=>m.type==='TARGET_COMPLETE')).toBe(false);expect(f.doc.querySelector('#contenteditable-root')!.textContent).toBe('');await f.window.close();
  });
  it('YouTube 작성창이 없으면 만들기 메뉴의 게시물 만들기를 열어 이미지 게시물로 진행한다',async()=>{
    const f=await fixture('youtube',{createPost:true});expect(f.sent.find(m=>m.type==='TARGET_COMPLETE'),JSON.stringify(f.sent)).toMatchObject({count:2,contentInserted:true});expect(f.modes).toBe(1);expect(f.publishes).toBe(0);await f.window.close();
  });
  it('에타에 사진이 이미 있으면 중복 첨부하지 않고 기존 사진과 글을 보존한다',async()=>{
    const f=await fixture('everytime',{existingPhoto:true});expect(f.assigned).toHaveLength(0);expect(f.doc.querySelectorAll('.attached')).toHaveLength(1);expect(f.sent.find(m=>m.type==='TARGET_ERROR')?.error.code).toBe('FILES_NOT_EMPTY');await f.window.close();
  });
  it.each([false,true])('Facebook role=dialog가 없는 전체 화면 작성창과 지연 렌더링을 처리한다 delayed=%s',async delayed=>{
    const f=await fixture('facebook',{delayed});expect(f.sent.find(m=>m.type==='TARGET_COMPLETE'),JSON.stringify(f.sent)).toMatchObject({count:2,contentInserted:true});expect(f.doc.querySelector<Input>('#outside')!.files!.length).toBe(0);expect(f.publishes).toBe(0);await f.window.close();
  });
  it('X 원본 9개를 순서대로 4+4+1 스레드에 넣고 전부 확인된 뒤에만 완료한다',async()=>{
    const f=await fixture('x',{count:9});expect(f.assigned.map(a=>a.bytes),JSON.stringify(f.sent)).toEqual(Array.from({length:9},(_,i)=>`original-${i}`));expect(f.assigned.map(a=>a.row)).toEqual([1,1,1,1,2,2,2,2,3]);
    expect(f.sent.find(m=>m.type==='TARGET_COMPLETE')).toMatchObject({count:9,contentInserted:true,threadCount:4,xMode:'article'});
    const editors=[...f.doc.querySelectorAll('#rows [contenteditable]')] as Element[];
    expect(editors.map(f.readField)).toEqual([f.caption,'','','']);
    expect(f.doc.querySelectorAll('#rows .row')[0].querySelectorAll('[data-testid="attachments"] img')).toHaveLength(0);
    expect(f.publishes).toBe(0);await f.window.close();
  });
  it('X 두 번째 글에서 첨부 실패하면 일부 스레드를 성공 처리하거나 게시하지 않는다',async()=>{
    const f=await fixture('x',{count:9,failAt:2});expect(f.sent.some(m=>m.type==='TARGET_COMPLETE')).toBe(false);expect(f.sent.find(m=>m.type==='TARGET_ERROR')?.error.detail).toContain('4/9');expect(f.doc.querySelectorAll('#rows .row')).toHaveLength(3);expect(f.publishes).toBe(0);await f.window.close();
  });
  it('X가 채운 제목·링크를 재입력하지 않고 원본 4+2 댓글만 준비한다',async()=>{
    const f=await fixture('x',{count:6,xNative:true});
    expect(f.sent.find(m=>m.type==='TARGET_COMPLETE'),JSON.stringify(f.sent)).toMatchObject({count:6,contentInserted:true,threadCount:3,xMode:'article'});
    expect(f.assigned.map(a=>a.row)).toEqual([1,1,1,1,2,2]);
    expect(f.assigned.map(a=>a.bytes)).toEqual(Array.from({length:6},(_,i)=>`original-${i}`));
    expect([...f.doc.querySelectorAll('#rows [contenteditable]')].map(f.readField)).toEqual([f.caption,'','']);
    expect(f.pastes).toBe(0);expect(f.nativeCommands).toBe(0);
    expect(f.publishes).toBe(0);await f.window.close();
  });
  it('X 홈에 기존 글이 있으면 새 창을 열거나 기존 내용을 지우지 않는다',async()=>{
    const f=await fixture('x',{count:6,xInline:true,existing:'기존 작성 중인 글'});
    expect(f.captionsAtOpen).toEqual([]);expect(f.doc.querySelector('[role="dialog"]')).toBeNull();
    expect(f.assigned).toHaveLength(0);expect(f.readField(f.doc.querySelector('#rows [contenteditable]'))).toBe('기존 작성 중인 글');
    expect(f.sent.find(m=>m.type==='TARGET_ERROR')?.error.code).toBe('TEXT_NOT_EMPTY');await f.window.close();
  });
  it('유휴 상태 연결이 끊긴 X 탭은 재연결 후 원본을 한 번만 전달한다',async()=>{
    const f=await fixture('x',{count:6,disconnectBeforeJob:true});expect(f.connects).toBe(2);
    expect(f.sent.find(m=>m.type==='TARGET_COMPLETE')).toMatchObject({count:6,contentInserted:true});
    expect(f.assigned.map(a=>a.bytes)).toEqual(Array.from({length:6},(_,i)=>`original-${i}`));await f.window.close();
  });
  it('이미지 전송 중 연결이 끊기면 초안을 보존하고 자동 재첨부하지 않는다',async()=>{
    const f=await fixture('x',{count:6,disconnectAt:1});expect(f.connects).toBe(2);
    expect(f.sent.find(m=>m.type==='TARGET_ERROR')?.error.code).toBe('CONNECTION_LOST');
    expect(f.sent.some(m=>m.type==='TARGET_COMPLETE')).toBe(false);expect(f.assigned).toHaveLength(4);
    expect(f.readField(f.doc.querySelector('#rows [contenteditable]'))).toBe(f.caption);expect(f.publishes).toBe(0);await f.window.close();
  });
  it('X의 제목·링크가 준비되어 있으면 네이티브 입력 명령도 전혀 실행하지 않는다',async()=>{
    const f=await fixture('x',{count:6,xNative:true,xNativeReject:true});expect(f.nativeCommands).toBe(0);expect(f.pastes).toBe(0);
    expect(f.sent.find(m=>m.type==='TARGET_COMPLETE'),JSON.stringify(f.sent)).toMatchObject({count:6,contentInserted:true});
    expect([...f.doc.querySelectorAll('#rows [contenteditable]')].map(f.readField)).toEqual([f.caption,'','']);await f.window.close();
  });
  it('X 작성 링크 준비 표식이 없으면 자동 텍스트 입력이나 첨부를 시도하지 않는다',async()=>{
    const f=await fixture('x',{count:6,xNative:true,xIntentPrepared:false});expect(f.nativeCommands).toBe(0);expect(f.pastes).toBe(0);
    expect(f.assigned).toHaveLength(0);expect(f.sent.some(m=>m.type==='TARGET_COMPLETE')).toBe(false);
    expect(f.sent.find(m=>m.type==='TARGET_ERROR')?.error.code).toBe('X_COMPOSE_LINK_REQUIRED');await f.window.close();
  });
  it('X 기존 글은 사진과 글 모두 보존한다',async()=>{
    const f=await fixture('x',{count:5,existing:'다른 글'});expect(f.assigned).toHaveLength(0);expect(f.sent.find(m=>m.type==='TARGET_ERROR')?.error.code).toBe('TEXT_NOT_EMPTY');await f.window.close();
  });
  it.each(['reply','quote'] as const)('X 열린 %s 작성창에는 제목이나 본문을 반복하지 않고 원본만 넣는다',async xContext=>{
    const f=await fixture('x',{count:2,xContext});expect(f.assigned.map(a=>a.row)).toEqual([0,0]);
    expect(f.sent.find(m=>m.type==='TARGET_COMPLETE')).toMatchObject({count:2,contentInserted:true,threadCount:1,xMode:'media'});
    expect(f.readField(f.doc.querySelector('#rows [contenteditable]'))).toBe('');expect(f.publishes).toBe(0);await f.window.close();
  });
  it('X 기존 답글창의 4장 초과 요청은 일부 첨부도 하지 않고 새 글 흐름을 안내한다',async()=>{
    const f=await fixture('x',{count:5,xContext:'reply'});expect(f.assigned).toHaveLength(0);expect(f.sent.find(m=>m.type==='TARGET_ERROR')?.error.code).toBe('REPLY_LIMIT');await f.window.close();
  });
  it.each([{xMissingCaption:true},{xPartialPaste:true}])('X 작성 링크의 글이 없거나 제목만 남으면 이미지 첨부를 시작하지 않는다 %j',async options=>{
    const f=await fixture('x',{count:8,...options});expect(f.assigned).toHaveLength(0);
    expect(f.sent.some(m=>m.type==='TARGET_COMPLETE')).toBe(false);
    expect(f.sent.find(m=>m.type==='TARGET_ERROR')?.error.code).toBe('TEXT_NOT_EMPTY');
    expect(f.publishes).toBe(0);await f.window.close();
  });
});

describe('X 제목·링크 첫 글과 원본 이미지 댓글',()=>{
  it('첫 글에는 제목·URL만, 나머지 댓글에는 모든 원본만 순서대로 넣는다',()=>{
    const text='[보도] 제목 👨‍👩‍👧‍👦\n\nhttps://www.kunews.ac.kr/news/articleView.html?idxno=123456';
    const plan=buildXThread(text,9);expect(twitterText.parseTweet(plan[0].caption).valid).toBe(true);
    expect(plan[0]).toEqual({caption:text,assetOrders:[]});expect(plan.slice(1).every(p=>p.caption==='')).toBe(true);
    expect(plan.flatMap(p=>p.assetOrders)).toEqual([0,1,2,3,4,5,6,7,8]);expect(plan.every(p=>p.assetOrders.length<=4)).toBe(true);
    expect(plan.some(p=>p.caption.includes('https://www.kunews.ac.kr/news/articleView.html?idxno=123456'))).toBe(true);
  });
  it('너무 긴 제목은 여러 본문 글로 쪼개지 않으며 댓글에 순번을 추가하지 않는다',()=>{
    expect(()=>buildXThread('가'.repeat(5000),1)).toThrow('제목');expect(()=>buildXThread('제목',81)).toThrow('80개');
    const plan=buildXThread('제목',9);expect(plan).toHaveLength(4);expect(plan[1].caption).toBe('');
    expect(buildXThread('제목',1)).toEqual([{caption:'제목',assetOrders:[]},{caption:'',assetOrders:[0]}]);
  });
});
