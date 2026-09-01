import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase 환경변수가 설정되지 않았습니다. README의 연결 단계를 확인해 주세요.');
  return supabase;
}

export function edgeFunctionUrl(name: string) {
  if (!supabaseUrl) throw new Error('Supabase URL이 설정되지 않았습니다.');
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${name}`;
}

export function publishableKey() {
  if (!supabaseKey) throw new Error('Supabase Publishable Key가 설정되지 않았습니다.');
  return supabaseKey;
}
