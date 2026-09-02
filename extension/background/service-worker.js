importScripts('../shared/constants.js', '../shared/validators.js', '../shared/protocol.js');

const api = globalThis.KudaeSNS;
const controllers = new Map();
const targetPorts = new Map();
const runningJobs = new Set();

const jobKey = (jobId) => `job:${jobId}`;

async function getJob(jobId) {
  return (await chrome.storage.session.get(jobKey(jobId)))[jobKey(jobId)] || null;
}

async function saveJob(job) {
  await chrome.storage.session.set({ [jobKey(job.jobId)]: job });
}

async function deleteJob(jobId) {
  await chrome.storage.session.remove(jobKey(jobId));
  controllers.delete(jobId);
  runningJobs.delete(jobId);
}

async function updateJob(jobId, patch) {
  const job = await getJob(jobId);
  if (!job) return null;
  const next = { ...job, ...patch };
  await saveJob(next);
  return next;
}

async function relay(job, message) {
  if (!job?.sourceTabId) return;
  try { await chrome.tabs.sendMessage(job.sourceTabId, { type: 'EXTENSION_EVENT', event: message }); }
  catch { /* The source page may have been closed. */ }
}

async function setState(job, state, userMessage, extra = {}) {
  const next = await updateJob(job.jobId, { state, updatedAt: Date.now() }) || job;
  await relay(next, api.progress(job.jobId, state, userMessage, extra));
  return next;
}

async function failJob(job, error) {
  await updateJob(job.jobId, { state: api.STATES.ERROR, error, updatedAt: Date.now() });
  await relay(job, api.failure(job.jobId, error));
  try { targetPorts.get(job.targetTabId)?.postMessage({ type: 'JOB_ERROR', jobId: job.jobId, error }); }
  catch { /* The Instagram tab may have been closed. */ }
  await deleteJob(job.jobId);
}

async function cleanupStaleJobs() {
  const values = await chrome.storage.session.get(null);
  const now = Date.now();
  await Promise.all(Object.entries(values).map(async ([key, job]) => {
    if (!key.startsWith('job:') || !job?.createdAt || now - job.createdAt <= api.JOB_TTL_MS) return;
    await chrome.storage.session.remove(key);
  }));
}

async function createUploadJob(rawJob, sender) {
  const senderUrl = sender.tab?.url ? new URL(sender.tab.url) : null;
  if (!sender.tab?.id || !senderUrl || !api.ALLOWED_APP_ORIGINS.has(senderUrl.origin)) {
    throw api.extensionError('INVALID_JOB', '허용된 고대신문 배포 페이지에서만 실행할 수 있습니다.');
  }
  const checked = api.validateJob(rawJob);
  if (!checked.ok) throw checked.error;
  await cleanupStaleJobs();

  const job = {
    jobId: checked.value.jobId,
    target: checked.value.target,
    createdAt: checked.value.createdAt,
    updatedAt: Date.now(),
    assets: checked.value.assets,
    caption: checked.value.caption,
    sourceTabId: sender.tab.id,
    sourceOrigin: senderUrl.origin,
    targetTabId: null,
    state: api.STATES.QUEUED,
  };
  await saveJob(job);
  await relay(job, api.event('SNS_UPLOAD_ACK', { jobId: job.jobId, accepted: true }));
  await setState(job, api.STATES.OPENING_TARGET, 'Instagram을 여는 중입니다.');

  let targetTab;
  try { targetTab = await chrome.tabs.create({ url: 'https://www.instagram.com/', active: true }); }
  catch (error) {
    await deleteJob(job.jobId);
    throw api.extensionError('TARGET_TAB_FAILED', 'Instagram 탭을 열지 못했습니다.', String(error));
  }
  if (!targetTab.id) {
    await deleteJob(job.jobId);
    throw api.extensionError('TARGET_TAB_FAILED', 'Instagram 탭 번호를 확인하지 못했습니다.');
  }
  await updateJob(job.jobId, { targetTabId: targetTab.id, updatedAt: Date.now() });
  return job.jobId;
}

async function findJobForTarget(targetTabId) {
  const values = await chrome.storage.session.get(null);
  return Object.entries(values)
    .filter(([key, job]) => key.startsWith('job:') && job?.targetTabId === targetTabId)
    .map(([, job]) => job)
    .sort((left, right) => right.createdAt - left.createdAt)[0] || null;
}

async function fetchWithRetry(asset, index, signal) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(asset.url, { signal, cache: 'no-store', credentials: 'omit' });
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? 'SIGNED_URL_EXPIRED' : 'FETCH_FAILED';
        throw api.extensionError(code, `${index + 1}번 이미지를 불러오지 못했습니다.`, `HTTP ${response.status}`, { assetIndex: index });
      }
      const blob = await response.blob();
      if (blob.size > api.MAX_FILE_BYTES) throw api.extensionError('FILE_TOO_LARGE', `${index + 1}번 이미지가 50MB를 넘습니다.`, `${blob.size} bytes`, { assetIndex: index });
      const mimeType = (blob.type || response.headers.get('content-type') || asset.mimeType).split(';')[0].trim().toLowerCase();
      if (!api.allowedMimeTypes.has(mimeType)) throw api.extensionError('UNSUPPORTED_MIME', `${index + 1}번 이미지 형식을 지원하지 않습니다.`, mimeType, { assetIndex: index });
      return new File([blob], asset.filename, { type: mimeType, lastModified: Date.now() });
    } catch (error) {
      if (signal.aborted) throw api.extensionError('USER_CANCELLED', '업로드를 취소했습니다.');
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  throw lastError || api.extensionError('FETCH_FAILED', `${index + 1}번 이미지를 불러오지 못했습니다.`, '', { assetIndex: index });
}

