import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { col, mergeSetting, now, pick, row, textCollation } from '../db.js';
import { analyzeBusiness } from '../ai/analyze.js';
import { LLMError } from '../ai/types.js';
import { PermanentError } from '../research/pipeline.js';
import { createResearchJob, getSettings } from '../worker/queue.js';

const Id = z.object({ businessId: z.string().uuid() });
const JobId = z.object({ jobId: z.string().uuid() });
const Opts = z.object({ depth: z.enum(['fast', 'deep']).optional(), force: z.boolean().default(false) });
const notFound = { error: { code: 'not_found', message: 'Not found' } };
const estimate = (n: number, depth: 'fast' | 'deep') => ({ businesses: n, approxRequests: n * (depth === 'deep' ? 14 : 2), pageSpeedCalls: depth === 'deep' ? n : 0 });

export async function researchRoutes(app: FastifyInstance) {
  app.get('/api/research/settings', async () => ({ data: await getSettings() }));
  app.patch('/api/research/settings', async (req) => {
    const b = z.object({ paused: z.boolean().optional(), concurrency: z.number().int().min(1).max(5).optional(), depth: z.enum(['fast', 'deep']).optional(),
      freshnessDays: z.number().int().min(1).max(365).optional(), maxPerSweep: z.number().int().min(1).max(500).optional() }).refine((o) => Object.keys(o).length > 0).parse(req.body);
    await mergeSetting('research', b);
    return { data: await getSettings() };
  });

  app.post('/api/research/bulk', async (req, reply) => {
    const b = z.object({ businessIds: z.array(z.string().uuid()).min(1).max(200) }).merge(Opts).parse(req.body);
    const depth = b.depth ?? (await getSettings()).depth;
    const r = await createResearchJob(b.businessIds, { depth, force: b.force });
    return reply.code(202).send({ data: { ...r, estimate: estimate(r.count, depth) } });
  });
  for (const retry of [false, true])
    app.post(retry ? '/api/research/:businessId/retry' : '/api/research/:businessId', async (req, reply) => {
      const { businessId } = Id.parse(req.params); const o = Opts.parse(req.body ?? {});
      const depth = o.depth ?? (await getSettings()).depth;
      const r = await createResearchJob([businessId], { depth, force: retry || o.force });
      return r.count ? reply.code(202).send({ data: { ...r, estimate: estimate(1, depth) } }) : reply.code(404).send(notFound);
    });

  app.post('/api/research/:businessId/analyze', async (req, reply) => {
    const { businessId } = Id.parse(req.params); const o = Opts.parse(req.body ?? {});
    try { return { data: await analyzeBusiness(businessId, { depth: o.depth ?? (await getSettings()).depth }) }; }
    catch (e) {
      if (e instanceof PermanentError) return reply.code(409).send({ error: { code: 'not_ready', message: e.message } });
      if (e instanceof LLMError) return reply.code(502).send({ error: { code: 'ai_unavailable', message: e.message } });
      throw e;
    }
  });

  app.get('/api/research/jobs/:jobId', async (req, reply) => {
    const { jobId } = JobId.parse(req.params);
    const j = await col('prospecting_jobs').findOne({ _id: jobId, job_type: 'research' });
    if (!j) return reply.code(404).send(notFound);
    const items = await col('job_items').aggregate([{ $match: { job_id: jobId } },
      { $lookup: { from: 'businesses', localField: 'business_id', foreignField: '_id', as: 'b' } }, { $unwind: '$b' },
      { $sort: { status: 1, 'b.name': 1 } }, { $limit: 200 }], { collation: textCollation }).toArray();
    return { data: { ...pick(j, ['job_type', 'status', 'parameters', 'total_tasks', 'completed_tasks', 'failed_tasks', 'created_at', 'updated_at']),
      items: items.map((i) => ({ business_id: i.business_id, name: i.b.name, status: i.status, retry_count: i.retry_count, error_message: i.error_message ?? null })) } };
  });
  for (const [action, from, to] of [['pause', ['running'], 'paused'], ['resume', ['paused'], 'running'], ['cancel', ['running', 'paused'], 'cancelled']] as const)
    app.post(`/api/research/jobs/:jobId/${action}`, async (req, reply) => {
      const { jobId } = JobId.parse(req.params);
      const r = await col('prospecting_jobs').findOneAndUpdate({ _id: jobId, job_type: 'research', status: { $in: [...from] } }, { $set: { status: to, updated_at: now() } });
      if (!r) return reply.code(409).send({ error: { code: 'invalid_state', message: `Job cannot be ${action}d in its current state` } });
      if (action === 'cancel') {
        const pending = (await col('job_items').find({ job_id: jobId, status: 'pending' }, { projection: { business_id: 1 } }).toArray()).map((x) => x.business_id as string);
        await col('job_items').updateMany({ job_id: jobId, status: 'pending' }, { $set: { status: 'cancelled' } });
        if (pending.length) await col('businesses').updateMany({ _id: { $in: pending }, research_status: 'queued' }, { $set: { research_status: 'not_researched' } });
      }
      return { data: { id: jobId, status: to } };
    });

  app.get('/api/research/:businessId', async (req, reply) => {
    const { businessId } = Id.parse(req.params);
    const biz = await col('businesses').findOne({ _id: businessId });
    if (!biz) return reply.code(404).send(notFound);
    const b = pick(biz, ['name', 'research_status', 'website_status', 'website_url']);
    const latest = (c: string, q: object, sort: object) => col(c).find(q).sort(sort as any).limit(1).toArray().then((r) => r[0] ?? null);
    const report = row(await latest('research_reports', { business_id: businessId }, { created_at: -1 }));
    const [evidence, website, audit, social, contacts, opps] = await Promise.all([
      report ? col('research_evidence').find({ report_id: report.id }).sort({ classification: 1, observed_at: 1 }).toArray() : [],
      latest('websites', { business_id: businessId }, { last_checked_at: -1 }),
      latest('website_audits', { business_id: businessId }, { created_at: -1 }),
      col('business_social_profiles').find({ business_id: businessId }).toArray(),
      col('business_contacts').find({ business_id: businessId }).toArray(),
      report ? col('opportunities').find({ report_id: report.id }).sort({ priority: -1 }).toArray() : [],
    ]);
    const svc = new Map((await col('services').find({ _id: { $in: opps.map((o) => o.service_id).filter(Boolean) } }, { projection: { name: 1 } }).toArray()).map((s) => [s._id, s.name as string]));
    return { data: { business: b, report: report ?? null,
      evidence: evidence.map((e) => { const { _id, report_id, ...rest } = e; return rest; }),
      website: website ? pick(website, ['url', 'domain', 'verified_official', 'status', 'identity_confidence', 'last_checked_at']) : null,
      audit: audit ? pick(audit, ['performance_score', 'accessibility_score', 'best_practices_score', 'seo_score', 'audit_data', 'issues', 'created_at']) : null,
      social: social.map((x) => { const { _id, business_id, ...rest } = x; return rest; }),
      contacts: contacts.map((x) => ({ contact_type: x.contact_type, contact_value: x.contact_value, source_url: x.source_url ?? null, verification_status: x.verification_status })),
      opportunities: opps.map((o) => ({ ...pick(o, ['problem', 'proposed_solution', 'priority', 'score', 'evidence_ids']), service_name: svc.get(o.service_id) ?? null })) } };
  });
}
