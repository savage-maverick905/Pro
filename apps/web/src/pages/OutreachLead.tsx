import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, ErrorBox, Field, Input, Spinner } from '../components/ui';
import { api } from '../lib/api';

type Msg = { id: string; sequence_number: number; kind: 'sequence' | 'follow_up'; subject: string | null; content: string; status: 'draft' | 'sent'; sent_at: string | null; response: string | null; reply_outcome: string | null; versions: number };
type Seq = { id: string; channel: string; tone: string; approach: string; length: string; cta: string | null; created_at: string; messages: Msg[] };
type Data = { lead: { id: string; name: string; status: string }; suppressed: string | null; hasResearch: boolean; recommendations: { serviceId: string; service: string }[]; sequences: Seq[] };
type Version = { id: string; subject: string | null; content: string; source: string; created_at: string };
const ROLE: Record<number, string> = { 1: 'Message 1 · Problem awareness', 2: 'Message 2 · Solution', 3: 'Message 3 · Call to action' };
const OPT = {
  channel: ['email', 'whatsapp', 'instagram', 'linkedin'], tone: ['professional', 'friendly', 'conversational', 'persuasive', 'direct'],
  approach: [['problem_first', 'Problem first'], ['opportunity_first', 'Opportunity first'], ['website_audit', 'Website audit'], ['service_specific', 'Service specific']] as [string, string][], length: ['short', 'medium', 'detailed'],
};
const asText = (m: Msg) => (m.subject ? `Subject: ${m.subject}\n\n${m.content}` : m.content);
async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  }
}
const Select = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: (string | readonly [string, string])[] }) =>
  <Field label={label}><select value={value} onChange={(e) => onChange(e.target.value)} className="min-h-10 w-full rounded-lg border border-line bg-surface px-2 text-sm capitalize">{options.map((o) => { const [v, l] = typeof o === 'string' ? [o, o] : o; return <option key={v} value={v}>{l}</option>; })}</select></Field>;

