import { edgeFunctionUrl, publishableKey, requireSupabase } from './supabase';

export type AdminAccount = {
  id: string;
  username: string;
  createdAt: string;
};

const ADMIN_EMAIL_DOMAIN = 'admin.kudae.invalid';

export function normalizeAdminId(value: string) {
  return value.trim().toLowerCase();
}

export function isValidAdminId(value: string) {
  return /^[a-z0-9][a-z0-9._-]{2,39}$/.test(normalizeAdminId(value));
}

export function adminEmailForId(value: string) {
  const id = normalizeAdminId(value);
  if (!isValidAdminId(id)) throw new Error('관리자 ID는 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~40자 입력해 주세요.');
  return `${id}@${ADMIN_EMAIL_DOMAIN}`;
}

async function adminRequest<T>(action: string, payload: Record<string, unknown> = {}) {
  const client = requireSupabase();
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error('관리자 로그인이 필요합니다.');
  const response = await fetch(edgeFunctionUrl('admin-users'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: publishableKey(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(result.error || '관리자 계정 요청을 처리하지 못했습니다.');
  return result;
}

export async function listAdminAccounts() {
  const result = await adminRequest<{ admins: AdminAccount[] }>('list');
  return result.admins;
}

export async function createAdminAccount(username: string, password: string) {
  const id = normalizeAdminId(username);
  if (!isValidAdminId(id)) throw new Error('관리자 ID는 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~40자 입력해 주세요.');
  if (password.length < 8) throw new Error('비밀번호는 8자 이상 입력해 주세요.');
  return adminRequest<{ admin: AdminAccount }>('create', { username: id, password });
}
