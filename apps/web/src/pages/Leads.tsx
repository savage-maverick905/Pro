import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Columns3, LayoutGrid, Plus, Search, Table2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Badge, Button, Card, ErrorBox, Field, Input, Spinner, scoreTone } from '../components/ui';
import { api } from '../lib/api';
import { STATUSES, websiteLabel, type Lead } from '../lib/status';

type View = 'table' | 'cards' | 'kanban';

function StatusSelect({ value, onChange, label }: { value: string; onChange: (s: string) => void; label: string }) {
  return <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="min-h-9 rounded-lg border border-line bg-surface px-2 text-sm">
    {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}
const place = (l: Lead) => [l.city, l.country].filter(Boolean).join(', ') || 'Location unknown';

function LeadCard({ lead, onStatus }: { lead: Lead; onStatus: (id: string, s: string) => void }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/leads/${lead.id}`} className="font-medium hover:text-accent">{lead.name}</Link>
        <Badge tone={scoreTone(lead.opportunity_score)}>{lead.opportunity_score ?? 'Not scored'}</Badge></div>
      <div className="text-xs text-muted">{[lead.category, place(lead)].filter(Boolean).join(' · ')}</div>
      <div className="text-xs text-muted">{websiteLabel(lead.website_status)}</div>
      <StatusSelect label={`Status for ${lead.name}`} value={lead.status} onChange={(s) => onStatus(lead.id, s)} />
    </Card>
  );
}

const schema = z.object({
  name: z.string().trim().min(1, 'Required').max(200), category: z.string().trim().max(100), city: z.string().trim().max(100),
  country: z.string().trim().max(100), countryCode: z.union([z.literal(''), z.string().length(2, 'Two letters')]),
  websiteUrl: z.string().trim().max(500), phone: z.string().trim().max(40),
  email: z.union([z.literal(''), z.string().email('Invalid email')]), notes: z.string().max(5000),
});
type FormValues = z.infer<typeof schema>;

function AddLead({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema),
    defaultValues: { name: '', category: '', city: '', country: '', countryCode: '', websiteUrl: '', phone: '', email: '', notes: '' } });
  const m = useMutation({
    mutationFn: (v: FormValues) => api('/api/leads', { method: 'POST', body: Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '')) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['overview'] }); onClose(); } });
  return (
    <div role="dialog" aria-modal="true" aria-label="Add lead" className="fixed inset-0 z-20 grid place-items-end bg-black/60 p-0 md:place-items-center md:p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-b-none md:rounded-b-xl">
        <h2 className="mb-3 text-lg font-semibold">Add lead</h2>
        <form onSubmit={handleSubmit((v) => m.mutate(v))} className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Business name *" error={errors.name?.message}><Input {...register('name')} /></Field></div>
          <Field label="Category"><Input {...register('category')} /></Field>
          <Field label="City"><Input {...register('city')} /></Field>
          <Field label="Country"><Input {...register('country')} /></Field>
          <Field label="Country code" error={errors.countryCode?.message}><Input placeholder="GB" {...register('countryCode')} /></Field>
          <Field label="Website"><Input {...register('websiteUrl')} /></Field>
          <Field label="Phone"><Input type="tel" {...register('phone')} /></Field>
          <div className="sm:col-span-2"><Field label="Email" error={errors.email?.message}><Input type="email" {...register('email')} /></Field></div>
          <div className="sm:col-span-2"><Field label="Notes"><textarea {...register('notes')} rows={3} className="w-full rounded-lg border border-line bg-surface p-3 text-sm" /></Field></div>
          {m.isError && <div className="sm:col-span-2"><ErrorBox error={m.error} /></div>}
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={m.isPending}>Save lead</Button></div>
        </form>
      </Card>
    </div>
  );
}

export default function Leads() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('table');
  const [q, setQ] = useState(''); const [dq, setDq] = useState('');
  const [status, setStatus] = useState(''); const [page, setPage] = useState(1);
  const [sort, setSort] = useState('updated'); const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [sel, setSel] = useState<Set<string>>(new Set()); const [adding, setAdding] = useState(false);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);

  const kanban = view === 'kanban'; const pageSize = kanban ? 100 : 25;
  const params = new URLSearchParams({ sort, dir, page: String(page), pageSize: String(pageSize) });
  if (dq) params.set('q', dq);
  if (status && !kanban) params.set('status', status);
  const list = useQuery({ queryKey: ['leads', params.toString()], queryFn: () => api<Lead[]>(`/api/leads?${params}`), placeholderData: keepPreviousData });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['overview'] }); };
  const setOne = useMutation({ mutationFn: ({ id, s }: { id: string; s: string }) => api(`/api/leads/${id}`, { method: 'PATCH', body: { status: s } }), onSuccess: refresh });
  const bulk = useMutation({ mutationFn: (s: string) => api('/api/leads/bulk-update', { method: 'POST', body: { ids: [...sel], status: s } }), onSuccess: () => { setSel(new Set()); refresh(); } });

  const leads = list.data?.data ?? []; const total = list.data?.meta?.total ?? 0; const pages = Math.max(1, Math.ceil(total / pageSize));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const onStatus = (id: string, s: string) => setOne.mutate({ id, s });
  const sortBy = (k: string) => { if (sort === k) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir(k === 'name' ? 'asc' : 'desc'); } };
  const VIEWS: [View, typeof Table2, string][] = [['table', Table2, 'Table'], ['cards', LayoutGrid, 'Cards'], ['kanban', Columns3, 'Kanban']];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Leads <span className="text-sm font-normal text-muted">({total})</span></h1>
        <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add lead</Button></div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted" />
          <Input aria-label="Search leads" placeholder="Search by name" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {!kanban && <select aria-label="Filter by status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="min-h-10 rounded-lg border border-line bg-surface px-2 text-sm">
          <option value="">All statuses</option>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
        <div className="flex rounded-lg border border-line" role="group" aria-label="View">
          {VIEWS.map(([v, I, l]) => <button key={v} onClick={() => { setView(v); setPage(1); setSel(new Set()); }} aria-pressed={view === v} aria-label={l}
            className={`px-3 ${view === v ? 'bg-accent/15 text-accent' : 'text-muted'}`}><I className="h-4 w-4" /></button>)}</div>
      </div>
      {sel.size > 0 && <Card className="flex flex-wrap items-center gap-3 py-3"><span className="text-sm">{sel.size} selected</span>
        <select aria-label="Set status for selected" defaultValue="" onChange={(e) => e.target.value && bulk.mutate(e.target.value)} className="min-h-9 rounded-lg border border-line bg-surface px-2 text-sm">
          <option value="" disabled>Set status…</option>{STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <Button variant="ghost" onClick={() => setSel(new Set())}>Clear</Button></Card>}
      {list.isPending && <Spinner />}
      {list.isError && <ErrorBox error={list.error} />}
      {list.isSuccess && leads.length === 0 && <Card><p className="text-sm text-muted">No leads match. Add one manually, or use Discover once it is built (Phase 2).</p></Card>}

      {view === 'table' && leads.length > 0 && (<>
        <div className="hidden overflow-x-auto rounded-xl border border-line md:block"><table className="w-full text-left text-sm">
          <thead className="bg-surface text-muted"><tr>
            <th className="w-10 p-3"><input type="checkbox" aria-label="Select all on page" checked={leads.every((l) => sel.has(l.id))} onChange={(e) => setSel(e.target.checked ? new Set(leads.map((l) => l.id)) : new Set())} /></th>
            {[['name', 'Business'], ['', 'Location'], ['', 'Website'], ['score', 'Score'], ['', 'Status'], ['updated', 'Updated']].map(([k, l]) =>
              <th key={l} className="p-3 font-medium">{k ? <button onClick={() => sortBy(k)} aria-label={`Sort by ${l}`}>{l}{sort === k ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</button> : l}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{leads.map((l) => (
            <tr key={l.id} className="bg-card hover:bg-surface">
              <td className="p-3"><input type="checkbox" aria-label={`Select ${l.name}`} checked={sel.has(l.id)} onChange={() => toggle(l.id)} /></td>
              <td className="p-3"><Link to={`/leads/${l.id}`} className="font-medium hover:text-accent">{l.name}</Link><div className="text-xs text-muted">{l.category}</div></td>
              <td className="p-3 text-muted">{place(l)}</td><td className="p-3 text-muted">{websiteLabel(l.website_status)}</td>
              <td className="p-3"><Badge tone={scoreTone(l.opportunity_score)}>{l.opportunity_score ?? '—'}</Badge></td>
              <td className="p-3"><StatusSelect label={`Status for ${l.name}`} value={l.status} onChange={(s) => onStatus(l.id, s)} /></td>
              <td className="p-3 text-xs text-muted">{new Date(l.updated_at).toLocaleDateString()}</td></tr>))}</tbody></table></div>
        <div className="grid gap-3 md:hidden">{leads.map((l) => <LeadCard key={l.id} lead={l} onStatus={onStatus} />)}</div></>)}

      {view === 'cards' && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{leads.map((l) => <LeadCard key={l.id} lead={l} onStatus={onStatus} />)}</div>}

      {kanban && leads.length > 0 && (<>
        {total > pageSize && <p className="text-xs text-muted">Showing the {pageSize} most recently updated of {total} leads. Use search to narrow.</p>}
        <div className="flex gap-3 overflow-x-auto pb-2">{STATUSES.map(([v, l]) => { const col = leads.filter((x) => x.status === v); return (
          <section key={v} aria-label={l} className="w-64 shrink-0 space-y-2"><h2 className="text-sm text-muted">{l} <span>({col.length})</span></h2>
            {col.map((x) => <LeadCard key={x.id} lead={x} onStatus={onStatus} />)}</section>); })}</div></>)}

      {!kanban && total > pageSize && <div className="flex items-center justify-center gap-3 text-sm">
        <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-muted">Page {page} of {pages}</span>
        <Button variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
      {adding && <AddLead onClose={() => setAdding(false)} />}
    </div>
  );
}
