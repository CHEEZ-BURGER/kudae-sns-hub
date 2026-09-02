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
      const initial = test();
      if (initial) { resolve(initial); return; }
      const observer = new MutationObserver(() => {
        const result = test();
        if (!result) return;
        cleanup(); resolve(result);
      });
      const timeout = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs);
      const onAbort = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
      const cleanup = () => {
        clearTimeout(timeout);
        observer.disconnect();
        signal?.removeEventListener('abort', onAbort);
      };
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['accept', 'multiple', 'role', 'aria-label'] });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  Object.assign(globalThis.KudaeSNS, { SNSAdapter, waitForMutation });
})();
