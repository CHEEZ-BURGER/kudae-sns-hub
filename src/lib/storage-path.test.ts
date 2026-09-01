import { describe, expect, it } from 'vitest';
import { originalStoragePath, safeImageExtension } from './storage-path';

describe('Supabase Storage 경로', () => {
  it('한글 원본 파일명을 Storage key에 넣지 않는다', () => {
    const path = originalStoragePath(
      '2174f1fa-ecf2-4cd7-9cb6-c0aba95ceb9f/6a4778f8-1846-4f7c-82cc-ad67954614e2/12435e0e-f68a-45de-8a3e-aaa3c7d16791/d89c6493-0eff-4720-a1ca-f620b9043781',
      '2046호_뉴라이트_사설1.svg',
      'image/svg+xml',
    );
    expect(path).toMatch(/\/original\.svg$/);
    expect(path).not.toContain('뉴라이트');
    expect(path).toMatch(/^[a-z0-9./-]+$/);
  });

  it('확장자가 없으면 MIME 형식에서 안전한 확장자를 정한다', () => {
    expect(safeImageExtension('카드뉴스', 'image/png')).toBe('png');
  });
});
