import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window, type HTMLElement } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { postBody } from '../../extension/shared/post-content.mjs';
import { uploadContent, nextPostAfterTransfer } from '../../extension/shared/upload-content.mjs';
import { transferFeedback, transferPercent } from '../../extension/sidepanel/transfer-feedback.mjs';
import { createTransferMotion } from '../../extension/sidepanel/transfer-motion.mjs';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const element = (window: Window, id: string) => window.document.querySelector<HTMLElement>(`#${id}`)!;
const link = 'https://cheez-burger.github.io/kudae-sns-hub/#/d/abcdefghijklmnopqrstuvwx1234';
const asset = { id: 'a', mimeType: 'image/png', originalUrl: 'https://bcqqokdehkfaiuquktag.supabase.co/storage/v1/object/public/fixture/original.png', thumbUrl: '', position: 0 };
const data = { issueNumber: '2050호', title: '2050호 카드뉴스 (水)', posts: Array.from({ length: 4 }, (_, index) => ({ id: `post-${index}`, category: '보도', title: `기사 ${index + 1}`, body: '첫 문단\n\n두 번째 문단\n\n글 | 기자', assets: [asset, { ...asset, id: 'b' }] })) };

async function setup(posts = data.posts, reduced = false) {
  const window = new Window({ settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  window.document.documentElement.innerHTML = read('extension/sidepanel/index.html');
  const sent: { payload?: { jobId: string; postId: string }; type: string }[] = [];
  const listeners: ((message: object) => void)[] = [];
  const motionEvents: string[] = [];
  const context: Record<string, unknown> = {
    document: window.document, navigator: window.navigator, URL, Date, crypto, setTimeout, clearTimeout,
    postBody, uploadContent, nextPostAfterTransfer, transferFeedback, transferPercent,
    createTransferMotion: (document: object, options: { reducedMotion: () => boolean }) => {
      const motion = createTransferMotion(document, options);
      return {
        play: (phase: string) => { motionEvents.push(phase); motion.play(phase); },
        stop: () => motion.stop(),
        arrive: () => { motionEvents.push('arrive'); return motion.arrive(); },
      };
    },
    matchMedia: () => ({ matches: reduced }),
    fetch: async () => ({ ok: true, json: async () => ({ ...data, posts }) }),
    KudaeSNSConfig: { supabaseUrl: 'https://preview.invalid', publishableKey: 'fixture' },
    chrome: {
      storage: { session: { get: async () => ({ panelState: { link, activeIndex: 0 } }), set: async () => {}, remove: async () => {} } },
      tabs: { query: async () => [{ id: 1, active: true, status: 'complete', url: 'https://www.facebook.com/post/create' }], sendMessage: async () => ({ feature: 'one-click-v1' }), onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
      runtime: { getManifest: () => ({ version: '2.3.2' }), sendMessage: async (message: typeof sent[number]) => { sent.push(message); return { accepted: true }; }, onMessage: { addListener: (listener: typeof listeners[number]) => listeners.push(listener) } },
    },
  };
  for (const path of ['shared/constants.js', 'shared/validators.js']) runInNewContext(read(`extension/${path}`), context);
  runInNewContext(read('extension/sidepanel/sidepanel.js').replace(/^import .*;\r?\n/gm, ''), context);
  for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 1));
  const send = (type: string, payload: object) => listeners.forEach(listener => listener({ type: 'PANEL_EVENT', event: { type, payload } }));
  const start = async () => {
    element(window, 'inject-files').click();
    for (let i = 0; i < 10 && !sent.some(message => message.type === 'PANEL_UPLOAD_REQUEST'); i++) await new Promise(resolve => setTimeout(resolve, 1));
    return sent.find(message => message.type === 'PANEL_UPLOAD_REQUEST')!.payload!;
  };
  return { window, send, start, motionEvents };
}

describe('extension panel feedback and verified next-post flow', () => {
  it('불필요한 안내 박스의 DOM·스크립트·스타일을 모두 제거한다', () => {
    expect(read('extension/sidepanel/index.html')).not.toContain('id="empty"');
    expect(read('extension/sidepanel/sidepanel.js')).not.toContain("el('empty')");
    expect(read('extension/sidepanel/style.css')).not.toContain('.empty');
    expect(read('extension/sidepanel/style.css')).toContain('[hidden] { display: none !important; }');
    expect(read('extension/sidepanel/index.html')).not.toMatch(/STEP|게시물 준비|현재 SNS 연결|준비됨/);
    expect(read('extension/sidepanel/style.css')).not.toContain('.workspace-heading');
  });
  it('선택 테두리를 썸네일 안쪽에 그리고 기본 입력 버튼을 확대한다', () => {
    const css = read('extension/sidepanel/style.css');
    expect(css).toMatch(/figure\.current::after[^}]*inset: 0;[^}]*border: 3px solid/);
    expect(css).not.toContain('outline-offset: 2px');
    expect(css).toMatch(/\.primary-action[^}]*min-height: 74px/);
  });
  it('헤더 영문 부제를 제거하고 로고·카드 곡률을 소폭 줄인다', async () => {
    const { window } = await setup();
    expect(window.document.querySelector('.brand span')).toBeNull();
    expect(window.document.querySelector('.brand')!.textContent).not.toContain('The Korea');
    const css = read('extension/sidepanel/style.css');
    expect(css).toMatch(/\.brand-mark\s*\{[^}]*width: 36px;[^}]*height: 36px;/);
    expect(css).toMatch(/\.link-card,\s*\.post-card,\s*\.site-card\s*\{[^}]*border-radius: 15px;/);
    await window.close();
  });
  it('큰 입력 버튼에서 모든 아이콘을 제거하고 전송 전 상태 카드는 숨긴다', async () => {
    const { window } = await setup();
    expect(element(window, 'workspace').hidden).toBe(false);
    expect(element(window, 'upload-status').hidden).toBe(true);
    expect(window.document.querySelector('#inject-files svg')).toBeNull();
    expect(window.document.getElementById('inject-context')!.textContent).toContain('Facebook · 원본 2개');
    await window.close();
  });
  it('비어 있는 배포는 제거한 안내 박스 대신 링크 영역에 짧게 안내한다', async () => {
    const { window } = await setup([]);
    expect(element(window, 'workspace').hidden).toBe(true);
    expect(window.document.getElementById('link-status')!.textContent).toContain('배포된 게시물이 없습니다');
    await window.close();
  });
  it('실제 전달 단계에만 이미지·글 모션을 보내며 검증된 완료 후 즉시 다음 글로 간다', async () => {
    const { window, send, start, motionEvents } = await setup();
    const animations: object[] = [];
    window.document.querySelectorAll('.brand, .link-card, .issue, .site-card, .post-card').forEach(item => {
      Object.assign(item, { animate: (_frames: object, options: object) => { animations.push(options); return { cancel() {} }; }, getAnimations: () => [] });
    });
    const job = await start();
    send('SNS_UPLOAD_PROGRESS', { jobId: job.jobId, state: 'INJECTING', userMessage: '사진 전달 중' });
    expect(element(window, 'upload-status').dataset.phase).toBe('sending');
    expect(animations).toHaveLength(0);
    expect(motionEvents.filter(phase => phase === 'sending')).toHaveLength(1);
    send('SNS_UPLOAD_PROGRESS', { jobId: job.jobId, state: 'INJECTING' });
    expect(animations).toHaveLength(0);
    expect(motionEvents.filter(phase => phase === 'sending')).toHaveLength(1);
    send('SNS_UPLOAD_PROGRESS', { jobId: job.jobId, state: 'WAITING_FOR_TEXT_INPUT' });
    expect(animations).toHaveLength(0);
    expect(window.document.getElementById('pager-text')!.textContent).toBe('1 / 4');
    send('SNS_UPLOAD_COMPLETE', { jobId: job.jobId, postId: job.postId, count: 2, contentInserted: true });
    expect(window.document.getElementById('pager-text')!.textContent).toBe('2 / 4');
    expect(element(window, 'upload-status').dataset.phase).toBe('complete');
    expect(window.document.getElementById('transfer-icon')!.getAttribute('href')).toBe('#icon-check');
    expect(window.document.getElementById('upload-progress')!.getAttribute('aria-valuenow')).toBe('100');
    expect(motionEvents.filter(phase => phase === 'arrive')).toHaveLength(1);
    await window.close();
  });
  it('전달 실패·수량 불일치는 경고 아이콘을 보이고 현재 글에 머문다', async () => {
    const { window, send, start, motionEvents } = await setup(); const job = await start();
    send('SNS_UPLOAD_COMPLETE', { jobId: job.jobId, postId: job.postId, count: 1, contentInserted: true });
    expect(window.document.getElementById('pager-text')!.textContent).toBe('1 / 4');
    expect(element(window, 'upload-status').dataset.phase).toBe('error');
    expect(window.document.getElementById('transfer-icon')!.getAttribute('href')).toBe('#icon-alert');
    expect(motionEvents).not.toContain('arrive');
    await window.close();
  });
  it('모션 감소 설정에서는 비행 모션을 실행하지 않는다', async () => {
    const { window, send, start } = await setup(data.posts, true); let animated = false;
    window.document.querySelectorAll('.brand, .post-card').forEach(item => Object.assign(item, { animate: () => { animated = true; return { cancel() {} }; }, getAnimations: () => [] }));
    const job = await start(); send('SNS_UPLOAD_PROGRESS', { jobId: job.jobId, state: 'INJECTING' });
    expect(animated).toBe(false); expect(element(window, 'upload-status').dataset.phase).toBe('sending');
    await window.close();
  });
  it('상태 아이콘과 진행률은 실제 작업 상태를 따르고 진행 이벤트로 완료를 꾸미지 않는다', () => {
    expect(transferFeedback('INJECTING')).toMatchObject({ phase: 'sending', icon: 'image' });
    expect(transferFeedback('WAITING_FOR_TEXT_INPUT')).toMatchObject({ phase: 'text', icon: 'text' });
    expect(transferFeedback('VERIFYING')).toMatchObject({ phase: 'verifying', icon: 'loader' });
    expect(transferFeedback('ERROR').icon).toBe('alert');
    expect(transferFeedback('CANCELLED').icon).toBe('pause');
    expect(transferPercent({ state: 'FETCHING', current: 999, total: 2 })).toBe(75);
    expect(transferPercent({ state: 'VERIFYING', current: 2, total: 2 })).toBe(92);
    expect(transferFeedback('unknown').phase).not.toBe('complete');
  });
});
