import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, ErrorBox, Input, Spinner } from '../components/ui';
import { api } from '../lib/api';
import type { Lead } from '../lib/status';

type Row = { lead_id: string; name: string; sequence_id: string; channel: string; status: string; created_at: string; generated: number; sent: number; replies: number };

export default function Outreach() {
  const [q, setQ] = useState('');
  const list = useQuery({ queryKey: ['outreach'], queryFn: () => api<{ sequences: Row[]; totals: { generated: number; sent: number; replies: number } }>('/api/outreach') });
  const found = useQuery({ queryKey: ['outreach-find', q], enabled: q.trim().length >= 2, queryFn: () => api<Lead[]>(`/api/leads?q=${encodeURIComponent(q.trim())}&pageSize=8`) });
  const d = list.data?.data;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Outreach</h1>
      <p className="text-sm text-muted">Messages are drafted here and sent by you, outside the app. Nothing is ever sent automatically.</p>
      {d && <div className="grid grid-cols-3 gap-3">{([['Generated (drafts)', d.totals.generated], ['Marked as sent', d.totals.sent], ['Replies recorded', d.totals.replies]] as [string, number][]).map(([l, v]) => <Card key={l}><div className="text-xs text-muted">{l}</div><div className="mt-1 text-2xl font-semibold">{v}</div></Card>)}</div>}
      <Card className="space-y-2"><h2 className="font-medium">Start a sequence</h2>
        <Input aria-label="Find a lead" placeholder="Search your leads by name" value={q} onChange={(e) => setQ(e.target.value)} />
        {found.data && (found.data.data.length === 0 ? <p className="text-sm text-muted">No matching leads. Add a business to your leads from Discover or Research first.</p> :
          <ul className="divide-y divide-line text-sm">{found.data.data.map((l) => <li key={l.id} className="flex items-center justify-between py-2"><span>{l.name} <span className="text-muted">· {l.city ?? l.country ?? ''}</span></span><Link className="text-accent" to={`/outreach/${l.id}`}>Open</Link></li>)}</ul>)}</Card>
      {list.isPending && <Spinner />}{list.isError && <ErrorBox error={list.error} />}
      {d && d.sequences.length === 0 && <Card><p className="text-sm text-muted">No sequences yet. Research a business, add it to leads, then generate its messages here.</p></Card>}
      {d && d.sequences.length > 0 && <Card><h2 className="mb-2 font-medium">Recent sequences</h2><ul className="divide-y divide-line text-sm">{d.sequences.map((s) => <li key={s.sequence_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <Link to={`/outreach/${s.lead_id}`} className="font-medium hover:text-accent">{s.name}</Link><span className="flex flex-wrap gap-2"><Badge>{s.channel}</Badge><Badge tone={s.sent ? 'success' : 'muted'}>{s.sent}/{s.generated} sent</Badge>{s.replies > 0 && <Badge tone="accent">{s.replies} reply</Badge>}</span></li>)}</ul></Card>}
    </div>
  );
}
