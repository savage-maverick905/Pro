import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, ErrorBox, Spinner, scoreTone } from '../components/ui';
import { api } from '../lib/api';
import { safeHref } from '../lib/discovery';
import { websiteLabel } from '../lib/status';

type Finding = { claim: string; observation?: string; sourceUrl?: string | null; severity?: string; classification?: string; evidence?: string[]; reasoning?: string };
type Component = { key: string; label: string; max: number; points: number; explanation: string };
type Data = {
  business: { id: string; name: string; research_status: string; website_status: string; website_url: string | null };
  report: null | { id: string; status: string; depth: string; summary: string | null; identity_confidence: string | null; research_confidence: string | null; verified_findings: Finding[]; inferred_findings: Finding[];
    unknown_information: string[]; recommendations: { service: string; problem: string; solution: string; priority: number; confidence: number; evidence: string[] }[];
    raw_ai_response: { guard?: { notes?: string[] } } | null; model: string | null; score: number | null; score_breakdown: { total: number; label: string; components: Component[] } | null; score_label: string | null; created_at: string };
  evidence: { evidence_type: string; classification: string; claim: string; source_url: string | null; observation: string | null; confidence: string | null }[];
  website: null | { url: string; verified_official: boolean; status: string; identity_confidence: string | null; last_checked_at: string | null };
  audit: null | { performance_score: number | null; accessibility_score: number | null; best_practices_score: number | null; seo_score: number | null; issues: { code: string; severity: string; message: string; evidence: string }[]; audit_data: { pagespeed?: unknown } };
  social: { platform: string; profile_url: string; verification_status: string }[]; contacts: { contact_type: string; contact_value: string; source_url: string | null; verification_status: string }[];
};
const clsTone = (c: string) => (c === 'verified' ? 'success' : c === 'inferred' ? 'accent' : 'muted') as 'success' | 'accent' | 'muted';
const sevTone = (s: string) => (s === 'major' ? 'warm' : s === 'minor' ? 'accent' : 'muted') as 'warm' | 'accent' | 'muted';
const pct = (v: string | number | null) => (v === null ? 'n/a' : `${Math.round(Number(v) * 100)}%`);
const Section = ({ title, children }: { title: string; children: ReactNode }) => <Card className="space-y-2"><h2 className="font-medium">{title}</h2>{children}</Card>;

