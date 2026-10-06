import { GetObjectCommand, HeadObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3.1146.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.1146.0';
import { awsMediaConfigured, cloudFrontMediaUrl } from './aws-media.ts';
import { externalMediaKey, mediaPathBackend, type ExternalBackend } from './media-paths.ts';

export function uploadBackend(): ExternalBackend {
  const backend = Deno.env.get('SNS_MEDIA_BACKEND') || 'aws';
  if (backend !== 'r2' && backend !== 'aws') throw new Error('파일 저장소 설정을 확인해 주세요.');
  return backend;
}

export function mediaConfigured(backend: ExternalBackend) {
  if (backend === 'aws') return awsMediaConfigured();
  return /^[a-f0-9]{32}$/i.test(Deno.env.get('SNS_R2_ACCOUNT_ID') || '') &&
    /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(Deno.env.get('SNS_R2_BUCKET') || '') &&
    ['SNS_R2_ACCESS_KEY_ID', 'SNS_R2_SECRET_ACCESS_KEY'].every((name) => Boolean(Deno.env.get(name)));
}

export function mediaStore(backend: ExternalBackend) {
  if (!mediaConfigured(backend)) throw new Error('파일 저장소 연결이 완료되지 않았습니다.');
  const r2 = backend === 'r2';
  const client = new S3Client({
    region: r2 ? 'auto' : Deno.env.get('SNS_AWS_REGION')!,
    ...(r2 ? { endpoint: `https://${Deno.env.get('SNS_R2_ACCOUNT_ID')!}.r2.cloudflarestorage.com`, forcePathStyle: true } : {}),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: Deno.env.get(r2 ? 'SNS_R2_ACCESS_KEY_ID' : 'SNS_AWS_ACCESS_KEY_ID')!,
      secretAccessKey: Deno.env.get(r2 ? 'SNS_R2_SECRET_ACCESS_KEY' : 'SNS_AWS_SECRET_ACCESS_KEY')!,
    },
  });
  return { client, bucket: Deno.env.get(r2 ? 'SNS_R2_BUCKET' : 'SNS_S3_BUCKET')! };
}

export async function externalMediaUrl(path: string, method: 'GET' | 'HEAD' = 'GET') {
  if (mediaPathBackend(path) === 'aws') return cloudFrontMediaUrl(path);
  const { client, bucket } = mediaStore('r2');
  const command = method === 'HEAD'
    ? new HeadObjectCommand({ Bucket: bucket, Key: externalMediaKey(path) })
    : new GetObjectCommand({ Bucket: bucket, Key: externalMediaKey(path), ResponseCacheControl: 'no-store' });
  return await getSignedUrl(client, command, { expiresIn: 900 });
}
