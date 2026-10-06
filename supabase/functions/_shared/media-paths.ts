export type ExternalBackend = 'aws' | 'r2';

export function isExternalMediaPath(path: string) {
  return path.startsWith('s3:') || path.startsWith('r2:');
}

export function mediaPathBackend(path: string): ExternalBackend {
  if (path.startsWith('r2:')) return 'r2';
  if (path.startsWith('s3:')) return 'aws';
  throw new Error('외부 저장소 경로가 아닙니다.');
}

export function externalMediaKey(path: string) {
  mediaPathBackend(path);
  const key = path.slice(3);
  if (!/^[a-zA-Z0-9/._-]+$/.test(key) || key.includes('..') || key.startsWith('/') || key.includes('//')) {
    throw new Error('파일 경로가 올바르지 않습니다.');
  }
  return key;
}

export function storedMediaPath(backend: ExternalBackend, key: string) {
  const path = `${backend === 'r2' ? 'r2' : 's3'}:${key}`;
  externalMediaKey(path);
  return path;
}
