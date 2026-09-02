import type { DistributionAsset } from '../types';

export const APP_SOURCE = 'KUDAE_SNS_WORKFLOW';
export const EXTENSION_SOURCE = 'KUDAE_SNS_EXTENSION';

export type ExtensionUploadState = 'QUEUED' | 'OPENING_TARGET' | 'FETCHING' | 'WAITING_FOR_COMPOSER' | 'WAITING_FOR_FILE_INPUT' | 'INJECTING' | 'VERIFYING' | 'COMPLETE' | 'CANCELLED' | 'ERROR';

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

export function postExtensionMessage(type: 'SNS_EXTENSION_PING' | 'SNS_OPEN_PANEL' | 'SNS_UPLOAD_REQUEST' | 'SNS_UPLOAD_CANCEL', payload: unknown = {}) {
  window.postMessage({ source: APP_SOURCE, type, payload }, location.origin);
}

export function isExtensionEvent(event: MessageEvent): event is MessageEvent<ExtensionEvent> {
  return event.source === window
    && event.origin === location.origin
    && event.data?.source === EXTENSION_SOURCE
    && typeof event.data?.type === 'string';
}