export default function ResearchReport() {
  const { id = '' } = useParams(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['research', id], queryFn: () => api<Data>(`/api/research/${id}`),
    refetchInterval: (s) => (['queued', 'researching'].includes(s.state.data?.data.business.research_status ?? '') ? 4000 : false) });
  const done = () => { qc.invalidateQueries({ queryKey: ['research', id] }); qc.invalidateQueries({ queryKey: ['research-list'] }); };
  const run = useMutation({ mutationFn: (depth: 'fast' | 'deep') => api(`/api/research/${id}`, { method: 'POST', body: { depth, force: true } }), onSuccess: done });
  const ai = useMutation({ mutationFn: () => api<{ status: string; reason?: string }>(`/api/research/${id}/analyze`, { method: 'POST', body: {} }), onSuccess: done });
  const lead = useMutation({ mutationFn: () => api<{ added: number }>('/api/discovery/add-to-leads', { method: 'POST', body: { businessIds: [id] } }) });

  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const { business: b, report: r, evidence, website, audit, social, contacts } = q.data.data;
  const busy = ['queued', 'researching'].includes(b.research_status); const sb = r?.score_breakdown;
  const href = safeHref(website?.url ?? b.website_url);

  return (
    <div className="space-y-4">
      <Link to="/research" className="text-sm text-muted hover:text-ink">← Research</Link>
      <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{b.name}</h1>
        {r?.score != null && <Badge tone={scoreTone(r.score)}>{r.score} · {r.score_label}</Badge>}<Badge>{b.research_status.replace('_', ' ')}</Badge></div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || run.isPending} onClick={() => run.mutate('fast')}>{busy ? 'Research in progress…' : 'Research again'}</Button>
        <Button variant="ghost" disabled={busy || run.isPending} onClick={() => run.mutate('deep')}>Deep research</Button>
        <Button variant="ghost" disabled={!r || ai.isPending} onClick={() => ai.mutate()}>{ai.isPending ? 'Analysing…' : 'Re-run AI analysis'}</Button>
        <Button variant="ghost" disabled={lead.isPending} onClick={() => lead.mutate()}>Add to leads</Button></div>
      {run.isSuccess && <p role="status" className="text-sm text-success">Queued. The worker will pick it up shortly.</p>}
      {lead.isSuccess && <p role="status" className="text-sm text-success">{lead.data.data.added ? 'Added to leads.' : 'Already a lead, excluded or marked do not contact.'}</p>}
      {ai.isSuccess && ai.data.data.status === 'skipped' && <p role="status" className="text-sm text-warm">AI analysis skipped: {ai.data.data.reason}</p>}
      {(run.isError || ai.isError || lead.isError) && <ErrorBox error={run.error ?? ai.error ?? lead.error} />}

      {!r && <Card><p className="text-sm text-muted">{busy ? 'Waiting for the worker…' : 'This business has not been researched yet.'}</p></Card>}
      {r && <>
        <Section title="Summary"><p className="text-sm">{r.summary ?? 'No summary.'}</p>
          <p className="text-xs text-muted">Identity confidence {pct(r.identity_confidence)} · research confidence {pct(r.research_confidence)} · {r.depth} research · {new Date(r.created_at).toLocaleString()} · {r.model ? `AI: ${r.model}` : 'AI analysis not run'}</p></Section>

        {sb && <Section title={`Opportunity score: ${sb.total}/100 (${sb.label})`}>
          <ul className="space-y-3">{sb.components.map((c) => <li key={c.key} className="text-sm"><div className="flex justify-between"><span>{c.label}</span><span className="text-muted">{c.points} / {c.max}</span></div>
            <div className="mt-1 h-2 rounded bg-surface" role="img" aria-label={`${c.points} of ${c.max}`}><div className="h-2 rounded bg-accent" style={{ width: `${c.max ? (c.points / c.max) * 100 : 0}%` }} /></div><p className="mt-1 text-xs text-muted">{c.explanation}</p></li>)}</ul></Section>}

        {r.recommendations.length > 0 && <Section title="Recommended services"><ul className="space-y-3">{r.recommendations.map((o, i) => <li key={i} className="text-sm"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{o.service}</span><Badge tone="accent">priority {o.priority}/5</Badge><Badge>confidence {pct(o.confidence)}</Badge></div>
          <p className="mt-1"><span className="text-muted">Why: </span>{o.problem}</p><p><span className="text-muted">Proposal: </span>{o.solution}</p><p className="text-xs text-muted">Based on {o.evidence.length} evidence item(s)</p></li>)}</ul></Section>}

        <Section title="Verified findings"><p className="text-xs text-muted">Directly observed by the research software.</p>
          {r.verified_findings.length === 0 ? <p className="text-sm text-muted">None.</p> : <ul className="space-y-2 text-sm">{r.verified_findings.map((f, i) => <li key={i} className="flex flex-wrap items-start gap-2"><Badge tone="success">verified</Badge>{f.severity && <Badge tone={sevTone(f.severity)}>{f.severity}</Badge>}<span>{f.claim}{f.observation && <span className="text-muted"> — {f.observation}</span>}</span></li>)}</ul>}</Section>
        <Section title="Inferred opportunities"><p className="text-xs text-muted">AI conclusions drawn from the evidence. These are judgements, not facts.</p>
          {r.inferred_findings.length === 0 ? <p className="text-sm text-muted">None.</p> : <ul className="space-y-2 text-sm">{r.inferred_findings.map((f, i) => <li key={i}><Badge tone="accent">inferred</Badge> {f.claim}{f.reasoning && <p className="text-xs text-muted">Reasoning: {f.reasoning}</p>}</li>)}</ul>}</Section>
        <Section title="Unknown information">{r.unknown_information.length === 0 ? <p className="text-sm text-muted">None recorded.</p> : <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{r.unknown_information.map((u, i) => <li key={i}>{u}</li>)}</ul>}</Section>
        {!!r.raw_ai_response?.guard?.notes?.length && <details className="text-sm"><summary className="cursor-pointer text-warm">{r.raw_ai_response.guard.notes.length} AI claim(s) removed or downgraded by safety checks</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-muted">{r.raw_ai_response.guard.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>}

        <Section title="Website audit">
          <p className="text-sm">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent">{href}</a> : 'No website URL'} · {websiteLabel(b.website_status)}{website && ` · ${website.verified_official ? 'identity verified' : 'identity not verified'}`}</p>
          {audit ? <>
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">{([['Performance', audit.performance_score], ['Accessibility', audit.accessibility_score], ['Best practices', audit.best_practices_score], ['SEO', audit.seo_score]] as [string, number | null][]).map(([l, v]) => <div key={l} className="rounded-lg bg-surface p-2"><div className="text-xs text-muted">{l}</div><div className="text-lg">{v ?? 'n/a'}</div></div>)}</div>
            {audit.performance_score === null && <p className="text-xs text-muted">PageSpeed scores are collected in deep research when GOOGLE_PAGESPEED_API_KEY is set.</p>}
            {audit.issues.length > 0 && <ul className="space-y-2 text-sm">{audit.issues.map((i) => <li key={i.code} className="flex flex-wrap gap-2"><Badge tone={sevTone(i.severity)}>{i.severity}</Badge><span>{i.message}<span className="text-muted"> — {i.evidence}</span></span></li>)}</ul>}</> : <p className="text-sm text-muted">No website audit available.</p>}</Section>

        <Section title="Contacts and profiles">{contacts.length + social.length === 0 ? <p className="text-sm text-muted">No public contact details or profiles found.</p> :
          <ul className="space-y-1 text-sm">{contacts.map((c, i) => <li key={`c${i}`}>{c.contact_type}: {c.contact_value} <Badge tone={clsTone(c.verification_status)}>{c.verification_status}</Badge></li>)}
            {social.map((s, i) => { const h = safeHref(s.profile_url); return <li key={`s${i}`}>{s.platform}: {h ? <a href={h} target="_blank" rel="noopener noreferrer" className="text-accent">{h}</a> : 'invalid link'} <Badge tone={clsTone(s.verification_status)}>{s.verification_status === 'unknown' ? 'listed, not visited' : s.verification_status}</Badge></li>; })}</ul>}</Section>

        <details className="rounded-xl border border-line bg-card p-4 text-sm"><summary className="cursor-pointer font-medium">Evidence ({evidence.length})</summary>
          <ul className="mt-3 space-y-3">{evidence.map((e, i) => { const h = safeHref(e.source_url); return <li key={i}><Badge tone={clsTone(e.classification)}>{e.classification}</Badge> <span className="text-xs text-muted">{e.evidence_type}</span><p>{e.claim}</p>
            {e.observation && <p className="text-xs text-muted">{e.observation}</p>}{h && <a href={h} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-accent">{h}</a>}</li>; })}</ul></details>
      </>}
    </div>
  );
}
