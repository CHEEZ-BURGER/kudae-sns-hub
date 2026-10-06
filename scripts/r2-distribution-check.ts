/** Compare private content snapshots and public responses before/after the scoped migration. */
import { createClient } from 'npm:@supabase/supabase-js@2';
const project = 'https://bcqqokdehkfaiuquktag.supabase.co';
const service = createClient(project, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false, autoRefreshToken: false } });
const mode = Deno.args[0];
const dir = 'work/r2-migration';
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
function canonical(value: any): string {
  if (Array.isArray(value)) return `[${[...value].sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || ''))).map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter((key) => !['original_path', 'thumbnail_path', 'optimized_path'].includes(key)).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map((b) => b.toString(16).padStart(2, '0')).join('');
try {
  assert(['--before', '--after'].includes(mode), 'Use --before or --after');
  const report = JSON.parse(await Deno.readTextFile(`${dir}/verified-manifest.json`));
  const ids = report.publications.map((publication: any) => publication.id);
  const { data, error } = await service.from('publications')
    .select('id,title,issue_number,status,share_token,share_token_hash,published_at,expires_at,posts(id,category,title,body,credits,article_url,position,assets(id,filename,mime_type,size_bytes,width,height,position,original_path,thumbnail_path,optimized_path))').in('id', ids);
  assert(!error && data?.length === 3, 'Cannot read the three original publications');
  if (mode === '--before') {
    // Do not overwrite the baseline when rerunning after a database switch.
    try { await Deno.stat(`${dir}/content-before.json`); }
    catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
      for (const publication of data!) for (const post of publication.posts) for (const asset of post.assets) {
        assert(!/^(r2|s3):/.test(asset.original_path), 'Baseline already uses external storage');
      }
      await Deno.writeTextFile(`${dir}/content-before.json`, JSON.stringify(data, null, 2));
    }
  }
  const baseline = JSON.parse(await Deno.readTextFile(`${dir}/content-before.json`));
  assert(canonical(data) === canonical(baseline), 'Content, order, identities, dimensions, or share links changed');
  for (const publication of data!) {
    const response = await fetch(`${project}/functions/v1/public-distribution`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_ANON_KEY') || '' }, body: JSON.stringify({ action: 'read', token: publication.share_token }) });
    assert(response.ok, `Public distribution returned ${response.status}`);
    const payload = await response.json();
    assert(payload.title === publication.title && payload.posts.length === publication.posts.length, 'Public metadata mismatch');
    const publicAssets = payload.posts.flatMap((post: any) => post.assets);
    const storedAssets = publication.posts.flatMap((post) => post.assets);
    assert(publicAssets.length === storedAssets.length, 'Public asset count mismatch');
    for (const asset of publicAssets) {
      assert(new URL(asset.originalUrl).hostname === 'bcqqokdehkfaiuquktag.supabase.co' && new URL(asset.thumbUrl).hostname === 'bcqqokdehkfaiuquktag.supabase.co', 'Extension trusted file host changed');
    }
    if (mode === '--after') {
      const oldPublication = report.publications.find((item: any) => item.id === publication.id);
      for (const asset of storedAssets) {
        const old = oldPublication.posts.flatMap((post: any) => post.assets).find((item: any) => item.id === asset.id);
        for (const column of ['original_path', 'thumbnail_path', 'optimized_path'] as const) {
          const expected = old[column] ? `r2:${report.copied[`${old.id}:${old[column]}`].key}` : null;
          assert(asset[column] === expected, 'Migrated path differs from verified manifest');
        }
      }
      const sample = publicAssets[0];
      if (sample) {
        const old = oldPublication.posts.flatMap((post: any) => post.assets).find((item: any) => item.id === sample.id);
        for (const [url, column] of [[sample.originalUrl, 'original_path'], [sample.thumbUrl, 'thumbnail_path']]) {
          const record = report.copied[`${old.id}:${old[column]}`];
          const fileResponse = await fetch(url, { headers: { Origin: 'https://cheez-burger.github.io' }, cache: 'no-store' });
          assert(fileResponse.ok && new URL(fileResponse.url).hostname === '8b7ca7970b7974eadb7a807141a46779.r2.cloudflarestorage.com', 'Public file does not download directly from R2');
          const bytes = new Uint8Array(await fileResponse.arrayBuffer());
          assert(bytes.length === record.size && await hash(bytes) === record.sha256, 'Public file byte mismatch');
        }
      }
    }
    console.log(JSON.stringify({ phase: mode.slice(2), title: publication.title, assets: publicAssets.length, publicApi: 'passed', contentAndLinksPreserved: true }));
  }
} catch (error) {
  console.error(error instanceof Error && error.constructor === Error ? error.message : 'Distribution check failed; inspect state privately');
  Deno.exit(1);
}
