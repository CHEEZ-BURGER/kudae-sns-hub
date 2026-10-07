import { postBody } from '../shared/post-content.mjs';
import { uploadContent, nextPostAfterTransfer } from '../shared/upload-content.mjs';
import { transferFeedback, transferPercent } from './transfer-feedback.mjs';
import { createTransferMotion } from './transfer-motion.mjs';

(() => {
  const api = globalThis.KudaeSNS;
  const config = globalThis.KudaeSNSConfig || {};
  const el = (id) => document.getElementById(id);
  const motion = createTransferMotion(document, { reducedMotion: () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches });
  const state = { link: '', data: null, activeIndex: 0, pasteIndex: 0, tab: null, platform: null, jobId: '', busy: false, pending: null };
  const platformLabels = api.TARGET_LABELS;
  const extensionByMime = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v' };
  function notify(message) {
    const status = el('operation-status');
    status.hidden = false;
    status.textContent = message;
    status.className = /못|실패|오류|없/u.test(message) ? 'operation-status error' : 'operation-status active';
  }

  function showRefreshGate(reason) {
    el('refresh-reason').textContent = reason || '확장이 업데이트되었거나 SNS 연결 코드가 아직 적용되지 않았습니다.';
    el('refresh-gate').hidden = false;
  }

  function hideRefreshGate() {
    el('refresh-gate').hidden = true;
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
    if (state.busy) throw new Error('전달 중에는 배포 링크를 변경할 수 없습니다. 완료하거나 취소해 주세요.');
    const token = parseDistributionLink(link);
    if (!token) throw new Error('고대신문 배포 링크 형식이 아닙니다. 카카오톡 링크 전체를 붙여 넣어 주세요.');
    if (!config.supabaseUrl || !config.publishableKey) throw new Error('배포 연결 설정이 없는 개발용 ZIP입니다. 공개 페이지에서 최신 확장을 다시 받아 주세요.');
    if (!quiet) { el('link-status').textContent = '배포 자료를 불러오는 중입니다…'; el('link-status').className = ''; }
    const response = await fetch(`${config.supabaseUrl}/functions/v1/public-distribution`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.publishableKey }, body: JSON.stringify({ action: 'read', token }), credentials: 'omit', cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '배포 정보를 불러오지 못했습니다.');
    motion.stop(); state.link = link.trim(); state.data = payload; state.activeIndex = Math.min(state.activeIndex, Math.max(0, payload.posts.length - 1)); state.pasteIndex = 0;
    el('distribution-link').value = state.link; el('link-status').textContent = ''; el('link-status').className = '';
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
    el('workspace').hidden = !ready;
    if (!ready) return;
    const posts = state.data.posts || []; const post = posts[state.activeIndex];
    el('issue-title').textContent = state.data.title;
    el('post-count').textContent = `게시물 ${posts.length}개`;
    if (!post) { el('workspace').hidden = true; el('link-status').textContent = '배포된 게시물이 없습니다. 다른 배포 링크를 불러와 주세요.'; return; }
    el('post-position').textContent = String(state.activeIndex + 1);
    el('post-title').textContent = categorizedTitle(post);
    el('post-body').textContent = bodyWithTitle(post);
    const rail = el('media-rail'); rail.replaceChildren(...post.assets.map((asset, index) => mediaFigure(asset, index, index === state.pasteIndex)));
    const imageAssets = images(post); const current = Math.min(state.pasteIndex, Math.max(0, imageAssets.length - 1));
    el('copy-next-image').disabled = imageAssets.length === 0;
    el('copy-next-image').textContent = imageAssets.length ? `${current + 1}번 복사` : '이미지 없음';
    el('paste-label').textContent = state.pasteIndex >= imageAssets.length && imageAssets.length ? '모든 이미지를 복사했습니다.' : '이미지 순차 복사';
    el('paste-help').textContent = imageAssets.length ? `${Math.min(state.pasteIndex, imageAssets.length)} / ${imageAssets.length} 완료 · 복사 후 SNS에서 Ctrl+V` : '이 글에는 복사할 이미지가 없습니다.';
    el('previous-post').disabled = state.busy || state.activeIndex === 0;
    el('next-post').disabled = state.busy || state.activeIndex >= posts.length - 1;
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
    if (connected && tab?.id && tab.status === 'complete') {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'KUDAE_CONTEXT_PING' });
        if (response?.feature !== 'one-click-v1') showRefreshGate(`${platformLabels[state.platform]} 탭에 이미지 + 글 자동 입력 기능을 적용해야 합니다.`);
      }
      catch { showRefreshGate(`${platformLabels[state.platform]} 탭에 최신 연결 기능을 적용해야 합니다.`); }
    }
    updateUploadButton();
  }

  function selectedAssets() {
    const post = state.data?.posts[state.activeIndex]; if (!post || !state.platform) return [];
    if (state.platform === 'youtube') {
      const studio = (() => { try { return new URL(state.tab?.url || '').hostname === 'studio.youtube.com'; } catch { return false; } })();
      return studio ? videos(post) : images(post);
    }
    const source = images(post);
    return source;
  }

  function updateUploadButton() {
    const button = el('inject-files');
    const count = selectedAssets().length;
    button.disabled = state.busy || !state.platform || !count;
    let label; let context;
    if (!state.platform) { label = 'SNS 작성창을 먼저 열어 주세요'; context = 'Facebook · 고파스 · Instagram · YouTube · X · 에타'; }
    else if (!count) { label = state.platform === 'youtube' && state.tab?.url?.includes('studio.youtube.com') ? '이 글에는 영상이 없습니다' : '이 글에는 이미지가 없습니다'; context = '다른 글을 선택하거나 글 복사를 이용해 주세요'; }
    else {
      if (state.platform === 'youtube') label = state.tab?.url?.includes('studio.youtube.com') ? '영상 + 제목·설명 넣기' : 'YouTube 게시물에 이미지 + 글 넣기';
      else label = `이미지 + ${['koreapas','everytime'].includes(state.platform)?'제목·본문':'글'} 한 번에 넣기`;
      context = `${platformLabels[state.platform]} · 원본 ${count}개 · 다음 글 자동 이동`;
      if (state.busy) label = '원본과 글을 전달하고 있어요';
    }
    el('inject-label').textContent = label; el('inject-context').textContent = context;
    button.setAttribute('aria-label', `${label}. ${context}`);
    document.querySelectorAll('[data-upload-target]').forEach((button) => { button.disabled = state.busy || !state.data; });
    el('cancel-upload').hidden = !state.busy;
    el('previous-post').disabled = state.busy || state.activeIndex === 0;
    el('next-post').disabled = state.busy || state.activeIndex >= (state.data?.posts.length || 0) - 1;
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
    const post = state.data.posts[state.activeIndex];
    if (assets.length !== post.assets.length) throw new Error('영상과 이미지가 섞여 있어 일부만 전달할 수 없습니다. 원본 다운로드를 이용해 주세요.');
    const studio = state.platform === 'youtube' && state.tab?.url?.includes('studio.youtube.com');
    return {
      jobId: crypto.randomUUID(), target: state.platform, createdAt: Date.now(), ...uploadContent(post, state.platform, studio),
      assets: assets.map((asset, order) => { const mimeType = asset.mimeType.toLowerCase(); return { order, url: asset.originalUrl, filename: `${mimeType.startsWith('video/') ? 'video' : 'card'}-${String(order + 1).padStart(2, '0')}.${extensionByMime[mimeType]}`, mimeType }; }),
    };
  }

  async function injectFiles(target, studio = false) {
    if (state.busy) return;
    if (target) {
      const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
      const matches = tabs.filter((tab) => platformForUrl(tab.url) === target && (target !== 'youtube' || tab.url?.includes('studio.youtube.com') === studio));
      const tab = matches.find((tab) => tab.active) || matches.at(-1);
      if (!tab?.id) { notify(`${platformLabels[target]} 작성창을 먼저 열어 주세요.`); return; }
      state.tab = tab; state.platform = target; await chrome.tabs.update(tab.id, { active: true });
    }
    if (!state.tab?.id || !state.platform) return;
    try {
      const job = makeJob(); const checked = api.validateJob(job); if (!checked.ok) throw checked.error;
      state.jobId = job.jobId; state.pending = { jobId:job.jobId, index:state.activeIndex, postId:state.data.posts[state.activeIndex].id, count:job.assets.length };
      state.busy = true; updateUploadButton(); showUpload('SNS 작성창에 연결 중입니다.', '원본과 글을 준비하고 있어요.', 8, 'QUEUED', job.assets.length);
      const response = await chrome.runtime.sendMessage({ type: 'PANEL_UPLOAD_REQUEST', payload: checked.value, targetTabId: state.tab.id });
      if (!response?.accepted) throw response?.error || new Error('SNS 전달을 시작하지 못했습니다.');
    } catch (error) {
      state.busy = false; state.pending = null; state.jobId = ''; updateUploadButton();
      const message = error?.userMessage || error?.message || 'SNS 전달을 시작하지 못했습니다.'; showUpload(message, error?.detail || '순차 복사를 사용해 주세요.', 0, 'ERROR'); notify(message);
      if (/새로고침|Extension context invalidated/u.test(`${message} ${error?.detail || ''}`)) showRefreshGate(message);
    }
  }

  function showUpload(title, detail, percent, jobState = 'QUEUED', count = state.pending?.count || 0) {
    const box = el('upload-status'); const feedback = transferFeedback(jobState);
    const previousPhase = box.dataset.phase; const sameJob = box.dataset.jobId === state.jobId;
    const terminal = ['complete','error','cancelled'].includes(feedback.phase);
    const progress = el('upload-progress');
    const bounded = Math.max(0, Math.min(terminal ? 100 : 99, percent));
    const shown = sameJob && !terminal ? Math.max(Number(progress.getAttribute('aria-valuenow')) || 0, bounded) : bounded;
    if (['error','cancelled'].includes(feedback.phase)) motion.stop();
    box.hidden = false; box.dataset.phase = feedback.phase; box.dataset.jobId = state.jobId;
    el('upload-title').textContent = title; el('upload-detail').textContent = detail;
    el('transfer-icon').setAttribute('href', `#icon-${feedback.icon}`);
    el('transfer-count').textContent = count ? `원본 ${count}개` : '원본';
    progress.setAttribute('aria-valuenow', String(shown)); progress.querySelector('i').style.width = `${shown}%`;
    if (previousPhase !== feedback.phase) motion.play(feedback.phase);
  }

  function movePost(delta) {
    if (state.busy) return;
    const next = Math.max(0, Math.min(state.activeIndex + delta, state.data.posts.length - 1));
    if (next === state.activeIndex) return;
    motion.stop(); state.activeIndex = next; state.pasteIndex = 0; void savePanelState(); render();
  }

  el('version').textContent = `v${chrome.runtime.getManifest().version}`;
  el('link-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const input = el('distribution-link');
    try { await loadDistribution(input.value); }
    catch (error) { el('link-status').textContent = error.message; el('link-status').className = 'error'; }
  });
  el('refresh-site').addEventListener('click', refreshActiveTab);
  el('dismiss-refresh').addEventListener('click', hideRefreshGate);
  el('reload-current-site').addEventListener('click', async () => {
    try {
      if (!state.tab?.id) await refreshActiveTab();
      if (!state.tab?.id) throw new Error('새로고침할 SNS 탭을 찾지 못했습니다.');
      await chrome.tabs.reload(state.tab.id);
      hideRefreshGate(); notify('SNS 페이지를 새로고침했습니다. 연결을 다시 확인합니다.');
      setTimeout(() => void refreshActiveTab(), 1200);
    } catch (error) { notify(error instanceof Error ? error.message : 'SNS 페이지를 새로고침하지 못했습니다.'); }
  });
  el('copy-title').addEventListener('click', () => copyText(categorizedTitle(state.data.posts[state.activeIndex]), 'SNS 제목을 복사했습니다.').catch(() => notify('제목을 복사하지 못했습니다.')));
  el('copy-koreapas').addEventListener('click', () => copyText(koreapasTitle(state.data.posts[state.activeIndex]), '고파스 제목을 복사했습니다.').catch(() => notify('제목을 복사하지 못했습니다.')));
  el('copy-body-only').addEventListener('click', () => copyText(postBody(state.data.posts[state.activeIndex]), '제목을 제외한 본문을 복사했습니다.').catch(() => notify('본문을 복사하지 못했습니다.')));
  el('copy-body').addEventListener('click', () => copyText(bodyWithTitle(state.data.posts[state.activeIndex]), '제목과 본문을 복사했습니다.').catch(() => notify('본문을 복사하지 못했습니다.')));
  el('copy-next-image').addEventListener('click', copyNextImage);
  el('inject-files').addEventListener('click', () => void injectFiles());
  document.querySelectorAll('[data-upload-target]').forEach((button) => button.addEventListener('click', () => {
    void injectFiles(button.dataset.uploadTarget, button.dataset.studio === 'true').catch((error) => notify(error.message || 'SNS 연결에 실패했습니다.'));
  }));
  el('cancel-upload').addEventListener('click', () => {
    const jobId=state.jobId; state.jobId='';state.pending=null;state.busy=false;updateUploadButton();
    showUpload('전달을 취소했습니다. 현재 글을 유지합니다.', 'SNS에 이미 들어간 내용은 직접 확인해 주세요.', 0, 'CANCELLED');
    if(jobId) void chrome.runtime.sendMessage({type:'SNS_UPLOAD_CANCEL',jobId}).catch(()=>notify('취소 요청을 전달하지 못했습니다. SNS 작성창을 확인해 주세요.'));
  });
  el('previous-post').addEventListener('click', () => movePost(-1));
  el('next-post').addEventListener('click', () => movePost(1));

  chrome.tabs.onActivated.addListener(refreshActiveTab);
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => { if (tabId === state.tab?.id && (changeInfo.url || changeInfo.status === 'complete')) void refreshActiveTab(); });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'PANEL_EVENT' || message.event?.payload?.jobId !== state.jobId) return;
    const { type, payload } = message.event;
    if (type === 'SNS_UPLOAD_PROGRESS') {
      const percent = transferPercent(payload);
      showUpload(payload.userMessage || '진행 중입니다.', '최종 게시 버튼은 직접 눌러 주세요.', percent, payload.state);
      if (/새로고침/u.test(payload.userMessage || '')) showRefreshGate(payload.userMessage);
    }
    if (type === 'SNS_UPLOAD_COMPLETE') {
      const next = nextPostAfterTransfer(state.activeIndex, state.data.posts.length, state.pending && { ...state.pending, currentPostId:state.data.posts[state.activeIndex].id }, { type,payload });
      const complete = payload.contentInserted === true && payload.count === state.pending?.count && payload.postId === state.pending?.postId;
      state.busy = false; state.pending = null; state.jobId = '';
      if (complete) {
        const moved = next !== state.activeIndex; state.activeIndex = next; state.pasteIndex = 0; void savePanelState(); render();
        if (moved) void motion.arrive(); else motion.stop();
        showUpload(payload.userMessage || '이미지 + 글 입력 완료', 'SNS 내용을 확인하고 최종 게시 버튼은 직접 눌러 주세요.', 100, 'COMPLETE', payload.count);
        notify(moved ? '이미지와 글을 넣었습니다. 다음 글로 이동했습니다.' : '마지막 글까지 입력했습니다. SNS에서 최종 게시해 주세요.');
      } else { showUpload('전달 결과를 확인하지 못했습니다.', '현재 글을 유지합니다. SNS 작성창을 확인해 주세요.', 0, 'ERROR'); updateUploadButton(); }
    }
    if (type === 'SNS_UPLOAD_ERROR') { state.busy = false; state.pending = null; state.jobId = ''; showUpload(payload.userMessage || '전달하지 못했습니다.', '현재 글을 유지합니다. 작성창을 확인한 뒤 다시 시도해 주세요.', 0, 'ERROR'); updateUploadButton(); }
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
