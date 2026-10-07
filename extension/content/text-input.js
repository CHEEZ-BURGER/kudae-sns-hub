(() => {
  const api = globalThis.KudaeSNS;
  const normalize = (text) => String(text || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
  const visible = (element) => {
    if (!element || element.disabled || element.readOnly || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    const view = element.ownerDocument.defaultView;
    return view.getComputedStyle(element).display !== 'none' && view.getComputedStyle(element).visibility !== 'hidden'
      && element.getClientRects().length > 0;
  };
  const read = (element) => normalize('value' in element ? element.value : element.innerText ?? element.textContent);
  const label = (element) => [element.id, element.getAttribute('name'), element.getAttribute('aria-label'), element.getAttribute('placeholder'), element.getAttribute('data-placeholder')].filter(Boolean).join(' ');
  const titlePattern = /subject|title|제목/i;
  const bodyPattern = /content|body|description|caption|comment|text|본문|내용|설명|문구|게시물|무슨 생각|마음|happening|mind|say something/i;
  const excluded = /search|검색|reply|comment|답글|댓글|password|email|이메일|로그인|username/i;

  function documents(root) {
    const result = [root];
    for (const frame of root.querySelectorAll('iframe')) {
      if (!visible(frame)) continue;
      try { if (frame.contentDocument) result.push(frame.contentDocument); } catch { /* Cross-origin frames are never accessed. */ }
    }
    return result;
  }
  function findTextFields(target, mode, root = document) {
    const selectors = {
      koreapas: { title: 'input[name="subject"],input[name="title"],input#subject', body: 'textarea[name="content"],textarea[name="memo"],textarea[name="body"],[contenteditable="true"]' },
      everytime: { title: 'input[name="title"],input[placeholder*="제목"]', body: 'textarea[name="text"],textarea[name="content"],textarea[placeholder*="내용"],[contenteditable="true"]' },
      youtube: { title: '#title-textarea #textbox,[contenteditable="true"][aria-label*="제목"],[contenteditable="true"][aria-label*="Title"]', body: '#description-textarea #textbox,[contenteditable="true"][aria-label*="설명"],[contenteditable="true"][aria-label*="Description"]' },
      instagram: { body: 'textarea[placeholder*="문구"],textarea[placeholder*="caption"],[contenteditable="true"][aria-label*="문구"],[contenteditable="true"][aria-label*="caption"]' },
      facebook: { body: '[role="dialog"] [contenteditable="true"][role="textbox"],[role="dialog"] [data-lexical-editor="true"]' },
    };
    const editors = documents(root).flatMap((doc) => [...doc.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable="true"],[contenteditable="plaintext-only"]')]).filter(visible);
    const activeDialog = [...root.querySelectorAll('[role="dialog"]')].filter(visible).at(-1);
    const inScope = (element) => !activeDialog || element.ownerDocument !== root || activeDialog.contains(element);
    const candidates = editors.filter((element) => inScope(element) && !excluded.test(label(element)));
    const score = (element, kind) => {
      const text = label(element);
      let value = kind === 'title' ? (titlePattern.test(text) ? 70 : -100) : (bodyPattern.test(text) ? 60 : 0);
      const selector = selectors[target]?.[kind];
      if (selector && element.matches(selector)) value = Math.max(value,150);
      if (element.closest('form,[role="dialog"]')) value += 20;
      if (kind === 'body' && (element.tagName === 'TEXTAREA' || element.isContentEditable)) value += 20;
      if (kind === 'body' && titlePattern.test(text)) value -= 200;
      if (target === 'x' && element.getAttribute('data-testid')?.startsWith('tweetTextarea')) value += 100;
      return value;
    };
    const choose = (kind, other) => candidates.filter((element) => element !== other && score(element, kind) > 0)
      .sort((a, b) => score(b, kind) - score(a, kind))[0] || null;
    const title = mode === 'separate' ? choose('title') : null;
    const bodyCandidates = candidates.filter((element) => {
      const form = title?.closest('form');
      if (!form) return true;
      const frame = element.ownerDocument.defaultView.frameElement;
      return form.contains(element) || (frame && form.contains(frame));
    });
    const body = bodyCandidates.filter((element) => element !== title && score(element, 'body') > 0 &&
      (mode === 'separate' || activeDialog || selectors[target]?.body && element.matches(selectors[target].body) ||
        target === 'x' && element.getAttribute('data-testid')?.startsWith('tweetTextarea') ||
        /문구|caption|mind|무슨 생각|happening|게시물|post/i.test(label(element))))
      .sort((a,b) => score(b,'body')-score(a,'body'))[0] || null;
    return body && (mode !== 'separate' || title) ? { title, body } : null;
  }

  function assertWritable(element, text, allowedOld = '') {
    const old = read(element);
    if (old && old !== normalize(text) && (!allowedOld || old !== normalize(allowedOld))) throw api.extensionError('TEXT_NOT_EMPTY', '작성창에 이미 다른 글이 있습니다. 내용을 지우거나 새 작성창을 열어 주세요.');
    const limit = Number(element.getAttribute('maxlength'));
    if (element.hasAttribute('maxlength') && limit >= 0 && text.length > limit) throw api.extensionError('TEXT_TOO_LONG', '이 SNS 입력칸의 글자 수 제한을 넘습니다. 글을 줄인 뒤 다시 시도해 주세요.');
  }

  async function writeField(element, text, signal, allowedOld = '') {
    assertWritable(element, text, allowedOld);
    if (signal?.aborted) throw api.extensionError('USER_CANCELLED', '작업을 취소했습니다.');
    if (read(element) === normalize(text)) return;
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    element.focus();
    if ('value' in element) {
      const proto = element.tagName === 'TEXTAREA' ? view.HTMLTextAreaElement.prototype : view.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(element, text); else element.value = text;
    } else {
      const range = doc.createRange(); range.selectNodeContents(element);
      const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      const inserted = typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, text);
      if (!inserted) {
        // Plain text only; never inject manuscript HTML or use framework internals.
        element.innerText = text;
      }
    }
    element.dispatchEvent(new view.InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
    element.dispatchEvent(new view.Event('change', { bubbles: true, composed: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (signal?.aborted) throw api.extensionError('USER_CANCELLED', '작업을 취소했습니다.');
    if (!element.isConnected || read(element) !== normalize(text)) throw api.extensionError('TEXT_INSERT_FAILED', 'SNS가 입력한 글을 유지하지 않았습니다. 현재 글을 유지합니다.');
  }

  async function fillText(target, content, signal, progress, root = document) {
    if (!content?.contentMode) return false; // Old image-only jobs remain compatible.
    progress(api.STATES.WAITING_FOR_TEXT_INPUT, `${api.TARGET_LABELS[target]}의 제목·본문 작성칸을 확인 중입니다.`);
    let fields;
    // Polling also detects editors inside same-origin frames and shadowless SPA rerenders.
    for (let attempt = 0; attempt < 120; attempt++) {
      if (signal?.aborted) throw api.extensionError('USER_CANCELLED', '작업을 취소했습니다.');
      fields = findTextFields(target, content.contentMode, root);
      if (fields) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!fields) throw api.extensionError('TEXT_INPUT_NOT_FOUND', '제목·본문 입력칸을 찾지 못했습니다. SNS 작성창을 열고 다시 시도해 주세요.');
    const body = content.contentMode === 'separate' ? content.body : content.caption;
    const allowedTitle = target === 'youtube' && content.contentMode === 'separate' ? content.replaceableTitle || '' : '';
    assertWritable(fields.body, body);
    if (fields.title) assertWritable(fields.title, content.title, allowedTitle);
    if (fields.title) await writeField(fields.title, content.title, signal, allowedTitle);
    await writeField(fields.body, body, signal);
    return true;
  }
  Object.assign(api, { findTextFields, fillText, readTextField: read, writeTextField: writeField });
})();
