import type { Analysis } from './schemas.js';

export type Cls = 'verified' | 'inferred' | 'unknown';
export interface EvidenceRef { key: string; dbId: string; cls: Cls }
export interface ServiceRef { key: string; id: string; name: string }
export interface GuardedFinding { claim: string; classification: Cls; evidence: string[]; reasoning?: string }
export interface GuardedOpportunity { serviceId: string; serviceName: string; problem: string; solution: string; priority: number; confidence: number; evidence: string[] }

// Claims the pipeline can never support: no revenue data, review text or customer behaviour is ever collected.
const BANNED = [
  /\b(los(e|es|ing|t)|bleed(ing)?|miss(ing)? out on)\b[^.]{0,40}\b(customers?|revenue|sales|money|income|clients?|business)\b/i,
  /\bcustomers?\b[^.]{0,30}\b(complain\w*|frustrat\w*|unhappy|angry)\b/i,
  /\b(negative|bad|poor|terrible) (customer )?reviews?\b/i,
  /\bcompetitors?\b[^.]{0,40}\b(ahead|stealing|winning|outrank\w*)\b/i,
];
export const hasUnsupportedClaim = (t: string) => BANNED.some((r) => r.test(t));

export function applyGuards(a: Analysis, ev: EvidenceRef[], sv: ServiceRef[]) {
  const evMap = new Map(ev.map((e) => [e.key.toUpperCase(), e])); const svMap = new Map(sv.map((s) => [s.key.toUpperCase(), s]));
  const resolve = (ids: string[]) => [...new Set(ids.map((x) => x.trim().toUpperCase()))].map((k) => evMap.get(k)).filter((x): x is EvidenceRef => !!x);
  const notes: string[] = []; const short = (s: string) => `"${s.slice(0, 80)}"`;

  const findings: GuardedFinding[] = [];
  for (const f of a.findings) {
    if (hasUnsupportedClaim(`${f.claim} ${f.reasoning ?? ''}`)) { notes.push(`Removed unsupported claim: ${short(f.claim)}`); continue; }
    const refs = resolve(f.evidence); let cls: Cls = f.classification;
    if (cls === 'verified' && !refs.some((r) => r.cls === 'verified')) { cls = refs.length ? 'inferred' : 'unknown'; notes.push(`Downgraded to ${cls} (no verified evidence cited): ${short(f.claim)}`); }
    else if (cls === 'inferred' && !refs.length) { cls = 'unknown'; notes.push(`Downgraded to unknown (no evidence cited): ${short(f.claim)}`); }
    findings.push({ claim: f.claim, classification: cls, evidence: refs.map((r) => r.dbId), reasoning: f.reasoning });
  }

  const best = new Map<string, GuardedOpportunity & { rank: number }>();
  for (const o of a.opportunities) {
    const svc = svMap.get(o.service.trim().toUpperCase());
    if (!svc) { notes.push(`Dropped recommendation for an unknown service: ${short(o.service)}`); continue; }
    if (hasUnsupportedClaim(`${o.problem} ${o.solution}`)) { notes.push(`Dropped recommendation with unsupported claim: ${short(o.problem)}`); continue; }
    const refs = resolve(o.evidence);
    if (!refs.some((r) => r.cls !== 'unknown')) { notes.push(`Dropped recommendation with no supporting evidence: ${short(o.problem)}`); continue; }
    const rank = o.priority * o.confidence; const prev = best.get(svc.key);
    if (!prev || rank > prev.rank) best.set(svc.key, { serviceId: svc.id, serviceName: svc.name, problem: o.problem, solution: o.solution, priority: o.priority, confidence: o.confidence, evidence: refs.map((r) => r.dbId), rank });
  }
  const opportunities = [...best.values()].sort((x, y) => y.rank - x.rank).slice(0, 4).map(({ rank: _r, ...o }) => o);
  return { findings, opportunities, unknown: a.unknown, notes };
}