async function fetchFiles(job, signal) {
  const files = new Array(job.assets.length);
  let nextIndex = 0;
  let completed = 0;
  const worker = async () => {
    while (nextIndex < job.assets.length) {
      const index = nextIndex;
      nextIndex += 1;
      files[index] = await fetchWithRetry(job.assets[index], index, signal);
      completed += 1;
      await relay(job, api.progress(job.jobId, api.STATES.FETCHING, `이미지 준비 중 ${completed}/${job.assets.length}`, { current: completed, total: job.assets.length }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(api.FETCH_CONCURRENCY, job.assets.length) }, worker));
  return files;
}

async function runJob(job, port) {
  if (runningJobs.has(job.jobId)) return;
  runningJobs.add(job.jobId);
  const controller = new AbortController();
  controllers.set(job.jobId, controller);
  let files = [];
  try {
    await setState(job, api.STATES.FETCHING, `이미지 준비 중 0/${job.assets.length}`, { current: 0, total: job.assets.length });
    files = await fetchFiles(job, controller.signal);
    port.postMessage({ type: 'JOB_START', jobId: job.jobId, total: files.length, createdAt: job.createdAt });
    files.forEach((file, index) => port.postMessage({ type: 'ASSET', jobId: job.jobId, index, total: files.length, file }));
    port.postMessage({ type: 'JOB_END', jobId: job.jobId, total: files.length });
    files.length = 0;
  } catch (error) {
    files.length = 0;
    const normalized = error?.code ? error : api.extensionError('FETCH_FAILED', '이미지를 준비하지 못했습니다.', String(error));
    await failJob(job, normalized);
  }
}

async function cancelJob(jobId) {
  const job = await getJob(jobId);
  if (!job) return;
  controllers.get(jobId)?.abort();
  targetPorts.get(job.targetTabId)?.postMessage({ type: 'JOB_CANCEL', jobId });
  await relay(job, api.event('SNS_UPLOAD_ERROR', { jobId, code: 'USER_CANCELLED', userMessage: '업로드를 취소했습니다.' }));
  await deleteJob(jobId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'APP_PING') {
    const origin = sender.tab?.url ? new URL(sender.tab.url).origin : '';
    sendResponse({ available: api.ALLOWED_APP_ORIGINS.has(origin), version: chrome.runtime.getManifest().version });
    return false;
  }
  if (message?.type === 'SNS_UPLOAD_REQUEST') {
    createUploadJob(message.payload, sender)
      .then((jobId) => sendResponse({ accepted: true, jobId }))
      .catch((error) => sendResponse({ accepted: false, error: error?.code ? error : api.extensionError('INVALID_JOB', '업로드 요청을 시작하지 못했습니다.', String(error)) }));
    return true;
  }
  if (message?.type === 'SNS_UPLOAD_CANCEL') {
    cancelJob(message.jobId).then(() => sendResponse({ cancelled: true }));
    return true;
  }
  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  const tabId = port.sender?.tab?.id;
  if (port.name !== 'KUDAE_SNS_UPLOAD' || !tabId) return;
  targetPorts.set(tabId, port);
  port.onDisconnect.addListener(() => targetPorts.delete(tabId));
  port.onMessage.addListener(async (message) => {
    if (message?.type === 'FIXTURE_REQUEST' && Array.isArray(message.urls)) {
      const urls = message.urls.slice(0, 10);
      const files = [];
      for (let index = 0; index < urls.length; index += 1) {
        const response = await fetch(urls[index]);
        const blob = await response.blob();
        files.push(new File([blob], `card-${String(index + 1).padStart(2, '0')}.png`, { type: 'image/png' }));
      }
      const fixtureJobId = `fixture-${crypto.randomUUID()}`;
      port.postMessage({ type: 'JOB_START', jobId: fixtureJobId, total: files.length, createdAt: Date.now() });
      files.forEach((file, index) => port.postMessage({ type: 'ASSET', jobId: fixtureJobId, index, total: files.length, file }));
      port.postMessage({ type: 'JOB_END', jobId: fixtureJobId, total: files.length });
      files.length = 0;
      return;
    }
    const job = message?.jobId ? await getJob(message.jobId) : await findJobForTarget(tabId);
    if (message?.type === 'TARGET_READY') {
      const pending = job || await findJobForTarget(tabId);
      if (pending) await runJob(pending, port);
      return;
    }
    if (!job) return;
    if (message.type === 'TARGET_CANCEL') { await cancelJob(job.jobId); return; }
    if (message.type === 'TARGET_PROGRESS') {
      await updateJob(job.jobId, { state: message.state, updatedAt: Date.now() });
      await relay(job, api.progress(job.jobId, message.state, message.userMessage, message.extra || {}));
      return;
    }
    if (message.type === 'TARGET_COMPLETE') {
      await relay(job, api.event('SNS_UPLOAD_COMPLETE', { jobId: job.jobId, count: message.count, originalRatioSelected: Boolean(message.originalRatioSelected), userMessage: message.userMessage || `이미지 ${message.count}장 전달 완료` }));
      await deleteJob(job.jobId);
      return;
    }
    if (message.type === 'TARGET_ERROR') await failJob(job, message.error);
  });
  port.postMessage({ type: 'REQUEST_READY' });
});

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('fixture/index.html') }));
chrome.runtime.onStartup.addListener(cleanupStaleJobs);
chrome.runtime.onInstalled.addListener(cleanupStaleJobs);
void cleanupStaleJobs();
