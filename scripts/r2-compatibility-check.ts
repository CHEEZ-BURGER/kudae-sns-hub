/** Isolated live test using already-verified R2 bytes; never changes the real publications. */
import { createClient } from 'npm:@supabase/supabase-js@2';
const project = 'https://bcqqokdehkfaiuquktag.supabase.co';
const client = createClient(project, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false, autoRefreshToken: false } });
const mode = Deno.args[0] || '--check';
const file = 'work/r2-migration/compatibility-test.json';
const title = 'R2 연결 검증용 (실제 배포 아님)';
const hash = async (bytes: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))].map((b) => b.toString(16).padStart(2, '0')).join('');
const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
type Fixture = { id: string; postId: string; token: string; assets: Array<{ id: string; mimeType: string; size: number; sha256: string; key: string }> };
try {
  if (mode === '--prepare') {
    try { await Deno.stat(file); throw new Error('Test already exists; check or clean it first'); }
    catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error; }
    const report = JSON.parse(await Deno.readTextFile('work/r2-migration/verified-manifest.json'));
    const available = report.publications.flatMap((publication: any) => publication.posts.flatMap((post: any) => post.assets))
      .filter((asset: any) => ['image/png', 'image/jpeg', 'image/webp'].includes(asset.mime_type) && report.copied[`${asset.id}:${asset.original_path}`]).slice(0, 2);
    assert(available.length === 2, 'Wait for two original images to be verified');
    const fixture: Fixture = { id: crypto.randomUUID(), postId: crypto.randomUUID(), token: crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().slice(0, 8),
      assets: available.map((asset: any) => { const copied = report.copied[`${asset.id}:${asset.original_path}`]; return { id: crypto.randomUUID(), mimeType: asset.mime_type, size: copied.size, sha256: copied.sha256, key: copied.key }; }) };
    await Deno.writeTextFile(file, JSON.stringify(fixture, null, 2));
    const publication = await client.from('publications').insert({ id: fixture.id, issue_number: 'R2검증', title, status: 'draft',
      created_by: report.publications[0].created_by, created_at: '2000-01-01T00:00:00Z',
      share_token: fixture.token, share_token_hash: await hash(new TextEncoder().encode(fixture.token)), expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() });
    assert(!publication.error, 'Test publication creation failed');
    const post = await client.from('posts').insert({ id: fixture.postId, publication_id: fixture.id, category: '보도', title: '기존 확장 원본 전달 확인',
      body: '연결 확인용입니다. SNS 작성창에 두 이미지가 원본으로 들어가는지만 확인하고 실제 게시하지 마세요.', position: 0 });
    assert(!post.error, 'Test post creation failed');
    const assets = await client.from('assets').insert(fixture.assets.map((asset, index) => ({ id: asset.id, post_id: fixture.postId, filename: `r2-test-${index + 1}.${asset.mimeType === 'image/jpeg' ? 'jpg' : asset.mimeType.split('/')[1]}`,
      mime_type: asset.mimeType, size_bytes: asset.size, original_path: `r2:${asset.key}`, thumbnail_path: `r2:${asset.key}`, position: index })));
    assert(!assets.error, 'Test assets creation failed');
    const publish = await client.from('publications').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', fixture.id);
    assert(!publish.error, 'Test activation failed');
    console.log(JSON.stringify({ testLink: `https://cheez-burger.github.io/kudae-sns-hub/#/d/${fixture.token}`, originalImages: 2, realDistributionsUnchanged: true }));
  } else if (mode === '--check') {
    const fixture: Fixture = JSON.parse(await Deno.readTextFile(file));
    const api = `${project}/functions/v1/public-distribution`;
    const preflight = await fetch(api, { method: 'OPTIONS', headers: { Origin: 'https://cheez-burger.github.io', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,apikey' } });
    assert(preflight.ok && preflight.headers.get('access-control-allow-origin') === '*', 'Distribution CORS failed');
    const response = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: Deno.env.get('SUPABASE_ANON_KEY') || '' }, body: JSON.stringify({ action: 'read', token: fixture.token }) });
    assert(response.ok, `Distribution read failed (${response.status})`);
    const payload = await response.json();
    assert(payload.posts[0].assets.length === 2, 'Unexpected fixture response');
    for (const asset of payload.posts[0].assets) {
      const expected = fixture.assets.find((item) => item.id === asset.id)!;
      const initial = new URL(asset.originalUrl);
      assert(initial.hostname === 'bcqqokdehkfaiuquktag.supabase.co', 'Old extension trusted host changed');
      const redirect = await fetch(asset.originalUrl, { redirect: 'manual' });
      assert(redirect.status === 302 && redirect.headers.get('access-control-allow-origin') === '*', 'Compatibility redirect failed');
      await redirect.body?.cancel();
      const target = new URL(redirect.headers.get('location') || '');
      assert(target.hostname === '8b7ca7970b7974eadb7a807141a46779.r2.cloudflarestorage.com', 'Unexpected file host');
      const original = await fetch(asset.originalUrl, { headers: { Origin: 'https://www.koreapas.com' }, cache: 'no-store' });
      assert(original.ok && new URL(original.url).hostname === target.hostname, 'Direct R2 download failed');
      assert(['*', 'https://www.koreapas.com'].includes(original.headers.get('access-control-allow-origin') || ''), 'Download CORS failed');
      const bytes = new Uint8Array(await original.arrayBuffer());
      assert(bytes.length === expected.size && await hash(bytes) === expected.sha256, 'Original byte comparison failed');
      console.log(JSON.stringify({ test: 'compatibility-original', ok: true, size: bytes.length, supabaseOnlyRedirects: true }));
    }
    const unauthorized = await fetch(`${project}/functions/v1/media-admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upload' }) });
    assert(unauthorized.status === 401, 'Admin endpoint permits anonymous access');
    console.log(JSON.stringify({ test: 'live-server', ok: true, installedExtensionStillNeedsUserCheck: true }));
  } else if (mode === '--cleanup') {
    const fixture: Fixture = JSON.parse(await Deno.readTextFile(file));
    const { data, error } = await client.from('publications').select('id,title,share_token,created_at').eq('id', fixture.id).maybeSingle();
    assert(!error, 'Test identity lookup failed');
    if (data) {
      assert(data.title === title && data.share_token === fixture.token && data.created_at.startsWith('2000-01-01'), 'Not our disposable test publication');
      const deleted = await client.from('publications').delete().eq('id', fixture.id).eq('share_token', fixture.token);
      assert(!deleted.error, 'Test cleanup failed');
    }
    await Deno.remove(file);
    console.log(JSON.stringify({ cleanedTestPublication: true, deletedMediaObjects: 0, realDistributionsUnchanged: true }));
  } else throw new Error('Use --prepare, --check, or --cleanup');
} catch (error) {
  console.error(error instanceof Error && error.constructor === Error ? error.message : 'Live test failed; inspect state without exposing secrets');
  Deno.exit(1);
}
