globalThis.KudaeSNS = globalThis.KudaeSNS || {};

(() => {
  const api = globalThis.KudaeSNS;

  function event(type, payload) {
    return { source: api.EXTENSION_SOURCE, type, payload };
  }

  function progress(jobId, state, userMessage, extra = {}) {
    return event('SNS_UPLOAD_PROGRESS', { jobId, state, userMessage, ...extra });
  }

  function failure(jobId, error) {
    return event('SNS_UPLOAD_ERROR', { jobId, ...error });
  }

  Object.assign(api, { event, progress, failure });
})();
