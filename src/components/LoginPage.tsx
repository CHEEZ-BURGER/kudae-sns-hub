import { FormEvent, useState } from 'react';
import { KeyRound, Mail, Newspaper } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true); setMessage('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setMessage(error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호를 확인해 주세요.' : error.message);
  }

  async function magicLink() {
    if (!supabase || !email) { setMessage('이메일을 먼저 입력해 주세요.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}${location.pathname}#/admin` } });
    setLoading(false);
    setMessage(error ? error.message : '로그인 링크를 이메일로 보냈습니다.');
  }

  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-2">
      <section className="hidden bg-crimson p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-white font-black text-crimson">고대</span><b>SNS 배포실</b></div>
        <div><Newspaper size={38}/><h1 className="mt-6 max-w-lg text-5xl font-black leading-[1.1] tracking-[-.045em]">파일 찾는 시간은 줄이고,<br/>기사에 집중하세요.</h1><p className="mt-5 max-w-md text-sm leading-7 text-white/70">카드뉴스와 원고를 한 번에 정리해 기자들이 필요한 게시물만 바로 가져가게 합니다.</p></div>
        <p className="text-xs text-white/55">Korea University Newspaper · Internal Tool</p>
      </section>
      <section className="flex items-center justify-center p-5">
        <form className="panel w-full max-w-md p-7 sm:p-9" onSubmit={submit}>
          <p className="eyebrow">관리자 로그인</p><h2 className="mt-2 text-2xl font-black">배포 작업을 시작할까요?</h2><p className="mt-2 text-sm leading-6 text-muted">Supabase에 등록된 관리자 계정으로 로그인해 주세요.</p>
          <label className="field mt-7"><span>이메일</span><div className="input-with-icon"><Mail/><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="press@kunews.ac.kr" required/></div></label>
          <label className="field mt-4"><span>비밀번호</span><div className="input-with-icon"><KeyRound/><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="비밀번호" required/></div></label>
          {message && <p className="notice mt-4">{message}</p>}
          <button className="button primary mt-6 w-full" disabled={loading}>{loading ? '로그인 중…' : '로그인'}</button>
          <button className="button ghost mt-2 w-full" type="button" onClick={magicLink} disabled={loading}>이메일 로그인 링크 받기</button>
        </form>
      </section>
    </main>
  );
}
