/** Tiny disposable original-byte upload using the same PUT headers as the browser. */
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3.1146.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.1146.0';
const account = Deno.env.get('SNS_R2_ACCOUNT_ID');
const bucket = Deno.env.get('SNS_R2_BUCKET');
if (account !== '8b7ca7970b7974eadb7a807141a46779' || bucket !== 'kudae-sns-assets') throw new Error('Unexpected probe target');
const client = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, forcePathStyle: true, requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: { accessKeyId: Deno.env.get('SNS_R2_ACCESS_KEY_ID') || '', secretAccessKey: Deno.env.get('SNS_R2_SECRET_ACCESS_KEY') || '' } });
const key = `connection-check/${crypto.randomUUID()}/original.png`;
const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
let attempted = false;
let failed = false;
try {
  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'image/png', ContentLength: bytes.length, CacheControl: 'public, max-age=86400, immutable' }), { expiresIn: 60 });
  attempted = true;
  const response = await fetch(url, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'image/png' } });
  if (!response.ok) throw new Error(`Browser-style PUT failed (${response.status})`);
  await response.body?.cancel();
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  if (head.ContentLength !== bytes.length || head.ContentType !== 'image/png') throw new Error('Probe metadata mismatch');
  const original = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const downloaded = await original.Body!.transformToByteArray();
  if (downloaded.length !== bytes.length || downloaded.some((byte, index) => byte !== bytes[index])) throw new Error('Probe bytes changed');
  console.log(JSON.stringify({ check: 'browser-style-original-upload', ok: true, bytes: bytes.length }));
} catch (error) {
  console.error(error instanceof Error && error.constructor === Error ? error.message : 'Upload probe failed; inspect privately');
  failed = true;
} finally {
  if (attempted) {
    // Exact newly-created key only. Never list-and-delete or touch migrated objects.
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      console.log(JSON.stringify({ cleanedDisposableProbe: true, migratedFilesDeleted: 0 }));
    } catch {
      console.error('Disposable probe cleanup failed; inspect the connection-check prefix privately');
      failed = true;
    }
  }
}
if (failed) Deno.exit(1);
