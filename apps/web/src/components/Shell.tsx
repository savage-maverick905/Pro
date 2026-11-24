import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, ChevronsLeft, ChevronsRight, Compass, FileSearch, LayoutDashboard, LogOut, Send, Settings, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard }, { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/leads', label: 'Leads', icon: Users }, { to: '/research', label: 'Research', icon: FileSearch },
  { to: '/outreach', label: 'Outreach', icon: Send }, { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Vercel has no background worker, so while the app is open it asks the API to process queued research. */
function useWorkerTick() {
  useEffect(() => {
    let stop = false; let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      let next = 20_000;
      if (document.visibilityState === 'visible') {
        try { const r = await api<{ processed: number }>('/api/worker/tick', { method: 'POST' }); if (r.data.processed > 0) next = 1_000; } catch { next = 60_000; }
      }
      if (!stop) timer = setTimeout(run, next);
    };
    timer = setTimeout(run, 3_000);
    return () => { stop = true; clearTimeout(timer); };
  }, []);
}

export default function Shell() {
  useWorkerTick();
  const [collapsed, setCollapsed] = useState(false);
  const nav = useNavigate(); const qc = useQueryClient();
  const logout = useMutation({ mutationFn: () => api('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => { qc.clear(); nav('/login'); } });
  return (
    <div className="min-h-screen md:flex">
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface p-3 transition-all md:flex ${collapsed ? 'w-16' : 'w-56'}`}>
        <div className={`mb-6 px-2 pt-2 text-lg font-semibold ${collapsed ? 'sr-only' : ''}`}>Prospect<span className="text-accent">OS</span></div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
          {NAV.map(({ to, label, icon: I }) => (
            <NavLink key={to} to={to} end={to === '/'} title={label}
              className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-card hover:text-ink'}`}>
              <I className="h-5 w-5 shrink-0" /><span className={collapsed ? 'sr-only' : ''}>{label}</span>
            </NavLink>))}
        </nav>
        <button onClick={() => logout.mutate()} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-card"><LogOut className="h-5 w-5" /><span className={collapsed ? 'sr-only' : ''}>Sign out</span></button>
        <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-card">
          {collapsed ? <ChevronsRight className="h-5 w-5" /> : <><ChevronsLeft className="h-5 w-5" />Collapse</>}</button>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-base/95 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <span className="font-semibold">Prospect<span className="text-accent">OS</span></span>
          <button onClick={() => logout.mutate()} aria-label="Sign out" className="text-muted"><LogOut className="h-5 w-5" /></button>
        </header>
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8"><Outlet /></main>
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map(({ to, label, icon: I }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${isActive ? 'text-accent' : 'text-muted'}`}>
              <I className="h-5 w-5" />{label}</NavLink>))}
        </nav>
      </div>
    </div>
  );
}
