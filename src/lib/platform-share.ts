import type { DistributionAsset } from '../types';

export type SharePlatform = 'facebook' | 'instagram' | 'youtube' | 'x' | 'koreapas' | 'everytime';

export type SharePlatformOption = {
  id: SharePlatform;
  label: string;
  badge: string;
  website: string;
  description: string;
};

export type PlatformShareBatch = {
  id: string;
  label: string;
  detail: string;
  assetIndexes: number[];
  mediaType: 'images' | 'video';
};

export const SHARE_PLATFORMS: SharePlatformOption[] = [
  { id: 'facebook', label: '페이스북', badge: 'f', website: 'https://www.facebook.com/', description: '본문을 복사한 뒤 사진 묶음이나 영상을 공유하세요.' },
  { id: 'instagram', label: '인스타', badge: '◎', website: 'https://www.instagram.com/', description: '이미지는 10장씩 나누고 영상은 한 개씩 공유합니다.' },
  { id: 'youtube', label: '유튜브', badge: '▶', website: 'https://studio.youtube.com/', description: '영상과 제목·설명을 각각 준비합니다. 이미지 게시물은 제외됩니다.' },
  { id: 'x', label: 'X', badge: 'X', website: 'https://x.com/compose/post', description: '사진은 X 제한에 맞춰 4장씩 나눠 공유합니다.' },
  { id: 'koreapas', label: '고파스', badge: '고', website: 'https://www.koreapas.com/bbs/main.php', description: '제목·본문을 복사하고 이미지 묶음 또는 영상을 공유하세요.' },
  { id: 'everytime', label: '에타', badge: '에', website: 'https://everytime.kr/', description: '제목·본문을 복사하고 이미지 묶음 또는 영상을 공유하세요.' },
];

function isVideo(asset: DistributionAsset) {
  return asset.mimeType.startsWith('video/') || /\.(?:mp4|mov|m4v|webm)$/i.test(asset.filename);
}

function chunks(indexes: number[], size: number) {
  const result: number[][] = [];
  for (let index = 0; index < indexes.length; index += size) result.push(indexes.slice(index, index + size));
  return result;
}

export function buildPlatformBatches(platform: SharePlatform, assets: DistributionAsset[]): PlatformShareBatch[] {
  const imageIndexes = assets.map((asset, index) => ({ asset, index })).filter(({ asset }) => !isVideo(asset)).map(({ index }) => index);
  const videoIndexes = assets.map((asset, index) => ({ asset, index })).filter(({ asset }) => isVideo(asset)).map(({ index }) => index);
  const imageLimit = platform === 'x' ? 4 : platform === 'instagram' ? 10 : Number.POSITIVE_INFINITY;
  const imageBatches = Number.isFinite(imageLimit) ? chunks(imageIndexes, imageLimit) : imageIndexes.length ? [imageIndexes] : [];
  const batches: PlatformShareBatch[] = [];

  if (platform !== 'youtube') {
    imageBatches.forEach((assetIndexes, index) => batches.push({
      id: `images-${index + 1}`,
      label: imageBatches.length > 1 ? `이미지 ${index + 1}/${imageBatches.length}` : '이미지 전체',
      detail: `${assetIndexes.length}장`,
      assetIndexes,
      mediaType: 'images',
    }));
  }

  videoIndexes.forEach((assetIndex, index) => batches.push({
    id: `video-${index + 1}`,
    label: videoIndexes.length > 1 ? `영상 ${index + 1}/${videoIndexes.length}` : '영상',
    detail: assets[assetIndex]?.filename ?? '영상 원본',
    assetIndexes: [assetIndex],
    mediaType: 'video',
  }));

  return batches;
}

export function platformNotice(platform: SharePlatform, assets: DistributionAsset[]) {
  const batches = buildPlatformBatches(platform, assets);
  const imageCount = assets.filter((asset) => !isVideo(asset)).length;
  const videoCount = assets.length - imageCount;
  if (platform === 'youtube' && videoCount === 0) return '이 게시물에는 영상이 없어 유튜브 공유를 사용할 수 없습니다.';
  if (platform === 'youtube' && imageCount > 0) return `영상 ${videoCount}개만 유튜브에 전달합니다. 이미지 ${imageCount}장은 제외됩니다.`;
  if (platform === 'x' && imageCount > 4) return `사진 ${imageCount}장을 X 제한에 맞춰 ${Math.ceil(imageCount / 4)}개 묶음으로 나눴습니다.`;
  if (platform === 'instagram' && imageCount > 10) return `이미지 ${imageCount}장을 인스타 캐러셀 기준으로 ${Math.ceil(imageCount / 10)}개 묶음으로 나눴습니다.`;
  if (imageCount > 0 && videoCount > 0) return `이미지와 영상이 섞여 있어 오류를 줄이도록 ${batches.length}개 공유 단계로 분리했습니다.`;
  return '원본은 기기의 공유창으로만 전달되며 다운로드 폴더에 따로 저장하지 않습니다.';
}
