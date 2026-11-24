import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, ErrorBox, Input, Spinner, scoreTone } from '../components/ui';
import { api } from '../lib/api';
import type { Biz } from '../lib/discovery';
import { RESEARCH_OPTIONS } from '../lib/discovery';
import { websiteLabel } from '../lib/status';

type RS = { paused: boolean; concurrency: number; depth: 'fast' | 'deep'; freshnessDays: number; maxPerSweep: number };
type Row = Biz & { opportunity_label: string | null };
const ALL = 'partial,completed,needs_review,queued,researching,failed';

export default function Research() {
  const qc = useQueryClient();
  const [status, setStatus] = useState(''); const [minScore, setMinScore] = useState(''); const [q, setQ] = useState(''); const [dq, setDq] = useState(''); const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const settings = useQuery({ queryKey: ['research-settings'], queryFn: () => api<RS>('/api/research/settings') });
  const patch = useMutation({ mutationFn: (b: Partial<RS>) => api<RS>('/api/research/settings', { method: 'PATCH', body: b }), onSuccess: () => qc.invalidateQueries({ queryKey: ['research-settings'] }) });
  const list = useQuery({
    queryKey: ['research-list', status, minScore, dq, page],
    queryFn: () => { const p = new URLSearchParams({ researchStatus: status || ALL, sort: 'score', dir: 'desc', page: String(page), pageSize: '25' }); if (minScore) p.set('minScore', minScore); if (dq) p.set('q', dq); return api<Row[]>(`/api/discovery/results?${p}`); },
    placeholderData: keepPreviousData, refetchInterval: 8000 });
  const rows = list.data?.data ?? []; const total = list.data?.meta?.total ?? 0; const pages = Math.max(1, Math.ceil(total / 25)); const s = settings.data?.data;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Research</h1>
      <Card className="space-y-3">
        <h2 className="font-medium">Automatic research</h2>
        {settings.isError && <ErrorBox error={settings.error} />}
        {s && <div className="flex flex-wrap items-center gap-3 text-sm">
          <Button variant={s.paused ? 'primary' : 'ghost'} disabled={patch.isPending} onClick={() => patch.mutate({ paused: !s.paused })}>{s.paused ? 'Resume research' : 'Pause research'}</Button>
          <label className="flex items-center gap-2 text-muted">Depth<select value={s.depth} onChange={(e) => patch.mutate({ depth: e.target.value as 'fast' | 'deep' })} className="min-h-10 rounded-lg border border-line bg-surface px-2 text-ink"><option value="fast">Fast</option><option value="deep">Deep</option></select></label>
          <label className="flex items-center gap-2 text-muted">Concurrency<select value={s.concurrency} onChange={(e) => patch.mutate({ concurrency: Number(e.target.value) })} className="min-h-10 rounded-lg border border-line bg-surface px-2 text-ink">{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
          <span className="text-xs text-muted">{s.paused ? 'Paused: no new businesses are picked up.' : `Up to ${s.maxPerSweep} newly discovered businesses are queued per sweep.`}</span></div>}
        <p className="text-xs text-muted">Research runs in the separate worker process (<code>npm run worker -w apps/api</code>). If nothing progresses, check that it is running.</p>
        {patch.isError && <ErrorBox error={patch.error} />}
      </Card>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" /><Input aria-label="Search" placeholder="Search by name" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select aria-label="Research status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm"><option value="">All researched</option>{RESEARCH_OPTIONS.filter(([v]) => v !== 'not_researched').map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <Input aria-label="Minimum score" type="number" min={0} max={100} placeholder="Min score" className="w-28" value={minScore} onChange={(e) => { setMinScore(e.target.value); setPage(1); }} />
      </div>
      {list.isPending && <Spinner />}{list.isError && <ErrorBox error={list.error} />}
      {list.isSuccess && rows.length === 0 && <Card><p className="text-sm text-muted">Nothing here yet. Run a search in Discover, then start the worker, and researched businesses appear here.</p></Card>}
      {rows.length > 0 && <>
        <div className="hidden overflow-x-auto rounded-xl border border-line md:block"><table className="w-full text-left text-sm"><thead className="bg-surface text-muted"><tr>{['Business', 'Score', 'Research', 'Website', 'Location', 'Sources'].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{rows.map((r) => <tr key={r.id} className="bg-card hover:bg-surface">
            <td className="p-3"><Link to={`/research/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link><div className="text-xs text-muted">{r.category}</div></td>
            <td className="p-3">{r.opportunity_score === null ? <span className="text-muted">Not scored</span> : <><Badge tone={scoreTone(r.opportunity_score)}>{r.opportunity_score}</Badge> <span className="text-xs text-muted">{r.opportunity_label}</span></>}</td>
            <td className="p-3 text-muted">{r.research_status.replace('_', ' ')}</td><td className="p-3 text-muted">{websiteLabel(r.website_status)}</td>
            <td className="p-3 text-muted">{[r.city, r.country_code].filter(Boolean).join(', ') || 'Unknown'}</td><td className="p-3 text-muted">{r.sources?.join(', ')}</td></tr>)}</tbody></table></div>
        <div className="grid gap-3 md:hidden">{rows.map((r) => <Card key={r.id} className="space-y-1 text-sm"><div className="flex items-start justify-between gap-2"><Link to={`/research/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link>
          <Badge tone={scoreTone(r.opportunity_score)}>{r.opportunity_score ?? 'Not scored'}</Badge></div><div className="text-xs text-muted">{r.research_status.replace('_', ' ')} · {websiteLabel(r.website_status)}</div></Card>)}</div>
        {total > 25 && <div className="flex items-center justify-center gap-3 text-sm"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-muted">Page {page} of {pages}</span><Button variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}</>}
    </div>
  );
}
