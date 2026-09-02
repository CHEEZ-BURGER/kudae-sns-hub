import { describe, expect, it } from 'vitest';
import { buildInstagramJob, desktopChromeMajor } from './extension-bridge';

const asset = (position: number, mimeType = 'image/png') => ({
  id: `asset-${position}`, filename: `원본 ${position}.${mimeType.split('/')[1]}`, sizeBytes: 1024, mimeType,
  thumbUrl: `https://example.com/${position}`, originalUrl: `https://bcqqokdehkfaiuquktag.supabase.co/storage/v1/object/sign/${position}`, position,
});

describe('Instagram extension job', () => {
  it('keeps source order and zero-pads filenames', () => {
    const job = buildInstagramJob(Array.from({ length: 10 }, (_, index) => asset(index)), 123, '00000000-0000-4000-8000-000000000000');
    expect(job.assets.map((item) => item.filename)).toEqual(['card-01.png','card-02.png','card-03.png','card-04.png','card-05.png','card-06.png','card-07.png','card-08.png','card-09.png','card-10.png']);
    expect(job.assets.map((item) => item.order)).toEqual([0,1,2,3,4,5,6,7,8,9]);
  });

  it('rejects a mixed unsupported image set instead of partially uploading', () => {
    expect(() => buildInstagramJob([asset(0), asset(1, 'image/svg+xml')])).toThrow('지원하지 않는 이미지 형식');
  });

  it('detects desktop Chrome 148 but excludes mobile Chrome', () => {
    expect(desktopChromeMajor('Mozilla/5.0 Windows NT 10.0 Chrome/148.0.0.0 Safari/537.36')).toBe(148);
    expect(desktopChromeMajor('Mozilla/5.0 Linux; Android 15 Chrome/148.0.0.0 Mobile Safari/537.36')).toBeNull();
  });
});