function MessageCard({ m, leadId, seqId }: { m: Msg; leadId: string; seqId: string }) {
  const qc = useQueryClient(); const [text, setText] = useState(m.content); const [subject, setSubject] = useState(m.subject ?? '');
  const [copied, setCopied] = useState(false); const [panel, setPanel] = useState<'' | 'send' | 'reply' | 'versions' | 'regen'>(''); const [instr, setInstr] = useState('');
  const [sentAt, setSentAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  const [reply, setReply] = useState(''); const [outcome, setOutcome] = useState('neutral'); const [hint, setHint] = useState('');
  useEffect(() => { setText(m.content); setSubject(m.subject ?? ''); }, [m.content, m.subject]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['outreach-lead', leadId] }); qc.invalidateQueries({ queryKey: ['outreach'] }); qc.invalidateQueries({ queryKey: ['overview'] }); };
  const sent = m.status === 'sent'; const dirty = text !== m.content || subject !== (m.subject ?? '');
  const save = useMutation({ mutationFn: () => api(`/api/outreach/messages/${m.id}`, { method: 'PATCH', body: { content: text, subject: m.subject === null ? undefined : subject } }), onSuccess: refresh });
  const regen = useMutation({ mutationFn: () => api(`/api/outreach/messages/${m.id}/regenerate`, { method: 'POST', body: { instruction: instr || undefined } }), onSuccess: () => { setPanel(''); setInstr(''); refresh(); } });
  const mark = useMutation({ mutationFn: () => api(`/api/outreach/messages/${m.id}/mark-sent`, { method: 'POST', body: { sentAt: new Date(sentAt).toISOString() } }), onSuccess: () => { setPanel(''); refresh(); } });
  const rec = useMutation({ mutationFn: () => api(`/api/outreach/messages/${m.id}/record-reply`, { method: 'POST', body: { response: reply, outcome } }), onSuccess: () => { setPanel(''); refresh(); } });
  const suggest = useMutation({ mutationFn: () => api<{ suggestedOutcome: string; summary: string; suggestedNextStep: string }>('/api/outreach/interpret-reply', { method: 'POST', body: { response: reply } }),
    onSuccess: (r) => { setOutcome(r.data.suggestedOutcome); setHint(`${r.data.summary} Next step: ${r.data.suggestedNextStep}`); } });
  const versions = useQuery({ queryKey: ['versions', m.id, m.versions], enabled: panel === 'versions', queryFn: () => api<Version[]>(`/api/outreach/messages/${m.id}/versions`) });
  const restore = useMutation({ mutationFn: (versionId: string) => api(`/api/outreach/messages/${m.id}/restore`, { method: 'POST', body: { versionId } }), onSuccess: () => { setPanel(''); refresh(); } });
  const err = save.error ?? regen.error ?? mark.error ?? rec.error ?? suggest.error ?? restore.error;
  const toggle = (p: typeof panel) => setPanel(panel === p ? '' : p);

  return (
    <Card className="space-y-2" >
      <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{m.kind === 'follow_up' ? `Follow-up (#${m.sequence_number})` : ROLE[m.sequence_number]}</span>
        {sent ? <Badge tone="success">Sent manually {m.sent_at && new Date(m.sent_at).toLocaleDateString()}</Badge> : <Badge>Draft, not sent</Badge>}{m.reply_outcome && <Badge tone="accent">Reply: {m.reply_outcome}</Badge>}</div>
      {m.subject !== null && <Input aria-label="Subject" value={subject} disabled={sent} onChange={(e) => setSubject(e.target.value)} />}
      <textarea aria-label="Message" rows={Math.min(14, Math.max(4, Math.ceil(text.length / 60)))} value={text} disabled={sent} onChange={(e) => setText(e.target.value)} className="w-full rounded-lg border border-line bg-surface p-3 text-sm disabled:opacity-70" />
      <p className="text-xs text-muted">{text.length} characters{dirty && ' · unsaved changes'}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" className="min-h-9" onClick={async () => { setCopied(await copy(subject ? `Subject: ${subject}\n\n${text}` : text)); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy'}</Button>
        {!sent && <>{dirty && <Button className="min-h-9" disabled={save.isPending} onClick={() => save.mutate()}>Save edit</Button>}
          {m.kind === 'sequence' && <Button variant="ghost" className="min-h-9" onClick={() => toggle('regen')}>Regenerate</Button>}
          <Button variant="ghost" className="min-h-9" onClick={() => toggle('send')}>Mark as sent</Button></>}
        {sent && !m.response && <Button variant="ghost" className="min-h-9" onClick={() => toggle('reply')}>Record reply</Button>}
        {m.versions > 1 && <Button variant="ghost" className="min-h-9" onClick={() => toggle('versions')}>Versions ({m.versions})</Button>}</div>
      {panel === 'regen' && <div className="space-y-2 rounded-lg bg-surface p-3"><Input aria-label="Instruction" placeholder="Optional: e.g. shorter, mention the booking idea" value={instr} onChange={(e) => setInstr(e.target.value)} />
        <Button disabled={regen.isPending} onClick={() => regen.mutate()}>{regen.isPending ? 'Regenerating…' : 'Regenerate this message'}</Button></div>}
      {panel === 'send' && <div className="space-y-2 rounded-lg bg-surface p-3"><p className="text-sm">Only confirm after you have sent this yourself. ProspectOS never sends messages.</p>
        <Field label="Date and time sent"><Input type="datetime-local" value={sentAt} onChange={(e) => setSentAt(e.target.value)} /></Field><Button disabled={mark.isPending} onClick={() => mark.mutate()}>I sent this message</Button></div>}
      {panel === 'reply' && <div className="space-y-2 rounded-lg bg-surface p-3"><Field label="Their reply (paste it)"><textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} className="w-full rounded-lg border border-line bg-card p-3 text-sm" /></Field>
        <div className="flex flex-wrap items-end gap-2"><Button variant="ghost" disabled={!reply.trim() || suggest.isPending} onClick={() => suggest.mutate()}>{suggest.isPending ? 'Reading…' : 'Suggest outcome (AI)'}</Button>
          <Select label="Outcome" value={outcome} onChange={setOutcome} options={[['positive', 'Positive / interested'], ['neutral', 'Neutral / replied'], ['negative', 'Not interested'], ['unsubscribe', 'Asked not to be contacted']]} /></div>
        {hint && <p className="text-xs text-muted">AI suggestion (check it): {hint}</p>}{outcome === 'unsubscribe' && <p className="text-xs text-warm">This adds the business to the suppression list so it is never contacted again.</p>}
        <Button disabled={!reply.trim() || rec.isPending} onClick={() => rec.mutate()}>Save reply</Button></div>}
      {panel === 'versions' && <div className="space-y-2 rounded-lg bg-surface p-3">{versions.isPending ? <Spinner /> : versions.data?.data.map((v) => <div key={v.id} className="border-b border-line pb-2 text-sm last:border-0"><div className="flex items-center justify-between text-xs text-muted"><span>{v.source} · {new Date(v.created_at).toLocaleString()}</span>{!sent && <button className="text-accent" onClick={() => restore.mutate(v.id)}>Restore</button>}</div><p className="whitespace-pre-wrap">{v.content}</p></div>)}</div>}
      {m.response && <div className="rounded-lg bg-surface p-3 text-sm"><div className="text-xs text-muted">Their reply</div><p className="whitespace-pre-wrap">{m.response}</p></div>}
      {err && <ErrorBox error={err} />}<span className="sr-only">{seqId}</span>
    </Card>
  );
}

