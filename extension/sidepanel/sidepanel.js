import { postBody } from '../shared/post-content.mjs';

(() => {
  const api = globalThis.KudaeSNS;
  const config = globalThis.KudaeSNSConfig || {};
  const el = (id) => document.getElementById(id);
  const state = { link: '', data: null, activeIndex: 0, pasteIndex: 0, tab: null, platform: null, jobId: '', busy: false };
  const platformLabels = api.TARGET_LABELS;
  const extensionByMime = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v' };
  let toastTimer;

  function notify(message) {
    const toast = el('toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function parseDistributionLink(raw) {
    try {
      const url = new URL(raw.trim());
      if (url.origin !== 'https://cheez-burger.github.io' || !url.pathname.startsWith('/kudae-sns-hub/')) return null;
      const match = url.hash.match(/^#\/d\/([A-Za-z0-9_-]{24,80})(?:[/?]|$)/) || url.pathname.match(/\/d\/([A-Za-z0-9_-]{24,80})(?:[/?]|$)/);
      return match ? match[1] : null;
    } catch { return null; }
  }

  function titleParts(category, title = '') {
    const match = title.trim().match(/^\[([^\]]+)\]\s*(.*)$/u);
    return { category: category?.trim() || match?.[1]?.trim() || '보도', title: (match?.[2] || title).trim() };
  }
  function categorizedTitle(post) { const p = titleParts(post.category, post.title); return `[${p.category}] ${p.title}`.trim(); }
  function koreapasTitle(post) { const p = titleParts(post.category, post.title); return `[${p.category.startsWith('고대신문 ') ? p.category : `고대신문 ${p.category}`}] ${p.title}`.trim(); }
  function bodyWithTitle(post) { return [categorizedTitle(post), postBody(post)].filter(Boolean).join('\n\n'); }
  function images(post) { return post.assets.filter((asset) => asset.mimeType.startsWith('image/')); }
  function videos(post) { return post.assets.filter((asset) => asset.mimeType.startsWith('video/')); }

  async function savePanelState() {
    await chrome.storage.session.set({ panelState: { link: state.link, activeIndex: state.activeIndex, pasteIndex: state.pasteIndex } });
  }

  async function loadDistribution(link, quiet = false) {
    const token = parseDistributionLink(link);
    if (!token) throw new Error('고대신문 배포 링크 형식이 아닙니다. 카카오톡 링크 전체를 붙여 넣어 주세요.');
    if (!config.supabaseUrl || !config.publishableKey) throw new Error('배포 연결 설정이 없는 개발용 ZIP입니다. 공개 페이지에서 최신 확장을 다시 받아 주세요.');
    if (!quiet) { el('link-status').textContent = '배포 자료를 불러오는 중입니다…'; el('link-status').className = ''; }
    const response = await fetch(`${config.supabaseUrl}/functions/v1/public-distribution`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.publishableKey }, body: JSON.stringify({ action: 'read', token }), credentials: 'omit', cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '배포 정보를 불러오지 못했습니다.');
    state.link = link.trim(); state.data = payload; state.activeIndex = Math.min(state.activeIndex, Math.max(0, payload.posts.length - 1)); state.pasteIndex = 0;
    el('distribution-link').value = state.link; el('link-status').textContent = '배포 자료를 불러왔습니다. 원본은 필요한 순간에만 가져옵니다.'; el('link-status').className = '';
    await savePanelState(); render();
  }

  function mediaFigure(asset, index, isCurrent) {
    const figure = document.createElement('figure'); if (isCurrent) figure.className = 'current';
    let media;
    if (asset.mimeType.startsWith('video/')) { media = document.createElement('video'); media.controls = true; media.preload = 'metadata'; media.src = asset.originalUrl; }
    else { media = document.createElement('img'); media.loading = 'lazy'; media.src = asset.thumbUrl; media.alt = `${index + 1}번째 카드`; }
    const caption = document.createElement('figcaption'); caption.textContent = String(index + 1);
    figure.append(media, caption); return figure;
  }

  function render() {
    const ready = Boolean(state.data);
    el('empty').hidden = ready; el('workspace').hidden = !ready;
    if (!ready) return;
    const posts = state.data.posts || []; const post = posts[state.activeIndex];
    el('issue-number').textContent = state.data.issueNumber;
    el('issue-title').textContent = state.data.title;
    el('post-count').textContent = `게시물 ${posts.length}개`;
    if (!post) { el('workspace').hidden = true; el('empty').hidden = false; el('empty').querySelector('strong').textContent = '배포된 게시물이 없습니다.'; return; }
    el('post-position').textContent = String(state.activeIndex + 1);
    el('post-title').textContent = categorizedTitle(post);
    el('post-body').textContent = bodyWithTitle(post);
    const rail = el('media-rail'); rail.replaceChildren(...post.assets.map((asset, index) => mediaFigure(asset, index, index === state.pasteIndex)));
    const imageAssets = images(post); const current = Math.min(state.pasteIndex, Math.max(0, imageAssets.length - 1));
    el('copy-next-image').disabled = imageAssets.length === 0;
    el('copy-next-image').textContent = imageAssets.length ? `${current + 1}번 복사` : '이미지 없음';
    el('paste-label').textContent = state.pasteIndex >= imageAssets.length && imageAssets.length ? '모든 이미지를 복사했습니다.' : '이미지 순차 복사';
    el('paste-help').textContent = imageAssets.length ? `${Math.min(state.pasteIndex, imageAssets.length)} / ${imageAssets.length} 완료 · 복사 후 SNS에서 Ctrl+V` : '이 글에는 복사할 이미지가 없습니다.';
    el('previous-post').disabled = state.activeIndex === 0;
    el('next-post').disabled = state.activeIndex >= posts.length - 1;
    el('pager-text').textContent = `${state.activeIndex + 1} / ${posts.length}`;
    updateUploadButton();
  }

  function platformForUrl(raw = '') {
    try {
      const host = new URL(raw).hostname.replace(/^www\./, '');
      if (host === 'instagram.com') return 'instagram';
      if (host === 'facebook.com' || host === 'web.facebook.com') return 'facebook';
      if (host === 'koreapas.com') return 'koreapas';
      if (host === 'everytime.kr') return 'everytime';
      if (host === 'x.com' || host === 'twitter.com') return 'x';
      if (host === 'youtube.com' || host === 'studio.youtube.com') return 'youtube';
    } catch { /* Unsupported tab. */ }
    return null;
  }

  async function refreshActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    state.tab = tab || null; state.platform = platformForUrl(tab?.url || '');
    const connected = Boolean(state.platform);
    el('site-dot').className = connected ? 'connected' : '';
    el('site-name').textContent = connected ? `${platformLabels[state.platform]} 탭 감지됨` : '지원 SNS를 열어 주세요';
    el('site-help').textContent = connected ? '작성창의 사진·파일 첨부 영역으로 원본을 전달합니다.' : 'Facebook · 고파스 · Instagram · YouTube · X · 에타';
    updateUploadButton();
  }

  function selectedAssets() {
    const post = state.data?.posts[state.activeIndex]; if (!post || !state.platform) return [];
    const source = state.platform === 'youtube' ? videos(post) : images(post);
    return state.platform === 'x' ? source.slice(0, 4) : state.platform === 'youtube' ? source.slice(0, 1) : source;
  }

  function updateUploadButton() {
    const button = el('inject-files');
    const count = selectedAssets().length;
    button.disabled = state.busy || !state.platform || !count;
    if (!state.platform) button.textContent = '지원 SNS 탭을 먼저 열어 주세요';
    else if (!count) button.textContent = state.platform === 'youtube' ? '이 글에는 영상이 없습니다' : '이 글에는 이미지가 없습니다';
    else button.textContent = `${platformLabels[state.platform]}에 원본 ${count}개 넣기${state.platform === 'x' && images(state.data.posts[state.activeIndex]).length > 4 ? ' (1–4번)' : ''}`;
  }

  async function copyText(text, message) {
    await navigator.clipboard.writeText(text); notify(message);
  }

  async function copyImage(asset) {
    const response = await fetch(asset.originalUrl, { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error('원본을 불러오지 못했습니다. 배포 링크를 다시 불러와 주세요.');
    const source = await response.blob(); const bitmap = await createImageBitmap(source);
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close();
    const png = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했습니다.')), 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  }

  async function copyNextImage() {
    const post = state.data.posts[state.activeIndex]; const list = images(post);
    if (!list.length) return;
    const index = state.pasteIndex >= list.length ? 0 : state.pasteIndex;
    try {
      el('copy-next-image').disabled = true; await copyImage(list[index]);
      state.pasteIndex = index + 1; await savePanelState(); render(); notify(`${index + 1}번 원본을 복사했습니다. SNS에서 Ctrl+V 하세요.`);
    } catch (error) { notify(error instanceof Error ? error.message : '이미지를 복사하지 못했습니다.'); render(); }
  }

  function makeJob() {
    const assets = selectedAssets();
    return {
      jobId: crypto.randomUUID(), target: state.platform, createdAt: Date.now(), caption: '',
      assets: assets.map((asset, order) => { const mimeType = asset.mimeType.toLowerCase(); return { order, url: asset.originalUrl, filename: `${state.platform === 'youtube' ? 'video' : 'card'}-${String(order + 1).padStart(2, '0')}.${extensionByMime[mimeType]}`, mimeType }; }),
    };
  }

  async function injectFiles() {
    if (!state.tab?.id || !state.platform) return;
    try {
      const job = makeJob(); const checked = api.validateJob(job); if (!checked.ok) throw checked.error;
      state.jobId = job.jobId; state.busy = true; updateUploadButton(); showUpload('SNS 작성창에 연결 중입니다.', '원본은 메모리에서만 준비됩니다.', 8);
      const response = await chrome.runtime.sendMessage({ type: 'PANEL_UPLOAD_REQUEST', payload: checked.value, targetTabId: state.tab.id });
      if (!response?.accepted) throw response?.error || new Error('SNS 전달을 시작하지 못했습니다.');
    } catch (error) {
      state.busy = false; updateUploadButton();
      const message = error?.userMessage || error?.message || 'SNS 전달을 시작하지 못했습니다.'; showUpload(message, error?.detail || '순차 복사를 사용해 주세요.', 0); notify(message);
    }
  }

  function showUpload(title, detail, percent) {
    const box = el('upload-status'); box.hidden = false; box.querySelector('b').textContent = title; box.querySelector('span').textContent = detail; box.querySelector('u').style.width = `${percent}%`;
  }

  function movePost(delta) {
    const next = Math.max(0, Math.min(state.activeIndex + delta, state.data.posts.length - 1));
    if (next === state.activeIndex) return;
    state.activeIndex = next; state.pasteIndex = 0; void savePanelState(); render();
  }

  el('version').textContent = `v${chrome.runtime.getManifest().version}`;
  el('link-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const input = el('distribution-link');
    try { await loadDistribution(input.value); }
    catch (error) { el('link-status').textContent = error.message; el('link-status').className = 'error'; }
  });
  el('refresh-site').addEventListener('click', refreshActiveTab);
  el('copy-title').addEventListener('click', () => copyText(categorizedTitle(state.data.posts[state.activeIndex]), 'SNS 제목을 복사했습니다.').catch(() => notify('제목을 복사하지 못했습니다.')));
  el('copy-koreapas').addEventListener('click', () => copyText(koreapasTitle(state.data.posts[state.activeIndex]), '고파스 제목을 복사했습니다.').catch(() => notify('제목을 복사하지 못했습니다.')));
  el('copy-body').addEventListener('click', () => copyText(bodyWithTitle(state.data.posts[state.activeIndex]), '제목과 본문을 복사했습니다.').catch(() => notify('본문을 복사하지 못했습니다.')));
  el('copy-next-image').addEventListener('click', copyNextImage);
  el('inject-files').addEventListener('click', injectFiles);
  el('previous-post').addEventListener('click', () => movePost(-1));
  el('next-post').addEventListener('click', () => movePost(1));

  chrome.tabs.onActivated.addListener(refreshActiveTab);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => { if (tabId === state.tab?.id && (changeInfo.url || changeInfo.status === 'complete')) void refreshActiveTab(); });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'PANEL_EVENT' || message.event?.payload?.jobId !== state.jobId) return;
    const { type, payload } = message.event;
    if (type === 'SNS_UPLOAD_PROGRESS') {
      const percent = payload.total ? Math.round((payload.current / payload.total) * 65) + 10 : payload.state === 'INJECTING' ? 82 : payload.state === 'VERIFYING' ? 92 : 12;
      showUpload(payload.userMessage || '진행 중입니다.', '최종 게시 버튼은 직접 눌러 주세요.', percent);
    }
    if (type === 'SNS_UPLOAD_COMPLETE') { state.busy = false; showUpload(payload.userMessage || '원본 전달 완료', '내용을 확인하고 게시 버튼을 직접 눌러 주세요.', 100); updateUploadButton(); notify('원본 전달을 마쳤습니다.'); }
    if (type === 'SNS_UPLOAD_ERROR') { state.busy = false; showUpload(payload.userMessage || '전달하지 못했습니다.', '순차 복사를 사용해 주세요.', 0); updateUploadButton(); }
  });

  void (async () => {
    await refreshActiveTab();
    const stored = await chrome.storage.session.get(['panelState', 'pendingDistributionLink']);
    const pending = stored.pendingDistributionLink; const saved = stored.panelState;
    if (pending) await chrome.storage.session.remove('pendingDistributionLink');
    const link = pending || saved?.link;
    if (!link) return;
    state.activeIndex = saved?.activeIndex || 0; state.pasteIndex = saved?.pasteIndex || 0; el('distribution-link').value = link;
    try { await loadDistribution(link, true); }
    catch (error) { el('link-status').textContent = error.message; el('link-status').className = 'error'; }
  })();
})();
