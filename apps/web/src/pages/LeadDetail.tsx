import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, ErrorBox, Field, Input, Spinner, scoreTone } from '../components/ui';
import { api } from '../lib/api';
import { STATUSES, websiteLabel, type Lead } from '../lib/status';

type Detail = Lead & { description: string | null; address: string | null; rating: string | null; review_count: number | null };
type Activity = { id: string; activity_type: string; description: string | null; created_at: string };
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export default function LeadDetail() {
  const { id = '' } = useParams(); const nav = useNavigate(); const qc = useQueryClient();
  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => api<Detail>(`/api/leads/${id}`) });
  const acts = useQuery({ queryKey: ['activities', id], queryFn: () => api<Activity[]>(`/api/leads/${id}/activities`) });
  const [status, setStatus] = useState(''); const [notes, setNotes] = useState(''); const [follow, setFollow] = useState(''); const [tags, setTags] = useState('');
  useEffect(() => { const d = lead.data?.data; if (d) { setStatus(d.status); setNotes(d.notes ?? ''); setFollow(toLocal(d.follow_up_at)); setTags(d.tags.join(', ')); } }, [lead.data]);
  const done = () => { ['lead', 'activities', 'leads', 'overview'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };
  const save = useMutation({ mutationFn: () => api(`/api/leads/${id}`, { method: 'PATCH', body: { status, notes: notes || null,
    followUpAt: follow ? new Date(follow).toISOString() : null, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) } }), onSuccess: done });
  const del = useMutation({ mutationFn: () => api(`/api/leads/${id}`, { method: 'DELETE' }), onSuccess: () => { done(); nav('/leads'); } });
  if (lead.isPending) return <Spinner />;
  if (lead.isError) return <ErrorBox error={lead.error} />;
  const d = lead.data.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><Link to="/leads" className="text-sm text-muted hover:text-ink">← Leads</Link><span className="flex gap-4 text-sm"><Link to={`/research/${d.business_id}`} className="text-accent">Research report</Link><Link to={`/outreach/${d.id}`} className="text-accent">Outreach</Link></span></div>
      <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{d.name}</h1><Badge tone={scoreTone(d.opportunity_score)}>{d.opportunity_score === null ? 'Not scored' : `Score ${d.opportunity_score}`}</Badge></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2 text-sm"><h2 className="font-medium">Business</h2>
          {([['Category', d.category], ['Location', [d.address, d.city, d.country].filter(Boolean).join(', ')], ['Website', d.website_url],
            ['Website status', websiteLabel(d.website_status)], ['Phone', d.phone], ['Email', d.email], ['Research', d.research_status.replace('_', ' ')]] as [string, string | null][]).map(([k, v]) =>
            <div key={k} className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className="text-right">{v || 'Not provided'}</span></div>)}
          <p className="pt-2 text-xs text-muted">Research reports, audits and outreach appear here once Phases 3–5 are built.</p></Card>
        <Card className="space-y-3"><h2 className="font-medium">Lead</h2>
          <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm">
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Follow-up"><Input type="datetime-local" value={follow} onChange={(e) => setFollow(e.target.value)} /></Field>
          <Field label="Tags (comma separated)"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
          <Field label="Notes"><textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-line bg-surface p-3 text-sm" /></Field>
          {save.isError && <ErrorBox error={save.error} />}
          <div className="flex justify-between"><Button variant="danger" disabled={del.isPending} onClick={() => confirm('Delete this lead? The business record is kept.') && del.mutate()}>Delete lead</Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : save.isSuccess ? 'Saved' : 'Save changes'}</Button></div></Card></div>
      <Card><h2 className="mb-2 font-medium">Activity</h2>
        <ul className="divide-y divide-line text-sm">{acts.data?.data.map((a) => <li key={a.id} className="flex justify-between gap-3 py-2"><span>{a.description ?? a.activity_type}</span>
          <time className="shrink-0 text-xs text-muted">{new Date(a.created_at).toLocaleString()}</time></li>)}</ul></Card>
    </div>
  );
}
