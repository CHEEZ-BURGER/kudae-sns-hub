(() => {
  const api = globalThis.KudaeSNS;
  const SITE_RULES = {
    facebook: { hosts: ['facebook.com', 'web.facebook.com'], button: /사진\/?동영상|photo\/?video|add photos|사진 추가/i, kind: 'image' },
    koreapas: { hosts: ['koreapas.com'], button: /사진|이미지|첨부|파일 선택|파일 첨부|업로드/i, kind: 'image' },
    everytime: { hosts: ['everytime.kr'], button: /사진|이미지|첨부|파일 선택|파일 첨부|업로드/i, kind: 'image' },
    x: { hosts: ['x.com', 'twitter.com'], button: /미디어|사진이나 동영상 추가|add photos or video|media/i, kind: 'image' },
    youtube: { hosts: ['youtube.com', 'studio.youtube.com'], button: /파일 선택|select files|동영상 업로드|upload videos/i, kind: 'video' },
  };

  const hostname = location.hostname.replace(/^www\./, '');
  const target = Object.entries(SITE_RULES).find(([, rule]) => rule.hosts.includes(hostname))?.[0] || null;
  if (!target) return;
  const rule = SITE_RULES[target];
  let port; let overlay; let controller; let currentJobId = ''; let files = []; let total = 0; let finished = false;

  const labelOf = (element) => [element.getAttribute('aria-label'), element.getAttribute('title'), element.textContent]
    .filter(Boolean).join(' ').trim().replace(/\s+/g, ' ');

  function findUploadInput() {
    const expected = rule.kind;
    const candidates = [...document.querySelectorAll('input[type="file"]')].filter((input) => !input.disabled);
    return candidates.map((input, index) => {
      const accept = (input.getAttribute('accept') || '').toLowerCase();
      let score = index;
      if (!accept || accept.includes(expected) || accept.includes(expected === 'image' ? '.jpg' : '.mp4')) score += 60;
      if (input.multiple) score += target === 'youtube' ? 0 : 25;
      if (input.closest('[role="dialog"],form')) score += 25;
      if (input.offsetParent !== null) score += 8;
      return { input, score };
    }).sort((left, right) => right.score - left.score)[0]?.input || null;
  }

  async function prepareComposer() {
    if (findUploadInput()) return;
    const action = [...document.querySelectorAll('button,[role="button"],label,a')].find((element) => rule.button.test(labelOf(element)));
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
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    if (input.files?.length !== files.length) throw api.extensionError('FILE_ASSIGN_FAILED', '전달된 파일 수가 맞지 않습니다.', `Expected ${files.length}, received ${input.files?.length || 0}`);
  }

  async function verifyInjection(input) {
    if (input.files?.length !== files.length) return false;
    const root = input.closest('[role="dialog"],form') || document.body;
    const before = root.childElementCount;
    return new Promise((resolve) => {
      let reacted = false;
      const observer = new MutationObserver(() => {
        if (!input.isConnected || root.childElementCount !== before) { reacted = true; cleanup(); resolve(true); }
      });
      const timeout = setTimeout(() => { cleanup(); resolve(reacted || input.files?.length === files.length); }, 10_000);
      const onAbort = () => { cleanup(); resolve(false); };
      const cleanup = () => { clearTimeout(timeout); observer.disconnect(); controller.signal.removeEventListener('abort', onAbort); };
      observer.observe(root, { childList: true, subtree: true, attributes: true });
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  function clearMemory() { files.length = 0; files = []; controller = null; }
  function progress(state, userMessage, extra = {}) {
    overlay?.update(userMessage, state.includes('WAITING') ? '창이 열리면 자동으로 계속합니다.' : '', extra.current || 0, extra.total || 0);
    port?.postMessage({ type: 'TARGET_PROGRESS', jobId: currentJobId, state, userMessage, extra });
  }
  function cancelOrClose() {
    if (finished) { overlay?.remove(); overlay = null; return; }
    controller?.abort(); port?.postMessage({ type: 'TARGET_CANCEL', jobId: currentJobId }); clearMemory(); overlay?.remove(); overlay = null;
  }
  async function finishJob() {
    controller = new AbortController(); overlay ||= new api.StatusOverlay(cancelOrClose);
    try {
      await prepareComposer();
      const input = await waitForUploadInput();
      progress(api.STATES.INJECTING, `원본 ${files.length}개를 넣는 중입니다.`);
      await injectFiles(input);
      progress(api.STATES.VERIFYING, `${api.TARGET_LABELS[target]}가 파일을 받았는지 확인 중입니다.`);
      if (!await verifyInjection(input)) throw api.extensionError('COMPOSER_DID_NOT_REACT', '파일은 전달했지만 작성 화면이 반응하지 않았습니다.', '패널의 순차 복사를 사용해 주세요.');
      const count = files.length; finished = true;
      const message = `원본 ${count}개 전달 완료`;
      overlay.complete(message, '내용을 확인한 뒤 최종 게시 버튼은 직접 눌러 주세요.');
      port.postMessage({ type: 'TARGET_COMPLETE', jobId: currentJobId, count, userMessage: message }); clearMemory();
    } catch (error) {
      if (error?.code === 'USER_CANCELLED') return;
      const normalized = error?.code ? error : api.extensionError('FILE_ASSIGN_FAILED', 'SNS에 파일을 전달하지 못했습니다.', String(error));
      finished = true; overlay?.error(normalized.userMessage, normalized.detail || '패널의 순차 복사를 사용해 주세요.');
      port?.postMessage({ type: 'TARGET_ERROR', jobId: currentJobId, error: normalized }); clearMemory();
    }
  }

  port = chrome.runtime.connect({ name: 'KUDAE_SNS_UPLOAD' });
  port.onMessage.addListener((message) => {
    if (message?.type === 'REQUEST_READY') { port.postMessage({ type: 'TARGET_READY' }); return; }
    if (message?.type === 'JOB_START') {
      if (message.target && message.target !== target) return;
      currentJobId = message.jobId; total = message.total; files = new Array(total); finished = false;
      overlay?.remove(); overlay = new api.StatusOverlay(cancelOrClose); overlay.update(`원본 받는 중 0/${total}`, '', 0, total); return;
    }
    if (message?.type === 'ASSET' && message.jobId === currentJobId) {
      if (!(message.file instanceof File) || message.index < 0 || message.index >= total) { port.postMessage({ type: 'TARGET_ERROR', jobId: currentJobId, error: api.extensionError('INVALID_JOB', '전달받은 파일이 올바르지 않습니다.') }); return; }
      files[message.index] = message.file; const received = files.filter(Boolean).length; overlay.update(`원본 받는 중 ${received}/${total}`, '', received, total); return;
    }
    if (message?.type === 'JOB_END' && message.jobId === currentJobId) {
      if (files.some((file) => !(file instanceof File))) { port.postMessage({ type: 'TARGET_ERROR', jobId: currentJobId, error: api.extensionError('INVALID_JOB', '일부 파일이 전달되지 않았습니다.') }); return; }
      void finishJob(); return;
    }
    if (message?.type === 'JOB_CANCEL' && message.jobId === currentJobId) cancelOrClose();
    if (message?.type === 'JOB_ERROR' && message.jobId === currentJobId) { finished = true; overlay?.error(message.error.userMessage, message.error.detail || '배포 패널에서 다시 시도해 주세요.'); clearMemory(); }
  });
})();
