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
  // Original media prepared for sharing must stay ephemeral. `no-store`
  // prevents the browser HTTP cache from retaining another persistent copy.
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

export async function downloadZip(assets: DistributionAsset[], filename: string) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  await Promise.all(assets.map(async (asset, index) => {
    const blob = await fetchBlob(asset.originalUrl);
    zip.file(`${String(index + 1).padStart(2, '0')}_${asset.filename}`, blob);
  }));
  triggerDownload(await zip.generateAsync({ type: 'blob' }), `${filename}.zip`);
}

export async function originalFiles(assets: DistributionAsset[]) {
  return Promise.all(assets.map(async (asset, index) => {
    const blob = await fetchBlob(asset.originalUrl);
    return new File([blob], `${String(index + 1).padStart(2, '0')}_${asset.filename}`, { type: blob.type || asset.mimeType });
  }));
}

export async function shareAssets(assets: DistributionAsset[], title: string, preparedFiles?: File[]) {
  const files = preparedFiles ?? await originalFiles(assets);
  await shareFiles(files, title);
}

export async function shareFiles(files: File[], title: string) {
  if (!navigator.share) throw new Error('이 기기에서는 파일 공유창을 지원하지 않습니다. 순차 복사나 원본 저장을 이용해 주세요.');
  if (!navigator.canShare?.({ files })) throw new Error('이 브라우저는 선택한 원본 묶음을 공유할 수 없습니다. 순차 복사나 원본 저장을 이용해 주세요.');
  try {
    await navigator.share({ title, files });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('공유를 취소했습니다.');
    throw error;
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
