import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, ErrorBox, Field, Input, Spinner } from '../components/ui';
import { api } from '../lib/api';

type Settings = { research: { paused: boolean }; outreach: { senderName: string; senderBusiness: string; signature: string; defaultCta: string; optOutLine: string; language: string };
  scoring: { weights: Record<string, number> }; ai: { enabled: boolean; dailyTokenLimit: number; maxOutputTokensFast: number; maxOutputTokensDeep: number; configured: boolean; model: string; tokensUsedToday: number } };
type Provider = { name: string; label: string; requiresKey: boolean; configured: boolean; enabled: boolean; coverageNote: string };
type Service = { id: string; name: string; description: string; targetCategories: string[]; problemsSolved: string[]; keywords: string[]; priority: number; active: boolean };
type Sup = { id: string; business_name: string | null; contact_value: string | null; reason: string | null; created_at: string };
const WEIGHT_LABELS: Record<string, string> = { websiteDeficiency: 'Website absence or deficiencies', problem: 'Identifiable problem', solutionValue: 'Value of a relevant solution', contactAccess: 'Public contact accessibility', evidenceConfidence: 'Evidence confidence', activity: 'Business activity signals' };
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const Section = ({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) => <details open={open} className="rounded-xl border border-line bg-card p-4"><summary className="cursor-pointer font-medium">{title}</summary><div className="mt-3 space-y-3">{children}</div></details>;
const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/settings') });
function useSave() { const qc = useQueryClient(); return useMutation({ mutationFn: (body: unknown) => api('/api/settings', { method: 'PATCH', body }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }) }); }

function Providers() {
  const qc = useQueryClient(); const q = useQuery({ queryKey: ['providers'], queryFn: () => api<Provider[]>('/api/providers') }); const [res, setRes] = useState<Record<string, string>>({});
  const toggle = useMutation({ mutationFn: (p: Provider) => api(`/api/providers/${p.name}`, { method: 'PATCH', body: { enabled: !p.enabled } }), onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }) });
  const test = useMutation({ mutationFn: (p: Provider) => api<{ ok: boolean; message: string }>(`/api/providers/${p.name}/test`, { method: 'POST' }), onSuccess: (r, p) => setRes((x) => ({ ...x, [p.name]: `${r.data.ok ? 'OK' : 'Failed'}: ${r.data.message}` })) });
  return <>{q.isPending && <Spinner />}{q.data?.data.map((p) => <div key={p.name} className="space-y-1 border-b border-line pb-3 text-sm last:border-0"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{p.label}</span>
    <Badge tone={p.configured ? 'success' : 'warm'}>{p.configured ? 'configured' : 'no API key'}</Badge><Badge>{p.enabled ? 'enabled' : 'disabled'}</Badge></div><p className="text-xs text-muted">{p.coverageNote}</p>
    <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" className="min-h-9" onClick={() => toggle.mutate(p)}>{p.enabled ? 'Disable' : 'Enable'}</Button><Button variant="ghost" className="min-h-9" disabled={test.isPending} onClick={() => test.mutate(p)}>Test connection</Button>{res[p.name] && <span className="text-xs text-muted">{res[p.name]}</span>}</div></div>)}
    <p className="text-xs text-muted">API keys are set as server environment variables, never in this screen. See INSTALLATION.md.</p></>;
}

function Ai() {
  const s = useSettings(); const save = useSave(); const [v, setV] = useState({ enabled: true, dailyTokenLimit: 300000, maxOutputTokensFast: 1200, maxOutputTokensDeep: 2000 });
  useEffect(() => { const a = s.data?.data.ai; if (a) setV({ enabled: a.enabled, dailyTokenLimit: a.dailyTokenLimit, maxOutputTokensFast: a.maxOutputTokensFast, maxOutputTokensDeep: a.maxOutputTokensDeep }); }, [s.data]);
  const a = s.data?.data.ai; const num = (k: 'dailyTokenLimit' | 'maxOutputTokensFast' | 'maxOutputTokensDeep', l: string) => <Field label={l}><Input type="number" value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} /></Field>;
  return <>{a && <p className="text-sm text-muted">Groq: {a.configured ? `configured, model ${a.model}` : 'GROQ_API_KEY is not set'} · {a.tokensUsedToday.toLocaleString()} tokens used today. Free tiers have limits; the daily cap below stops AI calls when reached.</p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />AI analysis and outreach enabled</label>
    <div className="grid gap-3 sm:grid-cols-3">{num('dailyTokenLimit', 'Daily token limit')}{num('maxOutputTokensFast', 'Max output tokens (fast)')}{num('maxOutputTokensDeep', 'Max output tokens (deep)')}</div>
    <Button disabled={save.isPending} onClick={() => save.mutate({ ai: v })}>Save AI settings</Button>{save.isError && <ErrorBox error={save.error} />}{save.isSuccess && <span className="ml-2 text-sm text-success">Saved</span>}</>;
}

function Scoring() {
  const s = useSettings(); const save = useSave(); const [w, setW] = useState<Record<string, number>>({}); useEffect(() => { if (s.data) setW(s.data.data.scoring.weights); }, [s.data]);
  const total = Object.values(w).reduce((a, b) => a + (b || 0), 0);
  return <>{Object.keys(WEIGHT_LABELS).map((k) => <Field key={k} label={WEIGHT_LABELS[k]}><Input type="number" min={0} max={100} value={w[k] ?? 0} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} /></Field>)}
    <p className="text-sm text-muted">Weights add up to {total}. Scores are scaled to 100, so they need not add up to exactly 100.</p>
    <Button disabled={save.isPending || total <= 0} onClick={() => save.mutate({ scoring: { weights: w } })}>Save weights</Button>{save.isError && <ErrorBox error={save.error} />}{save.isSuccess && <span className="ml-2 text-sm text-success">Saved. Applies to the next analysis.</span>}</>;
}

