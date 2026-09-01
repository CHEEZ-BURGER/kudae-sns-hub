import { FormEvent, useState } from 'react';
import { KeyRound, Newspaper, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { adminEmailForId } from '../lib/admin-auth';

export function LoginPage() {
  const markUrl = `${import.meta.env.BASE_URL}branding/ku-weekly-mark.png`;
  const wordmarkUrl = `${import.meta.env.BASE_URL}branding/ku-weekly-wordmark.png`;
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true); setMessage('');
    let email: string;
    try { email = adminEmailForId(adminId); }
    catch (error) { setLoading(false); setMessage(error instanceof Error ? error.message : '관리자 ID를 확인해 주세요.'); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setMessage(error.message === 'Invalid login credentials' ? '관리자 ID 또는 비밀번호를 확인해 주세요.' : error.message);
  }

  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-2">
      <section className="login-brand-panel hidden p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><span className="login-mark-shell"><img src={markUrl} alt="고대신문 심볼"/></span><b>SNS 배포실</b></div>
        <div><img className="login-wordmark" src={wordmarkUrl} alt="The Korea University Weekly Since 1947"/><Newspaper className="mt-10" size={34}/><h1 className="mt-5 max-w-lg text-5xl font-black leading-[1.1] tracking-[-.045em]">파일 찾는 시간은 줄이고,<br/>기사에 집중하세요.</h1><p className="mt-5 max-w-md text-sm leading-7 text-white/80">카드뉴스와 원고를 한 번에 정리해 기자들이 필요한 게시물만 바로 가져가게 합니다.</p></div>
        <p className="text-xs text-white/70">Korea University Newspaper · Internal Tool</p>
      </section>
      <section className="flex items-center justify-center p-5">
        <form className="panel w-full max-w-md p-7 sm:p-9" onSubmit={submit}>
          <div className="mb-6 flex items-center gap-3 lg:hidden"><span className="brand-mark-shell size-12"><img src={markUrl} alt="고대신문 로고"/></span><div><b className="block text-sm">고대신문 SNS 배포실</b><span className="text-xs text-muted">관리자 전용</span></div></div>
          <p className="eyebrow">관리자 로그인</p><h2 className="mt-2 text-2xl font-black">배포 작업을 시작할까요?</h2><p className="mt-2 text-sm leading-6 text-muted">발급받은 관리자 ID와 비밀번호로 로그인해 주세요.</p>
          <label className="field mt-7"><span>관리자 ID</span><div className="input-with-icon"><UserRound/><input type="text" autoComplete="username" value={adminId} onChange={(e)=>setAdminId(e.target.value)} placeholder="admin_id" required/></div></label>
          <label className="field mt-4"><span>비밀번호</span><div className="input-with-icon"><KeyRound/><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="비밀번호" required/></div></label>
          {message && <p className="notice mt-4">{message}</p>}
          <button className="button primary mt-6 w-full" disabled={loading}>{loading ? '로그인 중…' : '로그인'}</button>
        </form>
      </section>
    </main>
  );
}
