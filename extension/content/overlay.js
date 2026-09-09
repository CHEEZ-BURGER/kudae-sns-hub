globalThis.KudaeSNS = globalThis.KudaeSNS || {};

(() => {
  class StatusOverlay {
    // Progress belongs in the side panel. Never cover the SNS composer.
    constructor() {}
    update() {}
    complete() {}
    error() {}
    remove() {}
  }

  globalThis.KudaeSNS.StatusOverlay = StatusOverlay;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'KUDAE_CONTEXT_PING') return false;
    sendResponse({ ready: true });
    return false;
  });
})();