function Sender() {
  const s = useSettings(); const save = useSave(); const [o, setO] = useState({ senderName: '', senderBusiness: '', signature: '', defaultCta: '', optOutLine: '', language: 'English' });
  useEffect(() => { if (s.data) setO(s.data.data.outreach); }, [s.data]);
  const f = (k: keyof typeof o, l: string) => <Field label={l}><Input value={o[k]} onChange={(e) => setO({ ...o, [k]: e.target.value })} /></Field>;
  return <><p className="text-sm text-muted">Used in generated messages. Leave a field empty and the message will use a placeholder such as [Your name].</p>
    <div className="grid gap-3 sm:grid-cols-2">{f('senderName', 'Your name')}{f('senderBusiness', 'Your business')}{f('defaultCta', 'Default call to action')}{f('language', 'Message language')}</div>
    <Field label="Signature (include a way to reach you)"><textarea rows={3} value={o.signature} onChange={(e) => setO({ ...o, signature: e.target.value })} className="w-full rounded-lg border border-line bg-surface p-3 text-sm" /></Field>{f('optOutLine', 'Opt-out line')}
    <Button disabled={save.isPending} onClick={() => save.mutate({ outreach: o })}>Save</Button>{save.isError && <ErrorBox error={save.error} />}{save.isSuccess && <span className="ml-2 text-sm text-success">Saved</span>}</>;
}

