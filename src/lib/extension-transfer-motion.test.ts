import { Window, type HTMLElement } from 'happy-dom';
import { describe, expect, it, vi } from 'vitest';
import { createTransferMotion } from '../../extension/sidepanel/transfer-motion.mjs';

function setup(reduced = false) {
  const window = new Window(); const document = window.document;
  document.body.innerHTML = '<header class="brand"></header><main><div class="link-card"></div><section id="workspace"><div class="issue"></div><div class="site-card"></div><article class="post-card"><div id="media-rail"><figure><img><figcaption>1</figcaption></figure><figure><img><figcaption>2</figcaption></figure><figure><img><figcaption>3</figcaption></figure></div></article><nav class="pager"></nav></section></main>';
  Object.defineProperties(document.documentElement, { clientWidth: { value: 300 }, clientHeight: { value: 700 } });
  const rect = (left: number, width: number) => ({ left, right: left + width, top: 300, bottom: 418, width, height: 118 });
  Object.assign(document.querySelector('#media-rail')!, { getBoundingClientRect: () => rect(0, 300) });
  document.querySelectorAll('figure').forEach((figure, index) => Object.assign(figure, { getBoundingClientRect: () => rect(20 + index * 102, 94) }));
  document.querySelectorAll('img').forEach(img => Object.defineProperties(img, { naturalWidth: { value: 400 }, naturalHeight: { value: 500 } }));
  const drawImage = vi.fn(); Object.assign(window.HTMLCanvasElement.prototype, { getContext: () => ({ drawImage }) });
  const animations: { element: HTMLElement; cancel: ReturnType<typeof vi.fn>; finish: () => void }[] = [];
  Object.assign(window.HTMLElement.prototype, {
    getAnimations: () => [],
    animate(this: HTMLElement) {
      let finish!: () => void; const finished = new Promise<void>(resolve => { finish = resolve; });
      const cancel = vi.fn(finish); animations.push({ element: this, cancel, finish });
      return { finished, cancel };
    },
  });
  return { window, document, animations, drawImage, motion: createTransferMotion(document, { reducedMotion: () => reduced }) };
}

describe('thumbnail departure and next-post arrival', () => {
  it('보이는 썸네일 두 장만 사본으로 날리고 원본 이미지나 파일 요청을 추가하지 않는다', async () => {
    const { window, document, animations, drawImage, motion } = setup(); motion.play('sending');
    expect(document.querySelectorAll('.media-flight')).toHaveLength(2);
    expect(document.querySelectorAll('img')).toHaveLength(3);
    expect(drawImage).toHaveBeenCalledTimes(2);
    expect(animations.filter(item => item.element.className === 'media-flight')).toHaveLength(2);
    expect(document.querySelector('.media-flight-layer')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelectorAll('#media-rail .transfer-away')).toHaveLength(3);
    animations.forEach(item => item.finish()); await Promise.resolve();
    expect(document.querySelector('.media-flight-layer')).toBeNull();
    expect(document.querySelectorAll('#media-rail .transfer-away')).toHaveLength(3);
    motion.stop();
    await window.close();
  });
  it('글 입력이나 패널 표면에 꿀렁 모션을 실행하지 않는다', async () => {
    const { window, animations, motion } = setup(); motion.play('text');
    expect(animations).toHaveLength(0);
    expect(animations.some(item => ['BODY', 'NAV', 'SECTION'].includes(item.element.tagName))).toBe(false);
    motion.stop(); expect(animations.every(item => item.cancel.mock.calls.length === 1)).toBe(true);
    await window.close();
  });
  it('실패·취소에서 비행 사본과 동작 중 모션을 모두 정리한다', async () => {
    const { window, document, animations, motion } = setup(); motion.play('sending'); motion.stop();
    expect(document.querySelector('.media-flight-layer')).toBeNull();
    expect(animations.every(item => item.cancel.mock.calls.length === 1)).toBe(true);
    expect(document.querySelectorAll('#media-rail figure')).toHaveLength(3);
    expect(document.querySelector('.transfer-away')).toBeNull();
    await window.close();
  });
  it('모션 감소나 입력 전 상태에서는 썸네일 비행·등장 모션을 실행하지 않는다', async () => {
    const first = setup(true); first.motion.play('sending'); first.motion.play('text');
    expect(first.animations).toHaveLength(0); expect(first.document.querySelector('canvas')).toBeNull();
    await first.window.close();
    const second = setup(); second.motion.play('preparing'); second.motion.play('complete');
    expect(second.animations).toHaveLength(0); await second.window.close();
  });
  it('기존 이미지 비행이 끝난 뒤 새 글 이미지만 빈자리에서 튀어나온다', async () => {
    const { window, document, animations, motion } = setup(); motion.play('sending');
    document.querySelector('#media-rail')!.innerHTML = '<figure><img alt="다음 글"><figcaption>1</figcaption></figure>';
    const next = document.querySelector('#media-rail figure')!;
    Object.assign(next, { getBoundingClientRect: () => ({ left: 20, right: 114, top: 300, bottom: 418, width: 94, height: 118 }) });
    const arriving = motion.arrive();
    expect(next.classList.contains('transfer-away')).toBe(true);
    expect(animations).toHaveLength(2);
    animations.slice().forEach(item => item.finish()); await arriving;
    expect(next.classList.contains('transfer-away')).toBe(false);
    expect(animations).toHaveLength(3);
    expect(animations[2].element).toBe(next);
    expect(document.querySelector('.media-flight-layer')).toBeNull();
    motion.stop(); await window.close();
  });
  it('등장 대기 중 취소·글 이동은 지연된 모션을 재생하지 않고 새 썸네일을 복구한다', async () => {
    const { window, document, animations, motion } = setup(); motion.play('sending');
    const arriving = motion.arrive(); motion.stop(); await arriving;
    expect(animations).toHaveLength(2);
    expect(document.querySelector('.transfer-away')).toBeNull();
    await window.close();
  });
  it('썸네일이 아직 디코딩되지 않아도 전송을 방해하거나 예외를 전파하지 않는다', async () => {
    const { window, document, motion } = setup();
    Object.assign(window.HTMLCanvasElement.prototype, { getContext: () => { throw new Error('thumbnail not ready'); } });
    expect(() => motion.play('sending')).not.toThrow();
    expect(document.querySelectorAll('.media-flight')).toHaveLength(2);
    motion.stop(); await window.close();
  });
});
