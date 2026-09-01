import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AdminStudio } from './components/AdminStudio';
import { DistributionPage } from './components/DistributionPage';
import { LoginPage } from './components/LoginPage';
import { isSupabaseConfigured, supabase } from './lib/supabase';

function routeFromHash() {
  const value = location.hash.replace(/^#\/?/, '');
  const match = value.match(/^d\/([^/?]+)/);
  return match ? { name: 'distribution' as const, token: decodeURIComponent(match[1]) } : { name: 'admin' as const };
}

export function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthLoading(false); });
    return () => data.subscription.unsubscribe();
  }, []);

  return useMemo(() => {
    if (route.name === 'distribution') return <DistributionPage token={route.token} />;
    if (!isSupabaseConfigured) return <AdminStudio session={null} demoMode />;
    if (authLoading) return <FullPageLoading label="관리자 로그인 확인 중" />;
    if (!session) return <LoginPage />;
    return <AdminStudio session={session} />;
  }, [route, session, authLoading]);
}

function FullPageLoading({ label }: { label: string }) {
  return <main className="grid min-h-screen place-items-center bg-canvas"><div className="text-center"><span className="spinner mx-auto"/><p className="mt-4 text-sm font-bold text-muted">{label}</p></div></main>;
}
