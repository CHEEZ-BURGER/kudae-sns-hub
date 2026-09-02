import type { DistributionAsset } from '../types';

function loadImage(fileOrBlob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(fileOrBlob);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다.')); };
    image.src = url;
  });
}

export async function resizeImage(file: File, maxSize: number, quality: number): Promise<Blob> {
  const image = await loadImage(file);
  const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('이미지 변환을 지원하지 않는 브라우저입니다.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했습니다.')), 'image/jpeg', quality));
}

async function fetchBlob(url: string) {
  // Original media is fetched only when the user copies or downloads it.
  // `no-store` prevents the browser HTTP cache from retaining another copy.
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('원본 파일을 불러오지 못했습니다. 링크를 새로고침해 주세요.');
  return response.blob();
}

export function isVideoAsset(asset: DistributionAsset) {
  return asset.mimeType.startsWith('video/') || /\.(?:mp4|mov|m4v|webm)$/i.test(asset.filename);
}

export async function copyImageToClipboard(url: string) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('이 브라우저는 이미지 복사를 지원하지 않습니다. 다운로드를 이용해 주세요.');
  const source = await fetchBlob(url);
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('복사용 이미지 변환에 실패했습니다.')), 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

export async function downloadAsset(asset: DistributionAsset) {
  triggerDownload(await fetchBlob(asset.originalUrl), asset.filename);
}

export async function downloadAssetsIndividually(assets: DistributionAsset[]) {
  for (const asset of assets) {
    triggerDownload(await fetchBlob(asset.originalUrl), asset.filename);
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
