import { col, getSetting, newId, now, row, startOfTodayUtc } from '../db.js';
import { env } from '../env.js';
import { PermanentError } from '../research/pipeline.js';
import { DEFAULT_WEIGHTS, scoreOpportunity, type Weights } from '../scoring/score.js';
import { GroqProvider } from './groq.js';
import { applyGuards, type EvidenceRef, type ServiceRef } from './guard.js';
import { buildPrompt } from './prompt.js';
import { AnalysisSchema, type Analysis } from './schemas.js';
import { generateStructured } from './structured.js';
import { AIValidationError, LLMError, type LLMProvider } from './types.js';

// Default model is the example used in Groq's docs; check console.groq.com/docs/models for what your account can use and set GROQ_MODEL.
export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
export const getProvider = (): LLMProvider | null => (env.GROQ_API_KEY ? new GroqProvider({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL || DEFAULT_GROQ_MODEL }) : null);

export interface AiSettings { enabled: boolean; dailyTokenLimit: number; maxOutputTokensFast: number; maxOutputTokensDeep: number }
const AI_DEFAULTS: AiSettings = { enabled: true, dailyTokenLimit: 300_000, maxOutputTokensFast: 1200, maxOutputTokensDeep: 2000 };
export async function getAiSettings(): Promise<AiSettings> { return { ...AI_DEFAULTS, ...((await getSetting('ai')) ?? {}) }; }
export async function getWeights(): Promise<Weights> { return { ...DEFAULT_WEIGHTS, ...((await getSetting<{ weights?: Partial<Weights> }>('scoring'))?.weights ?? {}) }; }
export async function tokensUsedToday(): Promise<number> {
  const r = await col('ai_usage').aggregate([{ $match: { created_at: { $gte: startOfTodayUtc() } } }, { $group: { _id: null, t: { $sum: { $add: ['$input_tokens', '$output_tokens'] } } } }]).toArray();
  return Number(r[0]?.t ?? 0);
}

export type AnalyzeResult = { status: 'completed' | 'skipped'; reason?: string; score?: number; label?: string };
const skipped = (reason: string): AnalyzeResult => ({ status: 'skipped', reason });
const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

async function addUnknown(reportId: string, note: string) {
  await col('research_reports').updateOne({ _id: reportId }, { $push: { unknown_information: note } });
}

