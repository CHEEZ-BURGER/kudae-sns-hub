(() => {
  const api = globalThis.KudaeSNS;

  class InstagramAdapter extends api.SNSAdapter {
    constructor(progress, signal) {
      super();
      this.progress = progress;
      this.signal = signal;
    }

    matches(url = location.href) {
      return /^https:\/\/(?:www\.)?instagram\.com\//i.test(url);
    }

    dialog() {
      return [...document.querySelectorAll('[role="dialog"]')].find((element) => element.querySelector('input[type="file"]'))
        || [...document.querySelectorAll('[role="dialog"]')].at(-1)
        || null;
    }

    async prepareComposer() {
      if (this.findUploadInput()) return;
      this.progress(api.STATES.WAITING_FOR_COMPOSER, "Instagram에서 '만들기 → 게시물'을 열어주세요.");
      const elements = [...document.querySelectorAll('button,[role="button"],a,[role="link"]')];
      const createPattern = /^(만들기|create|새 게시물|new post)$/i;
      const create = elements.find((element) => {
        const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`.trim().replace(/\s+/g, ' ');
        return createPattern.test(label);
      });
      if (!create) return;
      create.click();
      await new Promise((resolve) => setTimeout(resolve, 650));
      const postPattern = /^(게시물|post)$/i;
      const post = [...document.querySelectorAll('button,[role="button"],a,[role="menuitem"]')].find((element) => {
        const label = `${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`.trim().replace(/\s+/g, ' ');
        return postPattern.test(label);
      });
      post?.click();
    }

    findUploadInput() {
      const candidates = [...document.querySelectorAll('input[type="file"]')];
      if (!candidates.length) return null;
      return candidates.map((input, index) => {
        const accept = (input.getAttribute('accept') || '').toLowerCase();
        let score = index;
        if (accept.includes('image')) score += 50;
        if (input.multiple) score += 35;
        if (input.closest('[role="dialog"]')) score += 30;
        if (!input.disabled) score += 10;
        return { input, score };
      }).sort((left, right) => right.score - left.score)[0].input;
    }

    async waitForUploadInput() {
      const existing = this.findUploadInput();
      if (existing) return existing;
      this.progress(api.STATES.WAITING_FOR_FILE_INPUT, "Instagram에서 '만들기 → 게시물'을 열어주세요.");
      try {
        return await api.waitForMutation(() => this.findUploadInput(), api.JOB_TTL_MS - 10_000, this.signal);
      } catch (error) {
        if (error?.name === 'AbortError') throw api.extensionError('USER_CANCELLED', '업로드를 취소했습니다.');
        throw api.extensionError('FILE_INPUT_NOT_FOUND', 'Instagram의 이미지 선택 창을 찾지 못했습니다.', 'File input wait timed out');
      }
    }

    async injectFiles(input, files) {
      const transfer = new DataTransfer();
      files.forEach((file) => transfer.items.add(file));
      try {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
        if (descriptor?.set) descriptor.set.call(input, transfer.files);
        else input.files = transfer.files;
      } catch (error) {
        throw api.extensionError('FILE_ASSIGN_FAILED', 'Instagram에 이미지를 넣지 못했습니다.', String(error));
      }
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      if (input.files?.length !== files.length) throw api.extensionError('FILE_ASSIGN_FAILED', 'Instagram에 전달된 이미지 수가 맞지 않습니다.', `Expected ${files.length}, received ${input.files?.length || 0}`);
    }

    async verifyInjection(input, count) {
      if (input.files?.length !== count) return false;
      const target = input.closest('[role="dialog"]') || document.body;
      const before = target.childElementCount;
      return new Promise((resolve) => {
        let reacted = false;
        const observer = new MutationObserver(() => {
          if (!input.isConnected || target.childElementCount !== before || this.dialog() !== target) {
            reacted = true; cleanup(); resolve(true);
          }
        });
        const timeout = setTimeout(() => { cleanup(); resolve(reacted || !input.isConnected); }, 12_000);
        const onAbort = () => { cleanup(); resolve(false); };
        const cleanup = () => {
          clearTimeout(timeout);
          observer.disconnect();
          this.signal.removeEventListener('abort', onAbort);
        };
        observer.observe(target, { childList: true, subtree: true, attributes: true });
        this.signal.addEventListener('abort', onAbort, { once: true });
      });
    }
  }

  let port;
  let overlay;
  let controller;
  let currentJobId = '';
  let files = [];
  let total = 0;
  let finished = false;

  function clearMemory() {
    files.length = 0;
    files = [];
    controller = null;
  }

  function targetProgress(state, userMessage, extra = {}) {
    overlay?.update(userMessage, state === api.STATES.WAITING_FOR_COMPOSER || state === api.STATES.WAITING_FOR_FILE_INPUT ? '창이 열리면 자동으로 계속 진행합니다.' : '', extra.current || 0, extra.total || 0);
    port?.postMessage({ type: 'TARGET_PROGRESS', jobId: currentJobId, state, userMessage, extra });
  }

  function cancelOrClose() {
    if (finished) { overlay?.remove(); overlay = null; return; }
    controller?.abort();
    port?.postMessage({ type: 'TARGET_CANCEL', jobId: currentJobId });
    clearMemory();
    overlay?.remove();
    overlay = null;
  }

  async function finishJob() {
    controller = new AbortController();
    overlay ||= new api.StatusOverlay(cancelOrClose);
    const adapter = new InstagramAdapter(targetProgress, controller.signal);
    try {
      if (!adapter.matches()) throw api.extensionError('TARGET_TAB_FAILED', 'Instagram 페이지에서만 실행할 수 있습니다.');
      await adapter.prepareComposer();
      const input = await adapter.waitForUploadInput();
      targetProgress(api.STATES.INJECTING, `이미지 ${files.length}장을 넣는 중입니다.`);
      await adapter.injectFiles(input, files);
      targetProgress(api.STATES.VERIFYING, 'Instagram이 이미지를 받았는지 확인 중입니다.');
      const reacted = await adapter.verifyInjection(input, files.length);
      if (!reacted) throw api.extensionError('COMPOSER_DID_NOT_REACT', '이미지는 전달했지만 Instagram 화면이 반응하지 않았습니다.', 'FileList assigned but composer did not react');
      const count = files.length;
      finished = true;
      overlay.complete(`이미지 ${count}장 전달 완료`);
      port.postMessage({ type: 'TARGET_COMPLETE', jobId: currentJobId, count });
      clearMemory();
    } catch (error) {
      if (error?.code === 'USER_CANCELLED') return;
      const normalized = error?.code ? error : api.extensionError('FILE_ASSIGN_FAILED', 'Instagram에 이미지를 전달하지 못했습니다.', String(error));
      finished = true;
      overlay?.error(normalized.userMessage, normalized.detail || '확장 프로그램을 다시 시도해 주세요.');
      port?.postMessage({ type: 'TARGET_ERROR', jobId: currentJobId, error: normalized });
      clearMemory();
    }
  }

  function connect() {
    port = chrome.runtime.connect({ name: 'KUDAE_SNS_UPLOAD' });
    port.onMessage.addListener((message) => {
      if (message?.type === 'REQUEST_READY') { port.postMessage({ type: 'TARGET_READY' }); return; }
      if (message?.type === 'JOB_START') {
        currentJobId = message.jobId;
        total = message.total;
        files = new Array(total);
        finished = false;
        overlay?.remove();
        overlay = new api.StatusOverlay(cancelOrClose);
        overlay.update(`이미지 전달 준비 중 0/${total}`, '', 0, total);
        return;
      }
      if (message?.type === 'ASSET' && message.jobId === currentJobId) {
        if (!(message.file instanceof File) || message.index < 0 || message.index >= total) {
          port.postMessage({ type: 'TARGET_ERROR', jobId: currentJobId, error: api.extensionError('INVALID_JOB', '전달받은 이미지가 올바르지 않습니다.', '', { assetIndex: message.index }) });
          return;
        }
        files[message.index] = message.file;
        const received = files.filter(Boolean).length;
        overlay.update(`이미지 받는 중 ${received}/${total}`, '', received, total);
        return;
      }
      if (message?.type === 'JOB_END' && message.jobId === currentJobId) {
        if (files.some((file) => !(file instanceof File))) {
          port.postMessage({ type: 'TARGET_ERROR', jobId: currentJobId, error: api.extensionError('INVALID_JOB', '일부 이미지가 전달되지 않았습니다.') });
          return;
        }
        void finishJob();
        return;
      }
      if (message?.type === 'JOB_CANCEL' && message.jobId === currentJobId) cancelOrClose();
      if (message?.type === 'JOB_ERROR' && message.jobId === currentJobId) {
        finished = true;
        overlay?.error(message.error.userMessage, message.error.detail || '고대신문 배포 페이지에서 다시 시도해 주세요.');
        clearMemory();
      }
    });
  }

  connect();
})();
