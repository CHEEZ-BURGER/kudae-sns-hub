(() => {
  const api = globalThis.KudaeSNS;
  const SITE_RULES = {
    facebook: { hosts: ['facebook.com', 'web.facebook.com'], button: /사진\s*(?:또는|\/)?\s*동영상|photo\s*(?:or|\/)?\s*video|add photos|사진 추가/i, kind: 'image' },
    koreapas: { hosts: ['koreapas.com'], button: /사진|이미지|첨부|파일 선택|파일 첨부|업로드/i, kind: 'image' },
    everytime: { hosts: ['everytime.kr'], button: /사진|이미지|첨부|파일 선택|파일 첨부|업로드/i, kind: 'image' },
    x: { hosts: ['x.com', 'twitter.com'], button: /미디어|사진이나 동영상 추가|add photos or video|media/i, kind: 'image' },
    youtube: { hosts: ['youtube.com', 'studio.youtube.com'], button: /이미지|사진|image|create post|게시물 만들기|파일 선택|select files|동영상 업로드|upload videos/i, kind: 'image' },
  };

  const hostname = location.hostname.replace(/^www\./, '');
  const target = Object.entries(SITE_RULES).find(([, rule]) => rule.hosts.includes(hostname))?.[0] || null;
  if (!target) return;
  const rule = SITE_RULES[target];
  let port; let overlay; let controller; let currentJobId = ''; let files = []; let total = 0; let finished = false; let running = false; let content = null; let interruptedJobId = '';

  const labelOf = (element) => [element.getAttribute('aria-label'), element.getAttribute('title'), element.textContent]
    .filter(Boolean).join(' ').trim().replace(/\s+/g, ' ');
  const visible = element => element && !element.hidden && element.getClientRects().length && element.ownerDocument.defaultView.getComputedStyle(element).display !== 'none' && element.ownerDocument.defaultView.getComputedStyle(element).visibility !== 'hidden';

  function composerRoot() {
    if(target==='youtube' && content?.contentMode!=='separate') return [...document.querySelectorAll('ytd-backstage-post-dialog-renderer')].filter(visible).at(-1) || null;
    const fields=api.findTextFields(target,content?.contentMode || 'caption');
    const editor=fields?.body;
    if(!editor) return null;
    const dialog=editor.closest('[role="dialog"]');
    if(dialog) return dialog;
    const form=fields.title?.closest('form') || editor.closest('form');
    if(form) return form;
    // Facebook's full-page composer need not have a role=dialog wrapper.
    for(let parent=editor.parentElement;parent && parent!==document.body;parent=parent.parentElement) {
      if(parent.querySelector('input[type="file"]') && parent.querySelectorAll('[contenteditable="true"],textarea').length===1) return parent;
    }
    return null;
  }

  function findUploadInput() {
    const expected = target === 'youtube' && files[0]?.type?.startsWith('video/') ? 'video' : rule.kind;
    const fields = content?.contentMode || target === 'facebook' ? api.findTextFields(target,content?.contentMode || 'caption') : null;
    const form = fields?.title?.closest('form') || fields?.body?.closest('form');
    const scoped = ['facebook','x'].includes(target) || (target==='youtube' && content?.contentMode!=='separate');
    const composer = scoped ? composerRoot() : null;
    if (scoped && !composer) return null;
    const candidates = [...document.querySelectorAll('input[type="file"]')].filter((input) => {
      const accept=(input.getAttribute('accept')||'').toLowerCase();
      const compatible = !accept || accept.includes('*/*') || accept.includes(expected) ||
        (expected==='image' ? /\.(png|jpe?g|webp|gif)/.test(accept) : /\.(mp4|webm|mov|m4v)/.test(accept));
      const youtubeImage = target!=='youtube' || expected!=='image' || (input.multiple && input.closest('ytd-backstage-multi-image-select-renderer') && visible(input));
      return compatible && youtubeImage && !input.disabled && (!composer || composer.contains(input)) && (!form || !['koreapas','everytime'].includes(target) || form.contains(input));
    });
    return candidates.map((input, index) => {
      const accept = (input.getAttribute('accept') || '').toLowerCase();
      let score = index;
      if (!accept || accept.includes(expected) || accept.includes(expected === 'image' ? '.jpg' : '.mp4')) score += 60;
      if (input.multiple) score += expected === 'image' ? 25 : 0;
      if (input.closest('[role="dialog"],form')) score += 25;
      if (input.offsetParent !== null) score += 8;
      return { input, score };
    }).sort((left, right) => right.score - left.score)[0]?.input || null;
  }

  async function prepareComposer() {
    if(target==='x' && content?.contentMode) {
      const editor=api.findTextFields('x','caption')?.body;
      if(editor && !editor.closest('[role="dialog"]')) {
        const root=composerRoot();
        if(api.readTextField(editor) || root && previewSources(root).size) throw api.extensionError('TEXT_NOT_EMPTY','X 홈 작성칸에 이미 글이나 사진이 있습니다. 새 빈 작성창을 열어 주세요.','기존 초안을 새 창으로 옮기거나 지우지 않습니다.');
        // Home's Add post link opens a NEW empty modal, discarding the inline
        // caption. Open the normal empty composer BEFORE any editing instead.
        const open=[...document.querySelectorAll('a[data-testid="SideNav_NewTweet_Button"][href="/compose/post"]')].find(visible);
        if(!open) throw api.extensionError('TEXT_INPUT_NOT_FOUND','X의 새 글 작성창을 먼저 열어 주세요.');
        open.click();
        try { await api.waitForMutation(()=>composerRoot()?.closest('[role="dialog"]'),12_000,controller.signal); }
        catch { throw api.extensionError('TEXT_INPUT_NOT_FOUND','X의 새 글 작성창이 열리지 않았습니다.'); }
      }
    }
    if(target==='youtube' && content?.contentMode!=='separate' && !composerRoot()) {
      const create=[...document.querySelectorAll('button,[role="button"]')].find(el=>visible(el) && /^(create|만들기)$/i.test(el.getAttribute('aria-label') || el.textContent.trim()));
      if(create) {
        create.click();
        const findPostAction=()=>[...document.querySelectorAll('a,button,[role="menuitem"]')].find(el=>visible(el) && /^(create post|게시물 만들기)$/i.test(el.getAttribute('aria-label') || el.textContent.trim()));
        try { const postAction=await api.waitForMutation(findPostAction,5_000,controller.signal);postAction.click(); }
        catch { throw api.extensionError('TEXT_INPUT_NOT_FOUND','YouTube 게시물 만들기를 찾지 못했습니다.','채널의 게시물 탭에서 새 게시물 작성창을 열고 다시 시도해 주세요.'); }
      }
    }
    // SPA navigation can briefly expose the dialog before its editor appears.
    if(['facebook','x','youtube'].includes(target) && content?.contentMode!=='separate') {
      try { await api.waitForMutation(composerRoot,12_000,controller.signal); }
      catch { throw api.extensionError('TEXT_INPUT_NOT_FOUND', `${api.TARGET_LABELS[target]}의 게시물 작성창을 먼저 열어 주세요.`, target==='youtube'?'YouTube 채널의 게시물 탭에서 게시물 만들기를 열어 주세요.':'사진 편집 화면이라면 편집을 마치고 게시물 작성창으로 돌아와 주세요.'); }
    }
    if (findUploadInput()) return;
    const root = composerRoot() || document;
    const buttonPattern = target==='youtube' && content?.contentMode!=='separate' ? /add an image|이미지 추가|사진 추가|^이미지$/i : rule.button;
    const action = [...root.querySelectorAll('button,[role="button"],label,a')].find((element) => visible(element) && buttonPattern.test(labelOf(element)));
    action?.click();
    if (action) await new Promise((resolve) => setTimeout(resolve, 500));
  }

  async function waitForUploadInput() {
    const existing = findUploadInput();
    if (existing) return existing;
    progress(api.STATES.WAITING_FOR_FILE_INPUT, `${api.TARGET_LABELS[target]}에서 사진·파일 선택 창을 열어주세요.`);
    try { return await api.waitForMutation(findUploadInput, api.JOB_TTL_MS - 10_000, controller.signal); }
    catch (error) {
      if (error?.name === 'AbortError') throw api.extensionError('USER_CANCELLED', '작업을 취소했습니다.');
      throw api.extensionError('FILE_INPUT_NOT_FOUND', `${api.TARGET_LABELS[target]}의 파일 선택 창을 찾지 못했습니다.`, '작성창의 사진/파일 첨부 버튼을 누른 뒤 다시 시도해 주세요.');
    }
  }

  async function injectFiles(input) {
    if (files.length > 1 && !input.multiple) throw api.extensionError('MULTIPLE_NOT_SUPPORTED', `${api.TARGET_LABELS[target]}의 현재 입력칸은 여러 파일을 받지 않습니다.`, '패널의 이미지 순차 복사를 사용해 주세요.');
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    try {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
      if (descriptor?.set) descriptor.set.call(input, transfer.files); else input.files = transfer.files;
    } catch (error) { throw api.extensionError('FILE_ASSIGN_FAILED', `${api.TARGET_LABELS[target]}에 파일을 넣지 못했습니다.`, String(error)); }
    if (input.files?.length !== files.length) throw api.extensionError('FILE_ASSIGN_FAILED', '전달된 파일 수가 맞지 않습니다.', `Expected ${files.length}, received ${input.files?.length || 0}`);
    // React may reset the picker after consuming its files. Check assignment
    // before notifying the site, then verify its attachment previews separately.
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  function previewSources(root) {
    const sources = new Set();
    const selector=target==='youtube' && content?.contentMode!=='separate' ? 'ytd-backstage-multi-image-thumbnail-renderer img' : target==='x' ? '[data-testid="attachments"] img,[data-testid="attachments"] video' : 'img,video';
    for (const media of root.querySelectorAll(selector)) {
      if (/프로필|profile|avatar/i.test(media.getAttribute('alt') || '')) continue;
      const view = media.ownerDocument.defaultView;
      const rects = media.getClientRects();
      if (!rects.length || view.getComputedStyle(media).visibility === 'hidden' || view.getComputedStyle(media).display === 'none') continue;
      // Facebook adds PNG action icons along with the attachment controls.
      // Those must never be counted as uploaded photos. Tiny originals still
      // qualify when Facebook labels the attachment with its actual filename.
      const namedAttachment = files.some((file) => file?.name === media.getAttribute('alt'));
      if (!namedAttachment && Math.max(media.naturalWidth || 0, media.naturalHeight || 0, rects[0].width, rects[0].height) <= 64) continue;
      const source = media.currentSrc || media.getAttribute('src') || media.getAttribute('poster');
      if (source && !/^data:image\/svg\+xml/i.test(source)) sources.add(source);
    }
    // Everytime renders selected images as background-image, not <img>.
    if(target==='everytime') for(const item of root.querySelectorAll('ol.thumbnails li.thumbnail.attached')) {
      const source=item.style.backgroundImage || item.ownerDocument.defaultView.getComputedStyle(item).backgroundImage;
      if(visible(item) && source && source!=='none') sources.add(source);
    }
    return sources;
  }

  function mediaReceipt(input) {
    const root = composerRoot() || input.closest('[role="dialog"],form') || document.body;
    return { root, sources: previewSources(root), before: root.childElementCount };
  }

  async function verifyInjection(input, receipt) {
    const signal = controller.signal;
    if (['facebook','everytime','youtube','x'].includes(target) && !(target==='youtube' && content?.contentMode==='separate')) {
      // A populated FileList is not Facebook acknowledgement. Require distinct
      // attachment previews instead, excluding old images and duplicate mirrors.
      const accepted = () => {
        const root = target==='x' ? receipt.root : composerRoot() || receipt.root;
        const fresh = [...previewSources(root)].filter((source) => !receipt.sources.has(source));
        const busy=[...root.querySelectorAll('[role="progressbar"]')].some(el=>visible(el) && /preparing media|upload|미디어|업로드/i.test(labelOf(el)));
        return fresh.length >= files.length && !busy;
      };
      if (accepted()) return true;
      try { return Boolean(await api.waitForMutation(accepted, 30_000, signal)); }
      catch (error) {
        if (error?.name === 'AbortError' || signal.aborted) throw api.extensionError('USER_CANCELLED', '작업을 취소했습니다.');
        return false;
      }
    }
    if (input.files?.length !== files.length) return false;
    const { root, before } = receipt;
    return new Promise((resolve) => {
      let reacted = false;
      const observer = new MutationObserver(() => {
        if (!input.isConnected || root.childElementCount !== before) { reacted = true; cleanup(); resolve(true); }
      });
      const timeout = setTimeout(() => { cleanup(); resolve(reacted || input.files?.length === files.length); }, 10_000);
      const onAbort = () => { cleanup(); resolve(false); };
      const cleanup = () => { clearTimeout(timeout); observer.disconnect(); signal.removeEventListener('abort', onAbort); };
      observer.observe(root, { childList: true, subtree: true, attributes: true });
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  function clearMemory() { files.length = 0; files = []; controller = null; running = false; }
  function progress(state, userMessage, extra = {}) {
    overlay?.update(userMessage, state.includes('WAITING') ? '창이 열리면 자동으로 계속합니다.' : '', extra.current || 0, extra.total || 0);
    port?.postMessage({ type: 'TARGET_PROGRESS', jobId: currentJobId, state, userMessage, extra });
  }
  function cancelOrClose() {
    if (finished) { overlay?.remove(); overlay = null; return; }
    finished = true; controller?.abort(); port?.postMessage({ type: 'TARGET_CANCEL', jobId: currentJobId }); clearMemory(); overlay?.remove(); overlay = null;
  }
  function xEditors() {
    const root=composerRoot();
    return root ? [...root.querySelectorAll('[contenteditable="true"][data-testid]')].filter(el=>visible(el) && /^tweetTextarea_\d+$/.test(el.getAttribute('data-testid'))) : [];
  }
  function xPostRoot(editor) {
    let root=editor;
    const dialog=composerRoot();
    for(let parent=editor.parentElement;parent && dialog?.contains(parent);parent=parent.parentElement) {
      if(parent.querySelectorAll('[contenteditable="true"][data-testid^="tweetTextarea_"]').length>1) break;
      root=parent;
      if(parent===dialog) break;
    }
    return root;
  }
  async function insertXThread(assertActive) {
    const originals=files.slice();
    const originalJobId=currentJobId;
    const root = composerRoot();
    // Only the current dialog's reply/quote context counts, never timeline posts.
    const hasContext = [...root.querySelectorAll('article[data-testid="tweet"],[data-testid="quoteTweet"]')].some(visible);
    const mode = hasContext ? 'media' : 'article';
    if (hasContext && originals.length > 4) throw api.extensionError('REPLY_LIMIT','열린 답글·인용창에는 원본 4개까지 넣습니다.','전체 이미지를 한 번에 준비하려면 새 글 작성창을 열어 주세요. 제목·링크 첫 글과 이미지 댓글들을 함께 준비합니다.');
    const plan=globalThis.KudaeXThread.buildXThread(content.caption,originals.length,mode);
    const editors=xEditors();
    const prefilled=mode==='article' && content.xIntentPrepared===true;
    if(mode==='article' && !prefilled) throw api.extensionError('X_COMPOSE_LINK_REQUIRED','X 제목·링크 작성창을 새로 준비해야 합니다. 확장과 X 탭을 새로고침한 뒤 다시 시도해 주세요.');
    if(editors.length!==1 || (prefilled?api.readTextField(editors[0])!==plan[0].caption.trim():Boolean(api.readTextField(editors[0]))) || previewSources(composerRoot()).size) {
      throw api.extensionError('TEXT_NOT_EMPTY','X 작성창에 이미 글이나 사진이 있습니다. 새 빈 작성창을 열어 주세요.','작성 중인 스레드를 덮어쓰거나 이어 붙이지 않습니다.');
    }
    let confirmed=0;
    try {
      for(let index=0;index<plan.length;index++) {
        assertActive();
        const part=plan[index]; const editor=xEditors()[index];
        if(!editor || (index===0 && prefilled?api.readTextField(editor)!==part.caption.trim():Boolean(api.readTextField(editor)))) throw api.extensionError('THREAD_EDITOR_NOT_FOUND',`${index+1}번째 X 글 작성칸을 확인하지 못했습니다.`);
        progress(api.STATES.INJECTING, part.caption ? 'X 첫 글 · 제목과 기사 링크 입력 중' : `X 이미지 댓글 ${index + (mode==='article'?0:1)}/${Math.ceil(originals.length/4)} 준비 중`);
        // The first caption is initialized by X's compose link, not pasted.
        assertActive();
        files=part.assetOrders.map(order=>originals[order]);
        if(files.length) {
          editor.focus();
          const row=xPostRoot(editor);
          const input=row.querySelector('input[type="file"][data-testid="fileInput"]') || findUploadInput();
          if(!input) throw api.extensionError('FILE_INPUT_NOT_FOUND',`${index+1}번째 X 글의 첨부칸을 찾지 못했습니다.`);
          const receipt={root:row,sources:previewSources(row)};
          await injectFiles(input);
          progress(api.STATES.VERIFYING,`X 스레드 ${index+1}/${plan.length} · 원본 ${files.length}개 확인 중`,{current:confirmed,total:originals.length});
          if(!await verifyInjection(input,receipt)) throw api.extensionError('COMPOSER_DID_NOT_REACT',`${index+1}번째 X 글의 사진 첨부를 확인하지 못했습니다.`);
          confirmed+=files.length;
        }
        // Rerenders must retain every previously prepared post and its text.
        for(let previous=0;previous<=index;previous++) {
          const retained=xEditors()[previous];
          if(!retained || api.readTextField(retained)!==plan[previous].caption.replace(/\r\n?/g,'\n').replace(/\u00a0/g,' ').trim()) throw api.extensionError('TEXT_INSERT_FAILED','X가 준비한 스레드 내용을 유지하지 않았습니다.');
          if(previewSources(xPostRoot(retained)).size<plan[previous].assetOrders.length) throw api.extensionError('INCOMPLETE_THREAD','X에서 앞서 넣은 사진이 사라졌습니다. 작성창을 확인해 주세요.');
        }
        if(index<plan.length-1) {
          let add;
          // Home's inline composer exposes Add post as a link; the modal uses
          // a button. Only X's exact add control may open the thread composer.
          try { add=await api.waitForMutation(()=>[...composerRoot().querySelectorAll('button,[role="button"],a[data-testid="addButton"]')].find(el=>visible(el) && !el.disabled && el.getAttribute('aria-disabled')!=='true' && /^(add post|게시물 추가|트윗 추가)$/i.test(el.getAttribute('aria-label') || el.textContent.trim()) && (el.tagName!=='A' || new URL(el.getAttribute('href'),location.href).pathname==='/compose/post')),12_000,controller.signal); }
          catch { throw api.extensionError('THREAD_ADD_NOT_FOUND','X의 다음 이미지 댓글 추가 버튼을 찾지 못했습니다.'); }
          add.click();
          await api.waitForMutation(()=>xEditors().length===index+2,12_000,controller.signal);
        }
      }
      if(confirmed!==originals.length) throw api.extensionError('INCOMPLETE_THREAD','X에 전달된 원본 수가 맞지 않습니다.');
      return {count:confirmed,contentInserted:true,threadCount:plan.length,xMode:mode};
    } catch(error) {
      const diagnostic=error.detail || (!error.code ? `${error.name || 'Error'}: ${String(error.message || error).replace(/https?:\/\/\S+/g,'[URL]').slice(0,180)}` : '');
      throw api.extensionError(error.code || 'THREAD_INSERT_FAILED',error.userMessage || 'X 스레드 준비를 완료하지 못했습니다.',[diagnostic,`원본 ${confirmed}/${originals.length}개 확인. 이미 들어간 초안을 유지했습니다. 중복 첨부를 막기 위해 새 빈 작성창에서 다시 시도해 주세요.`].filter(Boolean).join(' '));
    } finally { if(currentJobId===originalJobId)files=running?originals:[]; }
  }
  async function finishJob() {
    controller = new AbortController(); overlay ||= new api.StatusOverlay(cancelOrClose);
    const signal = controller.signal;
    const jobId = currentJobId;
    const assertActive = () => {
      if (signal.aborted || currentJobId !== jobId) throw api.extensionError('USER_CANCELLED', '작업을 취소했습니다.');
    };
    try {
      await prepareComposer();
      assertActive();
      if(target==='x' && content?.contentMode) {
        const result=await insertXThread(assertActive); assertActive(); finished=true;
        const message=result.xMode==='article' ? `제목·링크 + 이미지 댓글 ${result.threadCount-1}개 준비 완료 · 원본 ${result.count}개` : `열린 답글·인용창에 원본 ${result.count}개 준비 완료`;
        overlay.complete(message,'X에서 제목·링크와 이미지 순서를 확인하고 최종 게시 버튼은 직접 눌러 주세요.');
        port.postMessage({type:'TARGET_COMPLETE',jobId,...result,userMessage:message});clearMemory();return;
      }
      let input = await waitForUploadInput();
      assertActive();
      if(target==='everytime' || (target==='youtube' && content?.contentMode!=='separate')) {
        if(previewSources(composerRoot() || input.closest('form') || document.body).size) throw api.extensionError('FILES_NOT_EMPTY','작성창에 이미 사진이 있습니다. 새 빈 작성창에서 시작해 주세요.','기존 첨부를 보존하며 중복으로 사진을 추가하지 않습니다.');
      }
      const textAfterFiles = target === 'youtube' || target === 'facebook';
      if (['facebook','youtube'].includes(target) && content?.contentMode!=='separate') api.assertContentWritable(target, content);
      let contentInserted = textAfterFiles ? false : await api.fillText(target, content, signal, progress);
      input = findUploadInput() || await waitForUploadInput();
      assertActive();
      const receipt = mediaReceipt(input);
      progress(api.STATES.INJECTING, `원본 ${files.length}개를 넣는 중입니다.`);
      await injectFiles(input);
      progress(api.STATES.VERIFYING, `${api.TARGET_LABELS[target]}가 파일을 받았는지 확인 중입니다.`);
      if (!await verifyInjection(input, receipt)) throw api.extensionError('COMPOSER_DID_NOT_REACT', '사진·영상 첨부 완료를 확인하지 못했습니다.', contentInserted ? '글은 입력되어 있습니다. 첨부 상태를 확인해 주세요. 중복 입력을 막기 위해 다음 글로 이동하지 않습니다.' : '글은 아직 넣지 않았습니다. SNS 작성창의 첨부 상태를 확인해 주세요.');
      if (textAfterFiles) {
        const afterContent = { ...content, replaceableTitle: files[0]?.name.replace(/\.[^.]+$/,'') };
        contentInserted = await api.fillText(target, afterContent, signal, progress);
      } else if (contentInserted) await api.fillText(target, content, signal, progress);
      if (signal.aborted || currentJobId !== jobId) return;
      const count = files.length; finished = true;
      const message = contentInserted ? `원본 ${count}개 + 글 입력 완료` : `원본 ${count}개 전달 완료`;
      overlay.complete(message, '내용을 확인한 뒤 최종 게시 버튼은 직접 눌러 주세요.');
      port.postMessage({ type: 'TARGET_COMPLETE', jobId, count, contentInserted, userMessage: message }); clearMemory();
    } catch (error) {
      if (error?.code === 'USER_CANCELLED' || signal.aborted || currentJobId !== jobId) return;
      const normalized = error?.code ? error : api.extensionError('FILE_ASSIGN_FAILED', 'SNS에 파일을 전달하지 못했습니다.', String(error));
      finished = true; overlay?.error(normalized.userMessage, normalized.detail || '패널의 순차 복사를 사용해 주세요.');
      port?.postMessage({ type: 'TARGET_ERROR', jobId, error: normalized }); clearMemory();
    }
  }

  function onTargetMessage(message) {
    if (message?.type === 'REQUEST_READY') {
      if(interruptedJobId) {
        const jobId=interruptedJobId; interruptedJobId='';
        port.postMessage({type:'TARGET_ERROR',jobId,error:api.extensionError('CONNECTION_LOST','확장 연결이 끊겨 준비를 중단했습니다.','이미 입력한 글과 사진은 보존했습니다. 새 빈 작성창에서 다시 시도해 주세요. 자동으로 다시 첨부하지 않습니다.')});return;
      }
      port.postMessage({ type: 'TARGET_READY', feature:'one-click-v6' }); return;
    }
    if (message?.type === 'JOB_START') {
      if (message.target && message.target !== target) return;
      if (currentJobId && !finished) return;
      currentJobId = message.jobId; total = message.total; files = new Array(total); finished = false;
      content = message;
      overlay?.remove(); overlay = new api.StatusOverlay(cancelOrClose); overlay.update(`원본 받는 중 0/${total}`, '', 0, total); return;
    }
    if (message?.type === 'ASSET' && message.jobId === currentJobId && !running && !finished) {
      if (!(message.file instanceof File) || message.index < 0 || message.index >= total) { port.postMessage({ type: 'TARGET_ERROR', jobId: currentJobId, error: api.extensionError('INVALID_JOB', '전달받은 파일이 올바르지 않습니다.') }); return; }
      files[message.index] = message.file; const received = files.filter(Boolean).length; overlay.update(`원본 받는 중 ${received}/${total}`, '', received, total); return;
    }
    if (message?.type === 'JOB_END' && message.jobId === currentJobId && !finished && !running) {
      if (files.length !== total || Array.from(files).some((file) => !(file instanceof File))) { port.postMessage({ type: 'TARGET_ERROR', jobId: currentJobId, error: api.extensionError('INVALID_JOB', '일부 파일이 전달되지 않았습니다.') }); return; }
      running = true; void finishJob(); return;
    }
    if (message?.type === 'JOB_CANCEL' && message.jobId === currentJobId) cancelOrClose();
    if (message?.type === 'JOB_ERROR' && message.jobId === currentJobId) { finished = true; controller?.abort(); overlay?.error(message.error.userMessage, message.error.detail || '배포 패널에서 다시 시도해 주세요.'); clearMemory(); }
  }
  function connectTarget() {
    if(port) return;
    const connected=chrome.runtime.connect({ name: 'KUDAE_SNS_UPLOAD' });port=connected;
    connected.onMessage.addListener(onTargetMessage);
    connected.onDisconnect?.addListener(()=>{
      if(port!==connected)return;port=null;
      if(currentJobId && !finished) { interruptedJobId=currentJobId;finished=true;controller?.abort();clearMemory(); }
    });
  }
  chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
    if(message?.type==='KUDAE_X_PREFLIGHT' && target==='x') {
      (async()=>{
        try {
          const expected=message.expectedCaption;
          await api.waitForMutation(()=>{
            const fields=api.findTextFields('x','caption');
            return fields && (expected===null || typeof expected==='string' && api.readTextField(fields.body)===expected.trim());
          },12_000);
          const root=composerRoot();const editors=xEditors();
          const mode=[...root.querySelectorAll('article[data-testid="tweet"],[data-testid="quoteTweet"]')].some(visible)?'media':'article';
          const selected=[...root.querySelectorAll('input[type="file"]')].some(input=>input.files?.length);
          if(editors.length!==1 || previewSources(root).size || selected || (expected===null?Boolean(api.readTextField(editors[0])):api.readTextField(editors[0])!==expected.trim())) throw api.extensionError('TEXT_NOT_EMPTY','X 작성창에 이미 글이나 사진이 있습니다. 새 빈 작성창을 열어 주세요.','기존 초안을 지우거나 다른 창으로 옮기지 않았습니다.');
          sendResponse({ok:true,mode});
        } catch(error) {sendResponse({ok:false,error:error.code?error:api.extensionError('TEXT_INPUT_NOT_FOUND','X의 제목·링크 작성창을 확인하지 못했습니다. 현재 초안을 보존합니다.')});}
      })();return true;
    }
    if(message?.type!=='KUDAE_RECONNECT_TARGET')return false;
    try { connectTarget();sendResponse({ready:true,feature:'one-click-v6'}); }
    catch { sendResponse({ready:false}); }
    return false;
  });
  connectTarget();
})();
