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
  const response = await fetch(url);
  if (!response.ok) throw new Error('이미지 다운로드에 실패했습니다. 링크를 새로고침해 주세요.');
  return response.blob();
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

export async function downloadAsset(asset: DistributionAsset, optimized: boolean) {
  const url = optimized && asset.optimizedUrl ? asset.optimizedUrl : asset.originalUrl;
  const blob = await fetchBlob(url);
  const extension = optimized && asset.optimizedUrl ? 'jpg' : asset.filename.split('.').pop();
  triggerDownload(blob, `${asset.filename.replace(/\.[^.]+$/, '')}.${extension}`);
}

export async function downloadZip(assets: DistributionAsset[], optimized: boolean, filename: string) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  await Promise.all(assets.map(async (asset, index) => {
    const url = optimized && asset.optimizedUrl ? asset.optimizedUrl : asset.originalUrl;
    const blob = await fetchBlob(url);
    const base = asset.filename.replace(/\.[^.]+$/, '');
    zip.file(`${String(index + 1).padStart(2, '0')}_${base}${optimized ? '.jpg' : asset.filename.slice(base.length)}`, blob);
  }));
  triggerDownload(await zip.generateAsync({ type: 'blob' }), `${filename}.zip`);
}

export async function shareAssets(assets: DistributionAsset[], optimized: boolean, title: string) {
  if (!navigator.share) throw new Error('이 기기에서는 여러 이미지 공유를 지원하지 않습니다. ZIP 다운로드를 이용해 주세요.');
  const files = await Promise.all(assets.map(async (asset, index) => {
    const useOptimized = optimized && asset.optimizedUrl;
    const blob = await fetchBlob(useOptimized ? asset.optimizedUrl! : asset.originalUrl);
    const filename = useOptimized ? `${asset.filename.replace(/\.[^.]+$/, '')}.jpg` : asset.filename;
    return new File([blob], `${String(index + 1).padStart(2, '0')}_${filename}`, { type: blob.type || asset.mimeType });
  }));
  if (!navigator.canShare?.({ files })) throw new Error('이 브라우저는 여러 이미지 공유를 지원하지 않습니다. ZIP 다운로드를 이용해 주세요.');
  await navigator.share({ title, files });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
