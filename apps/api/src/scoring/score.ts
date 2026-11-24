export interface Weights { websiteDeficiency: number; problem: number; solutionValue: number; contactAccess: number; evidenceConfidence: number; activity: number }
export const DEFAULT_WEIGHTS: Weights = { websiteDeficiency: 25, problem: 25, solutionValue: 20, contactAccess: 15, evidenceConfidence: 10, activity: 5 };
export interface ScoreInput {
  websiteStatus: string; hasListedWebsite: boolean; socialOnly: boolean; identityAttributed: boolean; majorIssues: number; minorIssues: number;
  opportunities: { priority: number; confidence: number; servicePriority: number; categoryFit: boolean }[];
  hasPhone: boolean; hasEmail: boolean; hasSocialOrContactPage: boolean; researchConfidence: number; reviewCount: number | null; dataCompleteness: number | null;
}
export interface Component { key: keyof Weights; label: string; max: number; points: number; explanation: string }
export interface Score { total: number; label: string; components: Component[] }
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const labelFor = (t: number) => (t >= 80 ? 'Excellent opportunity' : t >= 65 ? 'High potential' : t >= 45 ? 'Moderate potential' : t >= 25 ? 'Low potential' : 'Poor prospect');

/** Deterministic and explainable: every point comes from a stated observation. Missing evidence earns few points but is never treated as proof. */
export function scoreOpportunity(i: ScoreInput, w: Weights = DEFAULT_WEIGHTS): Score {
  const comps: Component[] = []; const add = (key: keyof Weights, label: string, f: number, explanation: string) =>
    comps.push({ key, label, max: w[key], points: Math.round(clamp(f) * w[key] * 10) / 10, explanation });

  let wf: number, we: string;
  if (i.socialOnly) { wf = 0.6; we = 'Only a social media profile is listed as a website'; }
  else if (!i.hasListedWebsite) { wf = i.websiteStatus === 'verified_none' ? 1 : 0.4; we = i.websiteStatus === 'verified_none' ? 'Independently verified: no website' : 'No website found in listings (not verified, so only partial credit)'; }
  else if (!i.identityAttributed) { wf = 0; we = 'A website exists but could not be matched to this business, so no deficiencies are counted'; }
  else if (i.websiteStatus === 'inaccessible') { wf = 0.3; we = 'Website could not be fetched in one attempt (not proof it is down)'; }
  else { wf = Math.min(1, i.majorIssues * 0.3 + i.minorIssues * 0.1); we = `${i.majorIssues} major and ${i.minorIssues} minor observation(s) on the website`; }
  add('websiteDeficiency', 'Website absence or deficiencies', wf, we);

  const opps = i.opportunities; const best = opps.reduce((m, o) => Math.max(m, (o.confidence * o.priority) / 5), 0);
  add('problem', 'Identifiable business problem', opps.length ? best * 0.85 + Math.min(0.15, 0.05 * (opps.length - 1)) : 0,
    opps.length ? `${opps.length} evidence-backed opportunity(ies), strongest weighted at ${Math.round(best * 100)}%` : 'No evidence-backed problem identified');

  const maxSp = opps.reduce((m, o) => Math.max(m, o.servicePriority), 0); const fit = opps.some((o) => o.categoryFit);
  add('solutionValue', 'Potential value of a relevant solution', opps.length ? 0.6 * (maxSp / 10) + 0.4 * (fit ? 1 : 0.4) : 0,
    opps.length ? `Best matched service priority ${maxSp}/10; ${fit ? 'suits' : 'not clearly specific to'} this business type` : 'No relevant service matched');

  const cf = (i.hasPhone ? 0.4 : 0) + (i.hasEmail ? 0.4 : 0) + (i.hasSocialOrContactPage ? 0.2 : 0);
  add('contactAccess', 'Public contact accessibility', cf, `${[i.hasPhone && 'phone', i.hasEmail && 'email', i.hasSocialOrContactPage && 'social or contact page'].filter(Boolean).join(', ') || 'no public contact found'}`);

  add('evidenceConfidence', 'Evidence confidence', i.researchConfidence, `Research confidence ${Math.round(clamp(i.researchConfidence) * 100)}%`);

  const rv = i.reviewCount ?? 0; const af = (rv >= 10 ? 0.6 : rv > 0 ? 0.3 : 0) + ((i.dataCompleteness ?? 0) >= 0.5 ? 0.4 : 0);
  add('activity', 'Business activity signals', af, rv ? `${rv} reviews listed${(i.dataCompleteness ?? 0) >= 0.5 ? ', fairly complete listing' : ''}` : 'No activity signals available (not counted against the business)');

  const sum = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const total = Math.round((comps.reduce((a, c) => a + c.points, 0) * 100) / sum);
  return { total, label: labelFor(total), components: comps };
}
