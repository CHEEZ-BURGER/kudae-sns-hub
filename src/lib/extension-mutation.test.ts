import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';

function setup() {
  const window = new Window();
  const context: Record<string, unknown> = {
    document: window.document, MutationObserver: window.MutationObserver,
    DOMException, setTimeout, clearTimeout,
  };
  runInNewContext(readFileSync(new URL('../../extension/content/sns-base.js', import.meta.url), 'utf8'), context);
  return { window, wait: (context.KudaeSNS as any).waitForMutation as (test: () => unknown, timeout: number, signal?: AbortSignal) => Promise<unknown> };
}

describe('SNS attachment readiness observer', () => {
  it('이미 존재하는 미리보기의 src가 뒤늦게 채워져도 감지한다', async () => {
    const { window, wait } = setup();
    const preview = window.document.createElement('img');
    window.document.body.append(preview);
    const pending = wait(() => preview.getAttribute('src'), 1_000);
    preview.setAttribute('src', 'blob:facebook/original-preview');
    await expect(pending).resolves.toBe('blob:facebook/original-preview');
    await window.close();
  });

  it('영상 poster와 가시성 변경도 감지한다', async () => {
    const { window, wait } = setup();
    const preview = window.document.createElement('video');
    preview.style.display = 'none'; window.document.body.append(preview);
    const pending = wait(() => preview.style.display !== 'none' && preview.getAttribute('poster'), 1_000);
    preview.setAttribute('poster', 'blob:facebook/video-poster');
    preview.style.display = 'block';
    await expect(pending).resolves.toBe('blob:facebook/video-poster');
    await window.close();
  });

  it('이미 취소된 작업은 대기하지 않는다', async () => {
    const { window, wait } = setup();
    const controller = new AbortController(); controller.abort();
    await expect(wait(() => false, 1_000, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await window.close();
  });

  it('대기 중 취소와 미리보기 미확인 시간 초과를 구분한다', async () => {
    const { window, wait } = setup();
    const controller = new AbortController();
    const aborted = wait(() => false, 1_000, controller.signal); controller.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    await expect(wait(() => false, 10)).rejects.toThrow('timeout');
    await window.close();
  });
});
