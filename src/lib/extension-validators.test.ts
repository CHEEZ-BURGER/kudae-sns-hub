import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const context: Record<string, unknown> = { URL };
runInNewContext(readFileSync(new URL('../../extension/shared/constants.js', import.meta.url), 'utf8'), context);
runInNewContext(readFileSync(new URL('../../extension/shared/validators.js', import.meta.url), 'utf8'), context);
const api = context.KudaeSNS as { validateJob: (value: unknown) => { ok: boolean; error?: { code: string } } };
const tokenUrl = 'https://bcqqokdehkfaiuquktag.supabase.co/storage/v1/object/sign/test.png?token=fixture';
const asset = (mimeType: string, order: number) => ({ order, url: tokenUrl, filename: `asset-${order}.${mimeType.split('/')[1]}`, mimeType });
const job = (assets: unknown[]) => ({ jobId: '01234567-89ab-cdef-0123-456789abcdef', target: 'youtube', createdAt: Date.now(), assets, caption: '' });

describe('YouTube 원본 선택 검증', () => {
  it('커뮤니티 게시물 이미지 10장을 허용한다', () => {
    expect(api.validateJob(job(Array.from({ length: 10 }, (_, index) => asset('image/png', index)))).ok).toBe(true);
  });

  it('커뮤니티 게시물 이미지 11장은 거부한다', () => {
    expect(api.validateJob(job(Array.from({ length: 11 }, (_, index) => asset('image/jpeg', index)))).error?.code).toBe('TOO_MANY_ASSETS');
  });

  it('Studio 영상 1개를 허용하고 이미지·영상 혼합은 거부한다', () => {
    expect(api.validateJob(job([asset('video/mp4', 0)])).ok).toBe(true);
    expect(api.validateJob(job([asset('image/png', 0), asset('video/mp4', 1)])).error?.code).toBe('UNSUPPORTED_MIME');
  });
});
