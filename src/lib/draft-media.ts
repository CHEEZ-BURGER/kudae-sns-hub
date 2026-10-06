import type { DraftAsset } from '../types';

export const draftFilename = (asset: DraftAsset) => asset.file?.name ?? asset.stored?.filename ?? '';
export const draftMimeType = (asset: DraftAsset) => asset.file?.type ?? asset.stored?.mimeType ?? '';
export const draftSize = (asset: DraftAsset) => asset.file?.size ?? asset.stored?.sizeBytes ?? 0;
export const draftIsVideo = (asset: DraftAsset) => draftMimeType(asset).startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(draftFilename(asset));

export function releaseDraftPreview(asset: DraftAsset) {
  if (asset.previewUrl.startsWith('blob:')) URL.revokeObjectURL(asset.previewUrl);
}

export function appendDraftMedia(assets: DraftAsset[], files: File[]) {
  return [...assets, ...files.map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), order: 0 }))]
    .map((asset, order) => ({ ...asset, order }));
}

export function replaceDraftMedia(assets: DraftAsset[], id: string, file: File) {
  return assets.map((asset) => asset.id === id
    ? { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), order: asset.order }
    : asset);
}

export function removeDraftMedia(assets: DraftAsset[], id: string) {
  return assets.filter((asset) => asset.id !== id).map((asset, order) => ({ ...asset, order }));
}