export default function OutreachLead() {
  const { leadId = '' } = useParams(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['outreach-lead', leadId], queryFn: () => api<Data>(`/api/outreach/${leadId}`) });
  const [f, setF] = useState({ channel: 'email', tone: 'friendly', approach: 'problem_first', length: 'medium', cta: '', serviceId: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const refresh = () => { qc.invalidateQueries({ queryKey: ['outreach-lead', leadId] }); qc.invalidateQueries({ queryKey: ['outreach'] }); };
  const gen = useMutation({ mutationFn: () => api(`/api/outreach/generate/${leadId}`, { method: 'POST', body: { ...f, cta: f.cta || undefined, serviceId: f.serviceId || undefined } }), onSuccess: refresh });
  const follow = useMutation({ mutationFn: (sequenceId: string) => api(`/api/outreach/${leadId}/follow-up`, { method: 'POST', body: { sequenceId } }), onSuccess: refresh });
  const [copiedSeq, setCopiedSeq] = useState('');
  if (q.isPending) return <Spinner />; if (q.isError) return <ErrorBox error={q.error} />;
  const d = q.data.data; const blocked = !!d.suppressed || !d.hasResearch;

  return (
    <div className="space-y-4">
      <Link to="/outreach" className="text-sm text-muted hover:text-ink">← Outreach</Link>
      <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{d.lead.name}</h1><Link to={`/leads/${d.lead.id}`} className="text-sm text-accent">Lead profile</Link></div>
      {d.suppressed && <div role="alert" className="rounded-lg border border-warm/40 bg-warm/10 p-3 text-sm text-warm">Outreach is blocked: {d.suppressed}.</div>}
      {!d.hasResearch && <div role="status" className="rounded-lg border border-line bg-card p-3 text-sm text-muted">This business has not been researched yet, so there is nothing real to base messages on. Run research first.</div>}
      <Card className="space-y-3"><h2 className="font-medium">Generate a 3-message sequence</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Select label="Channel" value={f.channel} onChange={set('channel')} options={OPT.channel} /><Select label="Tone" value={f.tone} onChange={set('tone')} options={OPT.tone} />
          <Select label="Approach" value={f.approach} onChange={set('approach')} options={OPT.approach} /><Select label="Length" value={f.length} onChange={set('length')} options={OPT.length} /></div>
        <div className="grid gap-3 md:grid-cols-2"><Select label="Service" value={f.serviceId} onChange={set('serviceId')} options={[['', 'Top recommendation'], ...d.recommendations.map((r) => [r.serviceId, r.service] as const)]} />
          <Field label="Custom call to action (optional)"><Input placeholder="e.g. a 15-minute call this week" value={f.cta} onChange={(e) => set('cta')(e.target.value)} /></Field></div>
        <Button disabled={blocked || gen.isPending} onClick={() => gen.mutate()}>{gen.isPending ? 'Writing…' : 'Generate sequence'}</Button>
        {gen.isError && <ErrorBox error={gen.error} />}
        <p className="text-xs text-muted">Messages describe findings as an automated check of the public website and never claim you personally visited or used anything. Check the marketing and privacy rules for the business's country (for example GDPR/PECR, CAN-SPAM, CASL) before sending. Include your real name and contact details, and honour opt-outs.</p></Card>

      {d.sequences.length === 0 && <Card><p className="text-sm text-muted">No sequences yet.</p></Card>}
      {d.sequences.map((s) => (
        <section key={s.id} className="space-y-3" aria-label={`${s.channel} sequence`}>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium capitalize">{s.channel} · {s.tone} · {s.approach.replace('_', ' ')} <span className="text-xs font-normal text-muted">{new Date(s.created_at).toLocaleDateString()}</span></h2>
            <span className="flex gap-2"><Button variant="ghost" className="min-h-9" onClick={async () => { await copy(s.messages.filter((m) => m.kind === 'sequence').map(asText).join('\n\n---\n\n')); setCopiedSeq(s.id); setTimeout(() => setCopiedSeq(''), 1500); }}>{copiedSeq === s.id ? 'Copied' : 'Copy whole sequence'}</Button>
              <Button variant="ghost" className="min-h-9" disabled={follow.isPending || !s.messages.some((m) => m.status === 'sent')} onClick={() => follow.mutate(s.id)} title={s.messages.some((m) => m.status === 'sent') ? '' : 'Mark a message as sent first'}>Generate follow-up</Button></span></div>
          {s.messages.map((m) => <MessageCard key={m.id} m={m} leadId={leadId} seqId={s.id} />)}
        </section>))}
      {follow.isError && <ErrorBox error={follow.error} />}
    </div>
  );
}
