import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window, type HTMLElement as HappyElement } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';

function setup(html:string) {
  const window=new Window({url:'https://www.koreapas.com/bbs/write.php'});
  window.document.body.innerHTML=html;
  Object.defineProperty(window.HTMLElement.prototype,'getClientRects',{configurable:true,value:()=>[{width:100,height:40}]});
  const context:Record<string,unknown>={document:window.document,setTimeout,clearTimeout,URL};
  for(const file of ['shared/constants.js','shared/validators.js','content/text-input.js']) runInNewContext(readFileSync(new URL(`../../extension/${file}`,import.meta.url),'utf8'),context);
  const api=context.KudaeSNS as {fillText:(target:string,content:object,signal:AbortSignal,progress:()=>void)=>Promise<boolean>;findTextFields:(target:string,mode:string)=>{title:any;body:any}|null;writeTextField:(el:any,text:string,signal:AbortSignal)=>Promise<void>;readTextField:(el:HappyElement)=>string};
  const signal=new AbortController().signal;
  return {window,api,signal};
}
const content={contentMode:'separate',title:'[고대신문 보도] 제목',body:'첫 문단\n\n기사 링크\n크레딧',caption:'[보도] 제목\n\n첫 문단'};
function renderedText(window:Window, editor:HappyElement) {
  const setter=Object.getOwnPropertyDescriptor(window.HTMLElement.prototype,'innerText')!.set!;
  Object.defineProperty(editor,'innerText',{get:()=>[...editor.childNodes].map(node=>node.nodeName==='BR'?'\n':node.textContent).join(''),set:(text:string)=>setter.call(editor,text)});
}
describe('SNS 표준 DOM 제목·본문 입력',()=>{
  it('X DraftJS 줄 블록은 렌더링 여백 대신 실제 제목·빈 줄·링크로 읽는다',()=>{
    const {window,api}=setup('<div contenteditable="true" data-testid="tweetTextarea_0"><div data-contents="true"><div data-block="true"><div><span>[보도] 제목</span></div></div><div data-block="true"><div><br data-text="true"></div></div><div data-block="true"><div><span>https://www.kunews.ac.kr/</span></div></div></div></div>');
    const editor=window.document.querySelector<HappyElement>('[contenteditable]')!;
    Object.defineProperty(editor,'innerText',{get:()=>'[보도] 제목\n\n\nhttps://www.kunews.ac.kr/'});
    expect(api.readTextField(editor)).toBe('[보도] 제목\n\nhttps://www.kunews.ac.kr/');
  });
  it('네이티브 편집 명령이 없는 X 환경에서는 한 번의 paste 후 교체된 편집기를 재확인한다',async()=>{
    const {window,api,signal}=setup('<div role="dialog"><div contenteditable="true" data-testid="tweetTextarea_0"><div data-contents="true"><div data-block="true"><br></div></div></div></div>');
    const editor=window.document.querySelector<HappyElement>('[contenteditable]')!;
    const text='[보도] 제목\n\nhttps://www.kunews.ac.kr/';let pastes=0;
    (window.document as any).execCommand=undefined;
    editor.addEventListener('paste',event=>{
      pastes++;event.preventDefault();const incoming=(event as any).clipboardData.getData('text/plain');
      const replacement=editor.cloneNode(false) as HappyElement;const contents=window.document.createElement('div');contents.setAttribute('data-contents','true');
      for(const line of incoming.split('\n')){const block=window.document.createElement('div');block.setAttribute('data-block','true');block.textContent=line;if(!line)block.append(window.document.createElement('br'));contents.append(block);}
      replacement.append(contents);editor.replaceWith(replacement);
    });
    await api.writeTextField(editor,text,signal);
    expect(pastes).toBe(1);expect(editor.isConnected).toBe(false);
    expect(api.readTextField(window.document.querySelector<HappyElement>('[contenteditable]')!)).toBe(text);
  });
  it('고파스 subject/content 입력칸에 네이티브 값과 이벤트를 전달한다',async()=>{
    const {window,api,signal}=setup('<form><input name="subject"><textarea name="content"></textarea><input type="file" multiple></form>');
    const title=window.document.querySelector('input')!; const body=window.document.querySelector('textarea')!;
    const changed=vi.fn();body.addEventListener('input',changed);
    expect(await api.fillText('koreapas',content,signal,()=>{})).toBe(true);
    expect(title.value).toBe(content.title);expect(body.value).toBe(content.body);expect(changed).toHaveBeenCalledOnce();
  });
  it('에타 제목과 본문을 분리한다',async()=>{
    const {window,api,signal}=setup('<form><input name="title" placeholder="제목"><textarea name="text" placeholder="내용"></textarea></form>');
    await api.fillText('everytime',content,signal,()=>{});
    expect(window.document.querySelector('input')!.value).toBe(content.title);
    expect(window.document.querySelector('textarea')!.value).toBe(content.body);
  });
  it('Facebook 댓글칸이 아니라 작성 대화상자의 본문을 찾는다',()=>{
    const {window,api}=setup('<textarea aria-label="Write a comment"></textarea><div role="dialog"><div contenteditable="true" role="textbox" aria-label="What is on your mind?"></div></div>');
    expect(api.findTextFields('facebook','caption')?.body).toBe(window.document.querySelector('[role="textbox"]'));
  });
  it('작성창이 없을 때 검색·댓글·임의 텍스트를 대신 채우지 않는다',()=>{
    const {api}=setup('<input placeholder="검색"><textarea aria-label="Write a comment"></textarea><textarea></textarea>');
    expect(api.findTextFields('facebook','caption')).toBeNull();
  });
  it('기존 글을 덮어쓰지 않고 제목도 먼저 변경하지 않는다',async()=>{
    const {window,api,signal}=setup('<form><input name="subject"><textarea name="content">이미 작성한 글</textarea></form>');
    await expect(api.fillText('koreapas',content,signal,()=>{})).rejects.toMatchObject({code:'TEXT_NOT_EMPTY'});
    expect(window.document.querySelector('input')!.value).toBe('');
    expect(window.document.querySelector('textarea')!.value).toBe('이미 작성한 글');
  });
  it('같은 글 재확인은 중복 삽입하지 않는다',async()=>{
    const {window,api,signal}=setup('<form><input name="subject"><textarea name="content"></textarea></form>');
    await api.fillText('koreapas',content,signal,()=>{});await api.fillText('koreapas',content,signal,()=>{});
    expect(window.document.querySelector('textarea')!.value).toBe(content.body);
  });
  it('네이티브 글자 수 제한을 넘으면 자르지 않고 거절한다',async()=>{
    const {api,signal}=setup('<form><input name="subject"><textarea name="content" maxlength="2"></textarea></form>');
    await expect(api.fillText('koreapas',content,signal,()=>{})).rejects.toMatchObject({code:'TEXT_TOO_LONG'});
  });
  it('취소한 작업은 입력하지 않는다',async()=>{
    const {window,api}=setup('<form><input name="subject"><textarea name="content"></textarea></form>');
    const controller=new AbortController();controller.abort();
    await expect(api.fillText('koreapas',content,controller.signal,()=>{})).rejects.toMatchObject({code:'USER_CANCELLED'});
    expect(window.document.querySelector('input')!.value).toBe('');
  });
  it('YouTube Studio 제목과 설명 편집기를 구분한다',()=>{
    const {window,api}=setup('<div role="dialog"><div id="title-textarea"><div id="textbox" contenteditable="true"></div></div><div id="description-textarea"><div id="textbox" contenteditable="true"></div></div></div>');
    const fields=api.findTextFields('youtube','separate');
    expect(fields?.title).toBe(window.document.querySelector('#title-textarea #textbox'));
    expect(fields?.body).toBe(window.document.querySelector('#description-textarea #textbox'));
  });
  it('contenteditable에도 제목과 두 줄 띄운 본문을 일반 텍스트로 넣는다',async()=>{
    const {window,api,signal}=setup('<div role="dialog"><div contenteditable="true" role="textbox" aria-label="What is on your mind?"></div></div>');
    const editor=window.document.querySelector<HappyElement>('[role="textbox"]')!;
    // Happy DOM omits BRs from its innerText getter. Model the browser's rendered line breaks.
    const nativeSetter=Object.getOwnPropertyDescriptor(window.HTMLElement.prototype,'innerText')!.set!;
    Object.defineProperty(editor,'innerText',{get:()=>[...editor.childNodes].map(node=>node.nodeName==='BR'?'\n':node.textContent).join(''),set:(text:string)=>nativeSetter.call(editor,text)});
    await api.fillText('facebook',{...content,contentMode:'caption'},signal,()=>{});
    expect(editor.innerText).toBe(content.caption);
    expect(editor.querySelector('script')).toBeNull();
  });
  it('프레임워크가 입력을 지우면 성공으로 보고하지 않는다',async()=>{
    const {window,api,signal}=setup('<form><input name="subject"><textarea name="content"></textarea></form>');
    const body=window.document.querySelector('textarea')!;
    body.addEventListener('input',()=>{body.value='';});
    await expect(api.fillText('koreapas',content,signal,()=>{})).rejects.toMatchObject({code:'TEXT_INSERT_FAILED'});
  });
  it('브라우저가 이미 보낸 input을 본문 전체 data로 다시 보내지 않는다',async()=>{
    const {window,api,signal}=setup('<div role="dialog"><div contenteditable="true" role="textbox"></div></div>');
    const editor=window.document.querySelector<HappyElement>('[role="textbox"]')!;renderedText(window,editor);
    let inputs=0;
    editor.addEventListener('input',(event)=>{inputs++;if(inputs>1)editor.innerText+=String((event as any).data||'');});
    (window.document as any).execCommand=(_command:string,_show:boolean,text:string)=>{editor.innerText=text;editor.dispatchEvent(new window.InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));return true;};
    await api.writeTextField(editor,content.caption,signal);
    expect(inputs).toBe(1);expect(editor.innerText).toBe(content.caption);
  });
  it('Lexical 편집기에는 줄바꿈을 보존하는 plain-text paste 한 번만 보낸다',async()=>{
    const {window,api,signal}=setup('<div role="dialog"><div contenteditable="true" data-lexical-editor="true" role="textbox"></div></div>');
    const editor=window.document.querySelector<HappyElement>('[role="textbox"]')!;renderedText(window,editor);
    const native=vi.fn(()=>true);(window.document as any).execCommand=native;
    let pastes=0;let inputs=0;
    editor.addEventListener('paste',(event)=>{event.preventDefault();pastes++;editor.innerText=(event as any).clipboardData.getData('text/plain');});
    editor.addEventListener('input',()=>inputs++);
    await api.writeTextField(editor,content.caption,signal);await api.writeTextField(editor,content.caption,signal);
    expect(pastes).toBe(1);expect(inputs).toBe(0);expect(native).not.toHaveBeenCalled();expect(editor.innerText).toBe(content.caption);
  });
  it('Lexical 줄바꿈용 HTML에는 이스케이프한 원고 텍스트와 BR만 전달한다',async()=>{
    const {window,api,signal}=setup('<div role="dialog"><div contenteditable="true" data-lexical-editor="true" role="textbox"></div></div>');
    const editor=window.document.querySelector<HappyElement>('[role="textbox"]')!;
    const text='제목 <script>alert("bad")</script>\n\n본문 & 링크\n크레딧';
    let html='';
    editor.addEventListener('paste',(event)=>{
      event.preventDefault();html=(event as any).clipboardData.getData('text/html');editor.innerHTML=html;
    });
    await api.writeTextField(editor,text,signal);
    expect(api.readTextField(editor)).toBe(text);expect(editor.querySelector('script')).toBeNull();
    expect(html).toContain('&lt;script&gt;');expect(html).toContain('&amp;');
    expect([...editor.querySelectorAll('*')].map(node=>node.tagName)).toEqual(['P','BR','BR','BR']);
  });
  it('Lexical이 줄마다 P 요소를 만들더라도 레이아웃 줄간격 대신 실제 줄바꿈으로 재확인한다',async()=>{
    const {window,api,signal}=setup('<div role="dialog"><div contenteditable="true" data-lexical-editor="true" role="textbox"></div></div>');
    const editor=window.document.querySelector<HappyElement>('[role="textbox"]')!;
    editor.addEventListener('paste',(event)=>{
      event.preventDefault();const text=(event as any).clipboardData.getData('text/plain');
      for(const line of text.split('\n')){const p=window.document.createElement('p');p.textContent=line;if(!line)p.append(window.document.createElement('br'));editor.append(p);}
    });
    await api.writeTextField(editor,content.caption,signal);await api.writeTextField(editor,content.caption,signal);
    expect(api.readTextField(editor)).toBe(content.caption);
    expect(editor.querySelectorAll('p').length).toBe(content.caption.split('\n').length);
  });
  it('붙여넣기를 받지 않는 Lexical 편집기의 DOM을 직접 덮어쓰지 않는다',async()=>{
    const {window,api,signal}=setup('<div role="dialog"><div contenteditable="true" data-lexical-editor="true" role="textbox"></div></div>');
    const editor=window.document.querySelector<HappyElement>('[role="textbox"]')!;
    const native=vi.fn(()=>false);(window.document as any).execCommand=native;
    await expect(api.writeTextField(editor,content.caption,signal)).rejects.toMatchObject({code:'TEXT_INSERT_FAILED'});
    expect(editor.textContent).toBe('');expect(native).not.toHaveBeenCalled();
  });
  it('input이 없는 네이티브 편집 명령에는 text data 없는 변경 알림만 보낸다',async()=>{
    const {window,api,signal}=setup('<div role="dialog"><div contenteditable="true" role="textbox"></div></div>');
    const editor=window.document.querySelector<HappyElement>('[role="textbox"]')!;renderedText(window,editor);
    const data:unknown[]=[];editor.addEventListener('input',event=>data.push((event as any).data));
    (window.document as any).execCommand=(_command:string,_show:boolean,text:string)=>{editor.innerText=text;return true;};
    await api.writeTextField(editor,content.caption,signal);
    expect(data).toEqual([undefined]);expect(editor.innerText).toBe(content.caption);
  });
});
