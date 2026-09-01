import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

async function sha256(value: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: '허용되지 않은 요청입니다.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return json({ error: '서버 설정이 완료되지 않았습니다.' }, 500);

  let input: Record<string, unknown>;
  try { input = await request.json(); }
  catch { return json({ error: '요청 형식이 올바르지 않습니다.' }, 400); }

  const token = typeof input.token === 'string' ? input.token : '';
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) return json({ error: '올바르지 않은 배포 링크입니다.' }, 404);
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const tokenHash = await sha256(token);
  const { data: publication, error: publicationError } = await client.from('publications')
    .select('id, issue_number, title, published_at, expires_at, status')
    .eq('share_token_hash', tokenHash).eq('status', 'published').maybeSingle();

  if (publicationError || !publication) return json({ error: '만료되었거나 올바르지 않은 배포 링크입니다.' }, 404);
  if (publication.expires_at && new Date(publication.expires_at).getTime() < Date.now()) return json({ error: '이 배포 링크는 만료되었습니다.' }, 410);

  if (input.action !== 'read') return json({ error: '알 수 없는 요청입니다.' }, 400);
  const { data: posts, error: postsError } = await client.from('posts').select('id, title, body, article_url, credits, position').eq('publication_id', publication.id).order('position');
  if (postsError) return json({ error: '게시물을 불러오지 못했습니다.' }, 500);
  const postIds = (posts ?? []).map((post) => post.id);
  const { data: assets } = postIds.length ? await client.from('assets').select('id, post_id, filename, size_bytes, mime_type, thumbnail_path, original_path, position').in('post_id', postIds).order('position') : { data: [] };

  const allPaths = [...new Set((assets ?? []).flatMap((asset) => [asset.thumbnail_path, asset.original_path].filter(Boolean) as string[]))];
  const { data: signed } = await client.storage.from('sns-assets').createSignedUrls(allPaths, 60 * 60);
  const signedMap = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));

  return json({
    id: publication.id,
    issueNumber: publication.issue_number,
    title: publication.title,
    publishedAt: publication.published_at,
    expiresAt: publication.expires_at,
    posts: (posts ?? []).map((post) => ({
      id: post.id, title: post.title, body: post.body, articleUrl: post.article_url ?? '', credits: post.credits ?? '', position: post.position,
      assets: (assets ?? []).filter((asset) => asset.post_id === post.id).map((asset) => ({
        id: asset.id, filename: asset.filename, sizeBytes: Number(asset.size_bytes), mimeType: asset.mime_type, position: asset.position,
        thumbUrl: signedMap.get(asset.thumbnail_path) ?? '', originalUrl: signedMap.get(asset.original_path) ?? '',
      })),
    })),
  });
});
