import { describe, expect, it } from 'vitest';
import type { DistributionAsset } from '../types';
import { buildPlatformBatches, platformNotice } from './platform-share';

function asset(index: number, mimeType = 'image/png'): DistributionAsset {
  return { id: String(index), filename: `${index}.${mimeType.startsWith('video/') ? 'mp4' : 'png'}`, sizeBytes: 1, mimeType, thumbUrl: '', originalUrl: '', position: index };
}

describe('플랫폼별 모바일 공유 묶음', () => {
  it('X 이미지를 최대 4장씩 순서대로 나눈다', () => {
    const batches = buildPlatformBatches('x', Array.from({ length: 10 }, (_, index) => asset(index)));
    expect(batches.map((batch) => batch.assetIndexes)).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
    expect(platformNotice('x', Array.from({ length: 10 }, (_, index) => asset(index)))).toContain('3개 묶음');
  });

  it('인스타 이미지를 최대 10장씩 나눈다', () => {
    const batches = buildPlatformBatches('instagram', Array.from({ length: 12 }, (_, index) => asset(index)));
    expect(batches).toHaveLength(2);
    expect(batches[0].assetIndexes).toHaveLength(10);
    expect(batches[1].assetIndexes).toHaveLength(2);
  });

  it('유튜브에서는 이미지를 제외하고 영상만 한 개씩 준비한다', () => {
    const assets = [asset(0), asset(1, 'video/mp4'), asset(2, 'video/webm')];
    const batches = buildPlatformBatches('youtube', assets);
    expect(batches.map((batch) => batch.assetIndexes)).toEqual([[1], [2]]);
    expect(platformNotice('youtube', assets)).toContain('이미지 1장은 제외');
  });

  it('고파스 이미지는 원래 순서의 한 묶음으로 유지한다', () => {
    const batches = buildPlatformBatches('koreapas', Array.from({ length: 8 }, (_, index) => asset(index)));
    expect(batches).toHaveLength(1);
    expect(batches[0].assetIndexes).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
