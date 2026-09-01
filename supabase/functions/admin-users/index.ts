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

const validUsername = (value: string) => /^[a-z0-9][a-z0-9._-]{2,39}$/.test(value);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: '허용되지 않은 요청입니다.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return json({ error: '서버 설정이 완료되지 않았습니다.' }, 500);

  const accessToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!accessToken) return json({ error: '관리자 로그인이 필요합니다.' }, 401);

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user) return json({ error: '로그인이 만료되었습니다. 다시 로그인해 주세요.' }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle();
  if (!profile?.is_admin) return json({ error: '관리자 권한이 없습니다.' }, 403);

  let input: Record<string, unknown>;
  try { input = await request.json(); }
  catch { return json({ error: '요청 형식이 올바르지 않습니다.' }, 400); }

  if (input.action === 'list') {
    const { data, error } = await admin.from('profiles').select('id, username, created_at').eq('is_admin', true).order('created_at');
    if (error) return json({ error: '관리자 목록을 불러오지 못했습니다.' }, 500);
    return json({ admins: (data ?? []).map((item) => ({ id: item.id, username: item.username, createdAt: item.created_at })) });
  }

  if (input.action !== 'create') return json({ error: '알 수 없는 요청입니다.' }, 400);
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!validUsername(username)) return json({ error: '관리자 ID 형식이 올바르지 않습니다.' }, 400);
  if (password.length < 8 || password.length > 128) return json({ error: '비밀번호는 8~128자로 입력해 주세요.' }, 400);

  const email = `${username}@admin.kudae.invalid`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createError || !created.user) {
    const duplicate = /already|registered|exists/i.test(createError?.message ?? '');
    return json({ error: duplicate ? '이미 사용 중인 관리자 ID입니다.' : '관리자 계정을 만들지 못했습니다.' }, 400);
  }

  const { error: profileError } = await admin.from('profiles').update({ username, is_admin: true }).eq('id', created.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: '관리자 권한을 저장하지 못했습니다.' }, 500);
  }

  return json({ admin: { id: created.user.id, username, createdAt: created.user.created_at } }, 201);
});