export async function analyzeBusiness(businessId: string, opts: { depth: 'fast' | 'deep'; signal?: AbortSignal }): Promise<AnalyzeResult> {
  const cfg = await getAiSettings(); const provider = getProvider();
  if (!cfg.enabled) return skipped('AI analysis is switched off in settings');
  if (!provider) return skipped('GROQ_API_KEY is not set');
  if ((await tokensUsedToday()) >= cfg.dailyTokenLimit) return skipped('Daily AI token limit reached; analysis will run when the limit resets or is raised');

  const b = row(await col('businesses').findOne({ _id: businessId }));
  const report = row((await col('research_reports').find({ business_id: businessId }).sort({ created_at: -1 }).limit(1).toArray())[0]);
  if (!b) throw new PermanentError('Business not found');
  if (!report) throw new PermanentError('No research report to analyse yet; run research first');

  let evidence: any[] = (await col('research_evidence').find({ report_id: report.id }).sort({ observed_at: 1, _id: 1 }).toArray()).map(row);
  if (!b.website_url && !evidence.some((e) => e.evidence_type === 'listing_gap')) {
    const providers = asArray(report.sources).join(', ') || 'data providers';
    const ev = { _id: newId(), report_id: report.id, evidence_type: 'listing_gap', classification: 'verified', claim: `No website appears in listings from ${providers}`,
      source_url: null, observation: 'Absence from listings does not prove that no website exists', confidence: 1, observed_at: now() };
    await col('research_evidence').insertOne(ev);
    evidence = [...evidence, row(ev)];
  }
  evidence = evidence.slice(0, opts.depth === 'deep' ? 40 : 25);
  const services: any[] = (await col('services').find({ active: true }).sort({ priority: -1, name: 1 }).toArray()).map(row);
  if (!services.length) return skipped('The service catalogue has no active services');
  const audit = (await col('website_audits').find({ business_id: businessId }).sort({ created_at: -1 }).limit(1).toArray())[0];
  const attributed = audit?.audit_data?.attributed === true;
  const cat = String(b.category ?? '').toLowerCase();

  const refs: EvidenceRef[] = evidence.map((e, i) => ({ key: `E${i + 1}`, dbId: e.id, cls: e.classification }));
  const svRefs: ServiceRef[] = services.map((s, i) => ({ key: `S${i + 1}`, id: s.id, name: s.name }));
  const trunc = <T,>(a: T[]) => a.slice(0, opts.depth === 'deep' ? 8 : 4);
  const prompt = buildPrompt({
    business: { name: b.name, category: b.category, city: b.city, country: b.country_code, hasPhone: !!b.phone, hasEmail: !!b.email, rating: b.rating == null ? null : Number(b.rating), reviewCount: b.review_count, websiteStatus: b.website_status },
    evidence: evidence.map((e, i) => ({ key: `E${i + 1}`, type: e.evidence_type, classification: e.classification, claim: e.claim, observation: e.observation })),
    researchUnknowns: asArray(report.unknown_information).slice(0, 10),
    services: services.map((s, i) => ({ key: `S${i + 1}`, name: s.name, solves: trunc(asArray(s.problems_solved)), fitsCategories: trunc(asArray(s.target_categories)) })),
    untrustedSiteText: attributed ? { title: audit.audit_data.title ?? null, metaDescription: audit.audit_data.metaDescription ?? null } : null,
  });

  let out;
  try {
    out = await generateStructured(provider, AnalysisSchema, { ...prompt, maxTokens: opts.depth === 'deep' ? cfg.maxOutputTokensDeep : cfg.maxOutputTokensFast, signal: opts.signal,
      onUsage: async (u, ok) => { await col('ai_usage').insertOne({ _id: newId(), provider: provider.name, model: provider.model, operation: 'research_analysis', business_id: businessId,
        input_tokens: u.inputTokens, output_tokens: u.outputTokens, estimated_cost: null, success: ok, created_at: now() }); } });
  } catch (e) {
    if (e instanceof AIValidationError) { await addUnknown(report.id, 'AI analysis returned invalid output twice and was discarded.'); return skipped('AI output failed validation'); }
    if (e instanceof LLMError && !e.retryable) { await addUnknown(report.id, `AI analysis could not run: ${e.message}`); return skipped(e.message); }
    throw e; // retryable provider failure: the worker retries with backoff
  }

  const g = applyGuards(out.value as Analysis, refs, svRefs);
  const svById = new Map(services.map((s) => [s.id, s]));
  const hasSocial = (await col('business_social_profiles').countDocuments({ business_id: businessId }, { limit: 1 })) > 0;
  const socialOnly = evidence.some((e) => e.evidence_type === 'social_only');
  const issues = (audit?.issues ?? []) as { severity: string }[];
  const score = scoreOpportunity({
    websiteStatus: b.website_status, hasListedWebsite: !!b.website_url && !socialOnly, socialOnly, identityAttributed: attributed || Number(report.identity_confidence ?? 0) >= 0.4,
    majorIssues: issues.filter((i) => i.severity === 'major').length, minorIssues: issues.filter((i) => i.severity === 'minor').length,
    opportunities: g.opportunities.map((o) => { const s = svById.get(o.serviceId); return { priority: o.priority, confidence: o.confidence, servicePriority: s?.priority ?? 1,
      categoryFit: !!s && asArray(s.target_categories).length > 0 && asArray(s.target_categories).some((t) => cat.includes(t.toLowerCase())) }; }),
    hasPhone: !!b.phone, hasEmail: !!b.email, hasSocialOrContactPage: hasSocial, researchConfidence: Number(report.research_confidence ?? 0), reviewCount: b.review_count, dataCompleteness: b.data_completeness == null ? null : Number(b.data_completeness),
  }, await getWeights());

  const status = report.status === 'needs_review' ? 'needs_review' : 'completed';
  const unknown = [...new Set([...asArray(report.unknown_information), ...g.unknown, ...g.findings.filter((f) => f.classification === 'unknown').map((f) => f.claim), ...g.notes.map((n) => `AI review: ${n}`)])].slice(0, 30);
  await col('research_reports').updateOne({ _id: report.id }, { $set: {
    status, summary: out.value.summary, inferred_findings: g.findings.filter((f) => f.classification === 'inferred'), unknown_information: unknown,
    recommendations: g.opportunities.map((o) => ({ ...o, service: o.serviceName })), raw_ai_response: { output: out.value, guard: { notes: g.notes }, usage: out.usage },
    model: out.model, score: score.total, score_breakdown: score, score_label: score.label } });
  await col('opportunities').deleteMany({ business_id: businessId });
  if (g.opportunities.length) await col('opportunities').insertMany(g.opportunities.map((o) => ({ _id: newId(), business_id: businessId, report_id: report.id, service_id: o.serviceId, problem: o.problem,
    proposed_solution: o.solution, priority: o.priority, score: o.confidence, classification: 'inferred', evidence_ids: o.evidence, created_at: now() })));
  await col('businesses').updateOne({ _id: businessId }, { $set: { opportunity_score: score.total, opportunity_label: score.label, research_status: status, updated_at: now() } });
  await col('leads').updateMany({ business_id: businessId }, { $set: { opportunity_score: score.total, updated_at: now() } });
  return { status: 'completed', score: score.total, label: score.label };
}
