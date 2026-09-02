(() => {
  const api = globalThis.KudaeSNS;
  if (!api.ALLOWED_APP_ORIGINS.has(location.origin)) return;

  const post = (message) => window.postMessage(message, location.origin);

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== api.APP_SOURCE) return;
    const { type, payload } = event.data;
    if (type === 'SNS_EXTENSION_PING') {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'APP_PING' });
        post(api.event('SNS_EXTENSION_PONG', response));
      } catch {
        // No response means the extension context was reloaded or removed.
      }
      return;
    }
    if (type === 'SNS_UPLOAD_REQUEST') {
      const checked = api.validateJob(payload);
      if (!checked.ok) { post(api.failure(payload?.jobId || '', checked.error)); return; }
      try {
        const response = await chrome.runtime.sendMessage({ type: 'SNS_UPLOAD_REQUEST', payload: checked.value });
        if (!response?.accepted) post(api.failure(payload.jobId, response?.error || api.extensionError('INVALID_JOB', '업로드 요청을 시작하지 못했습니다.')));
      } catch (error) {
        post(api.failure(payload.jobId, api.extensionError('EXTENSION_NOT_AVAILABLE', '확장 프로그램과 연결할 수 없습니다.', String(error))));
      }
      return;
    }
    if (type === 'SNS_UPLOAD_CANCEL' && typeof payload?.jobId === 'string') {
      await chrome.runtime.sendMessage({ type: 'SNS_UPLOAD_CANCEL', jobId: payload.jobId }).catch(() => undefined);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'EXTENSION_EVENT' && message.event?.source === api.EXTENSION_SOURCE) post(message.event);
  });
})();
