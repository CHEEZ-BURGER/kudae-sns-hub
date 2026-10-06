/** Default: inventory only. Copy and DB switching are separate, explicitly selected steps. */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3.1146.0';

const mode = Deno.args[0] || '--plan';
if (!['--plan', '--copy', '--commit'].includes(mode)) throw new Error('Use --plan, --copy, or --commit');
const need = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };
const supabaseUrl = need('SUPABASE_URL');
if (supabaseUrl !== 'https://bcqqokdehkfaiuquktag.supabase.co') throw new Error('Unexpected Supabase project');
const accountId = need('SNS_R2_ACCOUNT_ID');
if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('Invalid account ID');
const bucket = need('SNS_R2_BUCKET');
if (bucket !== 'kudae-sns-assets') throw new Error('Unexpected destination bucket');
const service = createClient(supabaseUrl, need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
const s3 = new S3Client({ region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`, forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED', credentials: { accessKeyId: need('SNS_R2_ACCESS_KEY_ID'), secretAccessKey: need('SNS_R2_SECRET_ACCESS_KEY') } });
const reportDir = 'work/r2-migration';
const reportPath = `${reportDir}/verified-manifest.json`;
const PATH_COLUMNS = ['original_path', 'thumbnail_path', 'optimized_path'] as const;
type Asset = { id: string; post_id: string; filename: string; size_bytes: number; mime_type: string; original_path: string; thumbnail_path: string; optimized_path: string | null };
type Publication = { id: string; title: string; created_by: string; updated_at: string; expires_at: string | null; share_token: string; posts: Array<{ id: string; assets: Asset[] }> };
type CopyRecord = { key: string; sha256: string; size: number; contentType: string };
type Report = { version: number; project: string; account: string; bucket: string; publications: Publication[]; copied: Record<string, CopyRecord>; ready: boolean; committed?: boolean };

async function inventory(): Promise<Publication[]> {
  const { data, error } = await service.from('publications')
    .select('id,title,created_by,updated_at,expires_at,share_token,posts(id,assets(id,post_id,filename,size_bytes,mime_type,original_path,thumbnail_path,optimized_path))')
    .eq('status', 'published').order('created_at', { ascending: false }).limit(4);
  if (error) throw new Error('Inventory read failed');
  if (data?.length !== 3) throw new Error('Expected exactly three published distributions; confirm scope before migration');
  return data as unknown as Publication[];
}
const sha256 = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map((b) => b.toString(16).padStart(2,'0')).join('');
function refs(publications: Publication[]) {
  return publications.flatMap((publication) => publication.posts.flatMap((post) => post.assets.flatMap((asset) => PATH_COLUMNS.flatMap((column) => {
    const source = asset[column];
    return source ? [{ publication, asset, column, source }] : [];
  }))));
}
async function save(report: Report) {
  await Deno.mkdir(reportDir, { recursive: true });
  // A separate file avoids corrupting a previously verified report if writing fails.
  await Deno.writeTextFile(`${reportPath}.tmp`, JSON.stringify(report, null, 2));
  await Deno.rename(`${reportPath}.tmp`, reportPath);
}
async function load(): Promise<Report> {
  const report = JSON.parse(await Deno.readTextFile(reportPath)) as Report;
  if (report.version !== 1 || report.project !== supabaseUrl || report.account !== accountId || report.bucket !== bucket) throw new Error('Migration report target mismatch');
  return report;
}
async function verifyObject(record: CopyRecord) {
  const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: record.key }));
  if (head.ContentLength !== record.size || head.ContentType !== record.contentType) throw new Error('Destination metadata mismatch');
  const target = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: record.key }));
  if (!target.Body || await sha256(await target.Body.transformToByteArray()) !== record.sha256) throw new Error('Destination checksum mismatch');
}
async function verifyCopies(records: CopyRecord[]) {
  let batch: CopyRecord[] = [];
  let bytes = 0;
  let completed = 0;
  const flush = async () => {
    await Promise.all(batch.map(verifyObject));
    completed += batch.length;
    console.log(`Reverified destination objects ${completed}/${records.length}`);
    batch = []; bytes = 0;
  };
  for (const record of records) {
    // Bound simultaneous memory use; large videos run alone.
    if (batch.length && (batch.length >= 3 || bytes + record.size > 24 * 1024 * 1024)) await flush();
    batch.push(record); bytes += record.size;
  }
  if (batch.length) await flush();
}
async function bucketBytes() {
  let bytes = 0;
  let token: string | undefined;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    bytes += (page.Contents || []).reduce((sum, object) => sum + (object.Size || 0), 0);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !token) throw new Error('Incomplete bucket inventory');
  } while (token);
  return bytes;
}
const copyId = (assetId: string, source: string) => `${assetId}:${source}`;
async function copyOne(ref: ReturnType<typeof refs>[number], report: Report) {
  if (/^(s3|r2):/.test(ref.source)) throw new Error('Inventory already includes external storage; inspect before continuing');
  const identifier = copyId(ref.asset.id, ref.source);
  const existing = report.copied[identifier];
  if (existing) { await verifyObject(existing); return; }
  const { data: blob, error } = await service.storage.from('sns-assets').download(ref.source);
  if (error || !blob) throw new Error('Source download failed');
  if (blob.size <= 0 || blob.size > 500 * 1024 * 1024) throw new Error('Source file size outside migration limit');
  if (ref.column === 'original_path' && Number(ref.asset.size_bytes) !== blob.size) throw new Error('Original size differs from asset metadata');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = await sha256(bytes);
  const contentType = blob.type || (ref.column === 'original_path' ? ref.asset.mime_type : 'image/webp');
  const mimeExtensions: Record<string, string> = { 'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/svg+xml':'svg','image/avif':'avif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov','video/x-m4v':'m4v' };
  const ext = mimeExtensions[contentType.split(';')[0].trim().toLowerCase()];
  if (!ext) throw new Error('Unsupported source media type');
  const key = `${ref.publication.created_by}/${ref.publication.id}/${ref.asset.post_id}/${ref.asset.id}/${hash}.${ext}`;
  const record = { key, sha256: hash, size: blob.size, contentType };
  // Keys derive from original bytes, so resuming never overwrites a different file.
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    if (head.ContentLength !== blob.size) throw new Error('Destination key collision');
  } catch (error) {
    if (!(error instanceof Error) || !['NotFound', 'NoSuchKey'].includes(error.name)) throw error;
    if (await bucketBytes() + blob.size > 8_000_000_000) throw new Error('Destination would exceed 8GB migration ceiling');
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType, CacheControl: 'no-store', Metadata: { sha256: hash } }));
  }
  await verifyObject(record);
  report.copied[identifier] = record;
  await save(report);
}

try {
  if (mode === '--plan') {
    const publications = await inventory();
    const originals = publications.flatMap((publication) => publication.posts.flatMap((post) => post.assets));
    console.log(JSON.stringify({ distributions: publications.map((p) => ({ id: p.id, title: p.title })), mediaCount: originals.length,
      originalBytes: originals.reduce((sum, asset) => sum + Number(asset.size_bytes), 0), uniqueStorageObjects: new Set(refs(publications).map((r) => r.source)).size, writesPerformed: false }, null, 2));
  } else if (mode === '--copy') {
    let report: Report;
    try { report = await load(); }
    catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
      report = { version: 1, project: supabaseUrl, account: accountId, bucket, publications: await inventory(), copied: {}, ready: false };
      await save(report);
    }
    if (report.committed) throw new Error('Already committed; do not restart source downloads');
    // Conservative preflight: leave room within the 10GB allowance for thumbnails/failed uploads.
    const estimatedBytes = report.publications.flatMap((p) => p.posts.flatMap((post) => post.assets)).reduce((sum, a) => sum + Number(a.size_bytes), 0);
    if (estimatedBytes > 7_000_000_000) throw new Error('Source exceeds safe migration budget');
    const items = refs(report.publications);
    for (let index = 0; index < items.length; index++) {
      await copyOne(items[index], report);
      console.log(`Verified source reference ${index + 1}/${items.length}`);
    }
    if (Object.values(report.copied).reduce((sum, file) => sum + file.size, 0) > 8_000_000_000) throw new Error('Verified files exceed safe storage budget');
    report.ready = true;
    await save(report);
    console.log('All copied bytes verified. Database and Supabase source files are unchanged.');
  } else {
    const report = await load();
    if (!report.ready || report.committed) throw new Error('Report is not ready for switching');
    // Deploy mixed-storage server functions and test the old extension BEFORE this step.
    if (Deno.env.get('R2_COMPATIBILITY_VERIFIED') !== 'yes') throw new Error('Existing extension compatibility and live server deployment must be verified first');
    await verifyCopies(Object.values(report.copied));
    const manifest = report.publications.map((publication) => ({ id: publication.id, updated_at: publication.updated_at,
      assets: publication.posts.flatMap((post) => post.assets).map((asset) => ({ id: asset.id,
        ...Object.fromEntries(PATH_COLUMNS.flatMap((column) => [
          [`old_${column}`, asset[column]], [column, asset[column] ? 'r2:' + report.copied[copyId(asset.id, asset[column]!)].key : null],
        ])),
      })),
    }));
    const { data, error } = await service.rpc('switch_distribution_media', { p_manifest: manifest });
    if (error || data?.migrated_publications !== 3) throw new Error('Atomic database switch failed; inspect current DB before retrying');
    const current = await inventory();
    for (const old of report.publications) {
      const now = current.find((p) => p.id === old.id);
      if (!now || now.share_token !== old.share_token || now.expires_at !== old.expires_at) throw new Error('Post-switch link verification failed');
      for (const asset of now.posts.flatMap((post) => post.assets)) for (const column of PATH_COLUMNS) {
        if (asset[column] && !asset[column]!.startsWith('r2:')) throw new Error('Post-switch media verification failed');
      }
    }
    report.committed = true;
    await save(report);
    console.log('Three distributions now reference R2. Share links preserved; Supabase originals NOT deleted.');
  }
} catch (error) {
  // Never log credentials, signed URLs, or raw SDK request objects.
  const known = error instanceof Error && error.constructor === Error ? error.message : 'Operation failed; inspect service state before continuing';
  console.error(known);
  Deno.exit(1);
}
