import type { DistributionAsset, DistributionPost } from '../types';
import { uploadContent } from '../../extension/shared/upload-content.mjs';
import { buildXThread } from '../../extension/shared/x-thread.mjs';

export const APP_SOURCE = 'KUDAE_SNS_WORKFLOW';
export const EXTENSION_SOURCE = 'KUDAE_SNS_EXTENSION';

export type ExtensionUploadState = 'QUEUED' | 'OPENING_TARGET' | 'FETCHING' | 'WAITING_FOR_COMPOSER' | 'WAITING_FOR_FILE_INPUT' | 'WAITING_FOR_TEXT_INPUT' | 'INJECTING' | 'VERIFYING' | 'COMPLETE' | 'CANCELLED' | 'ERROR';
export type SNSTarget = 'instagram' | 'facebook' | 'koreapas' | 'everytime' | 'x' | 'youtube';

export type ExtensionEvent = {
  source: typeof EXTENSION_SOURCE;
  type: 'SNS_EXTENSION_PONG' | 'SNS_UPLOAD_ACK' | 'SNS_UPLOAD_PROGRESS' | 'SNS_UPLOAD_COMPLETE' | 'SNS_UPLOAD_ERROR';
  payload: {
    jobId?: string;
    accepted?: boolean;
    state?: ExtensionUploadState;
    userMessage?: string;
    current?: number;
    total?: number;
    code?: string;
    version?: string;
    count?: number;
    contentInserted?: boolean;
    postId?: string;
    detail?: string;
  };
};

const mimeExtensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function desktopChromeMajor(userAgent: string) {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent)) return null;
  const match = userAgent.match(/(?:Chrome|Chromium)\/(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function buildInstagramJob(assets: DistributionAsset[], now = Date.now(), id = crypto.randomUUID()) {
  const supported = assets.filter((asset) => mimeExtensions[asset.mimeType.toLowerCase()]);
  if (!supported.length) throw new Error('Instagram 자동 전달은 PNG, JPG, WebP 이미지만 지원합니다.');
  if (supported.length !== assets.length) throw new Error('지원하지 않는 이미지 형식이 섞여 있습니다. PNG, JPG, WebP만 선택해 주세요.');
  const width = Math.max(2, String(supported.length).length);
  return {
    jobId: id,
    target: 'instagram' as const,
    createdAt: now,
    assets: supported.map((asset, order) => ({
      order,
      url: asset.originalUrl,
      filename: `card-${String(order + 1).padStart(width, '0')}.${mimeExtensions[asset.mimeType.toLowerCase()]}`,
      mimeType: asset.mimeType.toLowerCase(),
    })),
    caption: '',
  };
}

export function buildSNSJob(post: DistributionPost, target: SNSTarget, studio = false, now = Date.now(), id = crypto.randomUUID()) {
  const extensions: Record<string,string> = { ...mimeExtensions, 'image/gif':'gif', 'video/mp4':'mp4', 'video/webm':'webm', 'video/quicktime':'mov', 'video/x-m4v':'m4v' };
  const assets = post.assets;
  if (!assets.length) throw new Error('이 글에는 전달할 원본이 없습니다.');
  if (assets.some((asset) => !extensions[asset.mimeType.toLowerCase()])) throw new Error('지원하지 않는 이미지 형식이 섞여 있습니다. 원본 다운로드를 이용해 주세요.');
  if (assets.some((asset) => asset.mimeType.startsWith(studio ? 'image/' : 'video/'))) throw new Error(studio ? 'YouTube Studio 자동 넣기는 영상만 있는 글에서 사용해 주세요.' : '영상이 포함된 글입니다. 영상은 YouTube Studio 전용 버튼 또는 원본 다운로드를 이용해 주세요.');
  if (target === 'youtube' && assets.length > (studio ? 1 : 10)) throw new Error(studio ? 'YouTube Studio에는 영상 1개씩 넣어 주세요.' : 'YouTube 게시물에는 이미지 10장까지 넣을 수 있습니다.');
  const content=uploadContent(post,target,studio);
  return { jobId:id, target, createdAt:now, ...content, ...(target==='x'?{xThread:buildXThread(content.caption,assets.length)}:{}),
    assets: assets.map((asset,order) => ({ order, url:asset.originalUrl, mimeType:asset.mimeType.toLowerCase(),
      filename:`${studio?'video':'card'}-${String(order+1).padStart(2,'0')}.${extensions[asset.mimeType.toLowerCase()]}` })) };
}

export function postExtensionMessage(type: 'SNS_EXTENSION_PING' | 'SNS_OPEN_PANEL' | 'SNS_UPLOAD_REQUEST' | 'SNS_UPLOAD_CANCEL', payload: unknown = {}) {
  window.postMessage({ source: APP_SOURCE, type, payload }, location.origin);
}

export function isExtensionEvent(event: MessageEvent): event is MessageEvent<ExtensionEvent> {
  return event.source === window
    && event.origin === location.origin
    && event.data?.source === EXTENSION_SOURCE
    && typeof event.data?.type === 'string';
}
