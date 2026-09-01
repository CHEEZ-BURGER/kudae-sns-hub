import { FormEvent, useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, ShieldCheck, UserPlus, UsersRound, X } from 'lucide-react';
import { createAdminAccount, listAdminAccounts, type AdminAccount } from '../lib/admin-auth';

export function AdminUsersPanel({ onClose }: { onClose: () => void }) {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function refresh(clearMessage = true) {
    setLoading(true); if (clearMessage) setMessage('');
    try { setAdmins(await listAdminAccounts()); }
    catch (error) { setMessage(error instanceof Error ? error.message : '관리자 목록을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      await createAdminAccount(username, password);
      setUsername(''); setPassword(''); setMessage('새 관리자를 추가했습니다.');
      await refresh(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : '관리자를 추가하지 못했습니다.'); }
    finally { setSaving(false); }
  }

  return <section className="panel mb-7 overflow-hidden">
    <header className="flex items-center justify-between gap-4 border-b border-line p-5">
      <div><p className="eyebrow">계정 관리</p><h2 className="mt-1 text-xl font-black">관리자 추가</h2><p className="mt-1 text-xs leading-5 text-muted">관리자만 새 관리자를 만들 수 있습니다.</p></div>
      <button className="icon-button" onClick={onClose} title="닫기"><X/></button>
    </header>
    <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,.9fr)_minmax(320px,1.1fr)]">
      <form onSubmit={submit} className="rounded-xl border border-line bg-canvas p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-black"><UserPlus className="text-crimson"/>새 계정 만들기</div>
        <label className="field"><span>관리자 ID</span><input value={username} onChange={(event)=>setUsername(event.target.value)} placeholder="desk_editor" autoComplete="off" required/></label>
        <label className="field mt-3"><span>초기 비밀번호</span><div className="input-with-icon"><KeyRound/><input type="password" value={password} onChange={(event)=>setPassword(event.target.value)} placeholder="8자 이상" autoComplete="new-password" minLength={8} required/></div></label>
        <p className="mt-3 text-[11px] leading-5 text-muted">비밀번호는 화면이나 데이터베이스에 평문으로 저장되지 않고 Supabase Auth가 안전하게 처리합니다.</p>
        <button className="button primary mt-4 w-full" disabled={saving}>{saving ? <><LoaderCircle className="animate-spin"/>추가 중…</> : <><UserPlus/>관리자 추가</>}</button>
      </form>
      <div>
        <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-black"><UsersRound className="text-crimson"/>현재 관리자</div><span className="text-xs text-muted">{admins.length}명</span></div>
        {loading ? <div className="empty-inline"><LoaderCircle className="animate-spin"/><span>불러오는 중…</span></div> : admins.length ? <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">{admins.map((admin)=><div className="flex items-center justify-between gap-3 bg-white p-4" key={admin.id}><div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-crimson-soft text-crimson"><ShieldCheck size={17}/></span><div className="min-w-0"><b className="block truncate text-sm">{admin.username}</b><span className="text-[11px] text-muted">{new Date(admin.createdAt).toLocaleDateString('ko-KR')} 등록</span></div></div><span className="tag">관리자</span></div>)}</div> : <div className="empty-inline"><UsersRound/><span>등록된 관리자가 없습니다.</span></div>}
      </div>
    </div>
    {message && <p className="notice mx-5 mb-5">{message}</p>}
  </section>;
}
