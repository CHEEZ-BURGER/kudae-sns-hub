/** Read-only credential and browser CORS checks. Never logs credentials or signed URLs. */
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3.1146.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.1146.0';

const need = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

try {
  const account = need('SNS_R2_ACCOUNT_ID');
  const bucket = need('SNS_R2_BUCKET');
  if (!/^[a-f0-9]{32}$/i.test(account) || bucket !== 'kudae-sns-assets') {
    throw new Error('Unexpected R2 target');
  }
  const client = new S3Client({
    region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: need('SNS_R2_ACCESS_KEY_ID'), secretAccessKey: need('SNS_R2_SECRET_ACCESS_KEY') },
  });
  const inventory = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
  console.log(JSON.stringify({ check: 'bucket-access', ok: true, hasObjects: Boolean(inventory.KeyCount) }));
  // Only OPTIONS is sent: this does not create or download an object.
  const key = 'connection-check/not-created.png';
  const checks = [
    { method: 'PUT', headers: 'content-type', origin: 'https://cheez-burger.github.io', command: new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'image/png' }) },
    { method: 'GET', headers: 'range', origin: 'https://cheez-burger.github.io', command: new GetObjectCommand({ Bucket: bucket, Key: key }) },
    { method: 'GET', headers: 'range', origin: 'https://www.koreapas.com', command: new GetObjectCommand({ Bucket: bucket, Key: key }) },
  ];
  let failed = false;
  for (const check of checks) {
    const signed = await getSignedUrl(client, check.command, { expiresIn: 60 });
    const response = await fetch(signed, { method: 'OPTIONS', redirect: 'error', headers: {
      Origin: check.origin, 'Access-Control-Request-Method': check.method,
      'Access-Control-Request-Headers': check.headers,
    } });
    const allowedOrigin = response.headers.get('access-control-allow-origin');
    const methods = (response.headers.get('access-control-allow-methods') || '').toUpperCase().split(',').map((value) => value.trim());
    const headers = (response.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map((value) => value.trim());
    const ok = response.ok && (allowedOrigin === '*' || allowedOrigin === check.origin)
      && methods.includes(check.method) && (headers.includes('*') || headers.includes(check.headers));
    console.log(JSON.stringify({ check: 'cors', method: check.method, origin: check.origin, status: response.status, ok }));
    await response.body?.cancel();
    if (!ok) failed = true;
  }
  if (failed) Deno.exit(1);
} catch (error) {
  // SDK errors may contain sensitive request details; expose only the class name.
  console.error(JSON.stringify({ check: 'connection', ok: false, error: error instanceof Error ? error.name : 'UnknownError' }));
  Deno.exit(1);
}
