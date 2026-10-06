import {describe, expect, it} from 'vitest';
import {externalMediaKey, isExternalMediaPath, mediaPathBackend, storedMediaPath} from '../../supabase/functions/_shared/media-paths';

describe('혼합 파일 저장소', () => {
  it('기존 Supabase 경로와 R2/AWS 경로를 분리한다', () => {
    expect(isExternalMediaPath('user/publication/original.png')).toBe(false);
    expect(isExternalMediaPath('r2:user/publication/post/asset/original.png')).toBe(true);
    expect(mediaPathBackend('r2:user/image.png')).toBe('r2');
    expect(mediaPathBackend('s3:user/image.png')).toBe('aws');
    expect(externalMediaKey('r2:user/image.png')).toBe('user/image.png');
    expect(storedMediaPath('r2','user/image.png')).toBe('r2:user/image.png');
  });
  it.each(['r2:../secret','r2:/absolute','r2:user//image','r2:user/한글.png','r2:user/image?key=x','https://other.test/image'])('위험한 경로를 거절한다: %s', (path) => {
    expect(() => externalMediaKey(path)).toThrow();
  });
});