function ServiceForm({ init, onSave, onCancel, busy }: { init?: Service; onSave: (b: Omit<Service, 'id'>) => void; onCancel?: () => void; busy: boolean }) {
  const [n, setN] = useState(init?.name ?? ''); const [d, setD] = useState(init?.description ?? ''); const [t, setT] = useState(init?.targetCategories.join(', ') ?? ''); const [p, setP] = useState(init?.problemsSolved.join(', ') ?? '');
  const [k, setK] = useState(init?.keywords.join(', ') ?? ''); const [pr, setPr] = useState(init?.priority ?? 5);
  return <div className="space-y-2 rounded-lg bg-surface p-3"><Field label="Name"><Input value={n} onChange={(e) => setN(e.target.value)} /></Field><Field label="Description"><Input value={d} onChange={(e) => setD(e.target.value)} /></Field>
    <Field label="Target business types (comma separated, empty = any)"><Input value={t} onChange={(e) => setT(e.target.value)} /></Field><Field label="Problems it solves (comma separated)"><Input value={p} onChange={(e) => setP(e.target.value)} /></Field>
    <Field label="Keywords"><Input value={k} onChange={(e) => setK(e.target.value)} /></Field><Field label="Priority (1 to 10)"><Input type="number" min={1} max={10} value={pr} onChange={(e) => setPr(Number(e.target.value))} /></Field>
    <div className="flex gap-2"><Button disabled={!n.trim() || busy} onClick={() => onSave({ name: n.trim(), description: d, targetCategories: csv(t), problemsSolved: csv(p), keywords: csv(k), priority: pr, active: init?.active ?? true })}>Save service</Button>{onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}</div></div>;
}
function Services() {
  const qc = useQueryClient(); const q = useQuery({ queryKey: ['services'], queryFn: () => api<Service[]>('/api/services') }); const [edit, setEdit] = useState<string | null>(null); const [adding, setAdding] = useState(false);
  const done = () => { setEdit(null); setAdding(false); qc.invalidateQueries({ queryKey: ['services'] }); };
  const patch = useMutation({ mutationFn: ({ id, body }: { id: string; body: Partial<Service> }) => api(`/api/services/${id}`, { method: 'PATCH', body }), onSuccess: done });
  const add = useMutation({ mutationFn: (body: Omit<Service, 'id'>) => api('/api/services', { method: 'POST', body }), onSuccess: done });
  const del = useMutation({ mutationFn: (id: string) => api(`/api/services/${id}`, { method: 'DELETE' }), onSuccess: done });
  const err = patch.error ?? add.error ?? del.error;
  return <>{q.isPending && <Spinner />}{err && <ErrorBox error={err} />}
    {q.data?.data.map((s) => <div key={s.id} className="border-b border-line pb-2 text-sm last:border-0">{edit === s.id ? <ServiceForm init={s} busy={patch.isPending} onCancel={() => setEdit(null)} onSave={(b) => patch.mutate({ id: s.id, body: b })} /> :
      <div className="flex flex-wrap items-center justify-between gap-2"><div><span className={s.active ? 'font-medium' : 'font-medium text-muted line-through'}>{s.name}</span> <span className="text-xs text-muted">priority {s.priority}</span><p className="text-xs text-muted">{s.description}</p></div>
        <div className="flex gap-2"><Button variant="ghost" className="min-h-9" onClick={() => patch.mutate({ id: s.id, body: { active: !s.active } })}>{s.active ? 'Disable' : 'Enable'}</Button><Button variant="ghost" className="min-h-9" onClick={() => setEdit(s.id)}>Edit</Button>
          <Button variant="danger" className="min-h-9" onClick={() => confirm(`Delete "${s.name}"? Existing recommendations keep their text.`) && del.mutate(s.id)}>Delete</Button></div></div>}</div>)}
    {adding ? <ServiceForm busy={add.isPending} onCancel={() => setAdding(false)} onSave={(b) => add.mutate(b)} /> : <Button variant="ghost" onClick={() => setAdding(true)}>Add service</Button>}</>;
}

function Suppression() {
  const qc = useQueryClient(); const q = useQuery({ queryKey: ['suppression'], queryFn: () => api<Sup[]>('/api/suppression') }); const [v, setV] = useState(''); const [r, setR] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['suppression'] });
  const add = useMutation({ mutationFn: () => api('/api/suppression', { method: 'POST', body: { contactValue: v, reason: r || undefined } }), onSuccess: () => { setV(''); setR(''); refresh(); } });
  const del = useMutation({ mutationFn: (id: string) => api(`/api/suppression/${id}`, { method: 'DELETE' }), onSuccess: refresh });
  return <><p className="text-sm text-muted">Anyone here is never contacted: generation and "mark as sent" are blocked. Replies that ask to stop are added automatically.</p>
    <div className="flex flex-wrap gap-2"><Input aria-label="Email or phone" placeholder="Email or phone number" className="max-w-xs" value={v} onChange={(e) => setV(e.target.value)} /><Input aria-label="Reason" placeholder="Reason (optional)" className="max-w-xs" value={r} onChange={(e) => setR(e.target.value)} /><Button disabled={v.trim().length < 3 || add.isPending} onClick={() => add.mutate()}>Add</Button></div>
    {(add.isError || del.isError) && <ErrorBox error={add.error ?? del.error} />}{q.isPending && <Spinner />}{q.data?.data.length === 0 && <p className="text-sm text-muted">The list is empty.</p>}
    <ul className="divide-y divide-line text-sm">{q.data?.data.map((s) => <li key={s.id} className="flex items-center justify-between gap-2 py-2"><span>{s.business_name ?? s.contact_value}<span className="text-muted"> · {s.reason ?? 'no reason'} · {new Date(s.created_at).toLocaleDateString()}</span></span>
      <button className="text-accent" onClick={() => confirm('Remove from the suppression list?') && del.mutate(s.id)}>Remove</button></li>)}</ul></>;
}

export default function SettingsPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Section title="Discovery providers" open><Providers /></Section>
      <Section title="AI (Groq)"><Ai /></Section>
      <Section title="Opportunity scoring weights"><Scoring /></Section>
      <Section title="Service catalogue"><Services /></Section>
      <Section title="Outreach sender details"><Sender /></Section>
      <Section title="Suppression list (do not contact)"><Suppression /></Section>
      <p className="text-xs text-muted">Research pause, depth and concurrency live on the Research screen. Daily goals, currency, export and backup settings are not built yet.</p>
    </div>
  );
}
