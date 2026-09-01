import { LogOut, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function AppHeader({ reporter = false, email }: { reporter?: boolean; email?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href={reporter ? '#/' : '#/admin'} className="flex items-center gap-3 text-ink no-underline">
          <span className="grid size-9 place-items-center rounded-lg bg-crimson text-sm font-black text-white">고대</span>
          <div><p className="font-bold leading-none">SNS 배포실</p><p className="mt-1 text-[11px] text-muted">고대신문 내부 업무도구</p></div>
        </a>
        {reporter ? <span className="tag"><ShieldCheck size={14}/>배포 링크</span> : (
          <div className="flex items-center gap-2">
            {email && <span className="hidden text-xs text-muted sm:inline">{email}</span>}
            {supabase && <button className="icon-button" title="로그아웃" onClick={() => supabase?.auth.signOut()}><LogOut size={16}/></button>}
          </div>
        )}
      </div>
    </header>
  );
}
