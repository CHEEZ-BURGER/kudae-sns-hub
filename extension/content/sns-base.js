globalThis.KudaeSNS = globalThis.KudaeSNS || {};

(() => {
  class SNSAdapter {
    matches() { return false; }
    async prepareComposer() {}
    async findUploadInput() { return null; }
    async injectFiles() { throw new Error('Not implemented'); }
    async verifyInjection() { return false; }
    getStatus() { return {}; }
  }

  function waitForMutation(test, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const initial = test();
      if (initial) { resolve(initial); return; }
      const check = () => {
        const result = test();
        if (!result) return;
        cleanup(); resolve(result);
      };
      const observer = new MutationObserver(check);
      // Decoding an image or finishing an upload can change layout/state
      // without changing a DOM attribute. A bounded poll covers that case.
      let poll;
      const pollNext = () => { check(); if(!settled) poll=setTimeout(pollNext,250); };
      let settled=false;
      poll=setTimeout(pollNext,250);
      const timeout = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
      const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
      const cleanup = () => {
        settled=true; clearTimeout(poll);
        clearTimeout(timeout);
        observer.disconnect();
        signal?.removeEventListener('abort', onAbort);
      };
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['accept', 'multiple', 'role', 'aria-label', 'src', 'srcset', 'poster', 'style', 'class'] });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  Object.assign(globalThis.KudaeSNS, { SNSAdapter, waitForMutation });
})();
