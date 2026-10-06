import { getSignedUrl } from 'npm:@aws-sdk/cloudfront-signer@3.1138.0';

export function awsMediaConfigured() {
  return ['SNS_AWS_REGION','SNS_S3_BUCKET','SNS_AWS_ACCESS_KEY_ID','SNS_AWS_SECRET_ACCESS_KEY','SNS_CLOUDFRONT_DOMAIN','SNS_CLOUDFRONT_KEY_PAIR_ID','SNS_CLOUDFRONT_PRIVATE_KEY']
    .every((name) => Boolean(Deno.env.get(name)));
}
export function cloudFrontMediaUrl(storedPath: string) {
  if (!awsMediaConfigured()) throw new Error('AWS 파일 저장소 설정이 완료되지 않았습니다.');
  if (!storedPath.startsWith('s3:') || !/^[a-zA-Z0-9/._-]+$/.test(storedPath.slice(3)) || storedPath.includes('..')) throw new Error('파일 경로가 올바르지 않습니다.');
  const domain = Deno.env.get('SNS_CLOUDFRONT_DOMAIN')!;
  if (!/^[a-zA-Z0-9.-]+$/.test(domain)) throw new Error('CloudFront 도메인을 확인해 주세요.');
  return getSignedUrl({
    url: `https://${domain}/${storedPath.slice(3)}`,
    keyPairId: Deno.env.get('SNS_CLOUDFRONT_KEY_PAIR_ID')!,
    privateKey: Deno.env.get('SNS_CLOUDFRONT_PRIVATE_KEY')!.replaceAll('\\n','\n'),
    dateLessThan: new Date(Date.now()+15*60*1000).toISOString(),
  });
}
export async function mediaSignature(secret: string, assetId: string, kind: string, expires: number) {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${assetId}:${kind}:${expires}`));
  return [...new Uint8Array(signature)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}
export async function compatibilityMediaUrl(supabaseUrl: string, secret: string, assetId: string, kind: 'original'|'thumb') {
  const expires=Math.floor(Date.now()/1000)+3600;
  const signature=await mediaSignature(secret,assetId,kind,expires);
  return `${supabaseUrl}/functions/v1/media-redirect?id=${assetId}&kind=${kind}&expires=${expires}&sig=${signature}`;
}
