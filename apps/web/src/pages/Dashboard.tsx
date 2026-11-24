import { useQuery } from '@tanstack/react-query';
import { Card, ErrorBox, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { statusLabel } from '../lib/status';

type Overview = {
  total: number; no_website: number; high_opportunity: number; researched: number; research_pending: number;
  contacted: number; replies: number; interested: number; converted: number; conversion_rate: number | null;
  pipeline: Record<string, number>;
  recent_activities: { id: string; description: string; created_at: string; business_name: string }[];
  active_jobs: { id: string; job_type: string; status: string; total_tasks: number; completed_tasks: number; failed_tasks: number }[];
};
const PIPE = ['new', 'qualified', 'ready_to_contact', 'contacted', 'replied', 'interested', 'converted'];

export default function Dashboard() {
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/api/analytics/overview'), refetchInterval: 15_000 });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const d = q.data.data;
  const kpis: [string, string | number][] = [['Total prospects', d.total], ['No website found', d.no_website], ['High opportunity', d.high_opportunity],
    ['Researched', d.researched], ['Research pending', d.research_pending], ['Contacted', d.contacted], ['Replies', d.replies],
    ['Interested', d.interested], ['Converted', d.converted], ['Conversion rate', d.conversion_rate === null ? '—' : `${d.conversion_rate}%`]];
  const max = Math.max(1, ...PIPE.map((s) => d.pipeline[s] ?? 0));
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map(([l, v]) => <Card key={l}><div className="text-xs text-muted">{l}</div><div className="mt-1 text-2xl font-semibold">{v}</div></Card>)}
      </div>
      <p className="text-xs text-muted">Contacted, replies and interested are derived from lead status until manual outreach tracking is added.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-3 font-medium">Pipeline</h2>
          <ul className="space-y-2">{PIPE.map((s) => { const n = d.pipeline[s] ?? 0; return (
            <li key={s} className="text-sm"><div className="mb-1 flex justify-between"><span className="text-muted">{statusLabel(s)}</span><span>{n}</span></div>
              <div className="h-2 rounded bg-surface"><div className="h-2 rounded bg-accent" style={{ width: `${(n / max) * 100}%` }} /></div></li>); })}</ul></Card>
        <Card><h2 className="mb-3 font-medium">Active jobs</h2>
          {d.active_jobs.length === 0 ? <p className="text-sm text-muted">No active jobs.</p> :
            <ul className="space-y-2 text-sm">{d.active_jobs.map((j) => <li key={j.id} className="flex justify-between"><span>{j.job_type} · {j.status}</span><span className="text-muted">{j.completed_tasks}/{j.total_tasks}{j.failed_tasks ? ` (${j.failed_tasks} failed)` : ''}</span></li>)}</ul>}</Card>
      </div>
      <Card><h2 className="mb-3 font-medium">Recent activity</h2>
        {d.recent_activities.length === 0 ? <p className="text-sm text-muted">Nothing yet. Add a lead to get started.</p> :
          <ul className="divide-y divide-line text-sm">{d.recent_activities.map((a) => <li key={a.id} className="flex justify-between gap-3 py-2">
            <span><span className="font-medium">{a.business_name}</span> <span className="text-muted">· {a.description}</span></span>
            <time className="shrink-0 text-xs text-muted">{new Date(a.created_at).toLocaleString()}</time></li>)}</ul>}</Card>
    </div>
  );
}
