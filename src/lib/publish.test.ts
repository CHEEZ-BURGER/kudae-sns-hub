import { describe, expect, it } from 'vitest';
import { publicationIdsToPrune } from './publish';

describe('배포 보관 개수', () => {
  it('최신 3개만 남기고 오래된 순으로 삭제 대상을 고른다', () => {
    const rows = [
      { id: 'oldest', created_at: '2026-08-01T00:00:00Z' },
      { id: 'newest', created_at: '2026-09-01T00:00:00Z' },
      { id: 'second', created_at: '2026-08-25T00:00:00Z' },
      { id: 'third', created_at: '2026-08-20T00:00:00Z' },
      { id: 'older', created_at: '2026-08-10T00:00:00Z' },
    ];
    expect(publicationIdsToPrune(rows)).toEqual(['older', 'oldest']);
  });

  it('배포가 3개 이하면 삭제하지 않는다', () => {
    expect(publicationIdsToPrune([
      { id: 'a', created_at: '2026-09-01T00:00:00Z' },
      { id: 'b', created_at: '2026-08-01T00:00:00Z' },
    ])).toEqual([]);
  });
});
