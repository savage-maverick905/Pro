import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addActivity, col, escapeRegex, insertIgnore, jobDefaults, newId, now, nullsLastStages, pick, textCollation } from '../db.js';
import { CATEGORIES } from '../discovery/categories.js';
import { ADAPTERS } from '../discovery/providers/index.js';
import { kick } from '../discovery/run.js';
import { DiscoverySearch } from '../discovery/schema.js';

const Id = z.object({ id: z.string().uuid() });
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const list = (s?: string) => s?.split(',').map((x) => x.trim()).filter(Boolean);
const SORTS: Record<string, string> = { created: 'created_at', name: 'name', rating: 'rating', reviews: 'review_count', city: 'city', score: 'opportunity_score' };
const RESULT_COLS = ['name', 'category', 'city', 'country_code', 'address', 'latitude', 'longitude', 'website_url', 'website_status', 'phone', 'email', 'rating', 'review_count', 'research_status',
  'data_completeness', 'created_at', 'excluded', 'do_not_contact', 'opportunity_score', 'opportunity_label'];
const rx = (v: string, o: 'contains' | 'exact') => ({ $regex: o === 'exact' ? `^${escapeRegex(v)}$` : escapeRegex(v), $options: 'i' });
const notFound = { error: { code: 'not_found', message: 'Not found' } };

const Results = z.object({
  q: z.string().trim().max(100).optional(), jobId: z.string().uuid().optional(), countryCode: z.string().length(2).optional(),
  city: z.string().trim().max(100).optional(), category: z.string().trim().max(100).optional(),
  websiteStatus: z.string().optional(), researchStatus: z.string().optional(), provider: z.string().optional(),
  hasPhone: bool.optional(), hasEmail: bool.optional(), minRating: z.coerce.number().min(0).max(5).optional(), maxRating: z.coerce.number().min(0).max(5).optional(),
  minReviewCount: z.coerce.number().int().min(0).optional(), minScore: z.coerce.number().int().min(0).max(100).optional(), since: z.string().datetime().optional(), includeExcluded: bool.optional(),
  bbox: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/).optional(), // south,west,north,east (for the map)
  sort: z.enum(['created', 'name', 'rating', 'reviews', 'city', 'score']).default('created'), dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

export async function discoveryRoutes(app: FastifyInstance) {
  app.post('/api/discovery/search', async (req, reply) => {
    const params = DiscoverySearch.parse(req.body);
    const id = newId();
    await col('prospecting_jobs').insertOne({ ...jobDefaults(), _id: id, job_type: 'discovery', parameters: params });
    kick(id, (e) => req.log.error(e));
    return reply.code(202).send({ data: { jobId: id, status: 'pending' } });
  });

  app.get('/api/discovery/jobs/:id', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const j = await col('prospecting_jobs').findOne({ _id: id, job_type: 'discovery' });
    if (!j) return reply.code(404).send(notFound);
    return { data: { ...pick(j, ['job_type', 'status', 'parameters', 'total_tasks', 'completed_tasks', 'failed_tasks', 'retry_count', 'error_details', 'created_at', 'updated_at']),
      businesses_found: await col('job_items').countDocuments({ job_id: id }) } };
  });

  for (const [action, from, to] of [['pause', ['pending', 'running'], 'paused'], ['resume', ['paused'], 'pending'], ['cancel', ['pending', 'running', 'paused'], 'cancelled']] as const)
    app.post(`/api/discovery/jobs/:id/${action}`, async (req, reply) => {
      const { id } = Id.parse(req.params);
      const r = await col('prospecting_jobs').findOneAndUpdate({ _id: id, job_type: 'discovery', status: { $in: [...from] } }, { $set: { status: to, updated_at: now() } }, { returnDocument: 'after' });
      if (!r) return reply.code(409).send({ error: { code: 'invalid_state', message: `Job cannot be ${action}d in its current state` } });
      if (action === 'resume') kick(id, (e) => req.log.error(e));
      return { data: { id: r._id, status: r.status } };
    });

  app.get('/api/discovery/results', async (req) => {
    const f = Results.parse(req.query);
    const and: Record<string, unknown>[] = [];
    const range = (field: string, op: '$gte' | '$lte', v: number) => and.push({ [field]: { [op]: v } });
    if (!f.includeExcluded) and.push({ excluded: false });
    if (f.q) and.push({ name: rx(f.q, 'contains') });
    if (f.countryCode) and.push({ country_code: f.countryCode.toUpperCase() });
    if (f.city) and.push({ city: rx(f.city, 'exact') });
    if (f.category) and.push({ category: rx(f.category, 'contains') });
    if (f.websiteStatus) and.push({ website_status: { $in: list(f.websiteStatus) } });
    if (f.researchStatus) and.push({ research_status: { $in: list(f.researchStatus) } });
    if (f.jobId) and.push({ _id: { $in: await col('job_items').distinct('business_id', { job_id: f.jobId }) } });
    if (f.provider) and.push({ _id: { $in: await col('business_sources').distinct('business_id', { provider: { $in: list(f.provider) } }) } });
    if (f.hasPhone !== undefined) and.push({ phone: f.hasPhone ? { $ne: null } : null });
    if (f.hasEmail !== undefined) and.push({ email: f.hasEmail ? { $ne: null } : null });
    if (f.minRating !== undefined) range('rating', '$gte', f.minRating); // unknown ratings are excluded only when you ask for a minimum
    if (f.maxRating !== undefined) range('rating', '$lte', f.maxRating);
    if (f.minReviewCount !== undefined) range('review_count', '$gte', f.minReviewCount);
    if (f.minScore !== undefined) range('opportunity_score', '$gte', f.minScore);
    if (f.since) and.push({ created_at: { $gte: new Date(f.since) } });
    if (f.bbox) { const [s, we, n, e] = f.bbox.split(',').map(Number); and.push({ latitude: { $gte: s, $lte: n } }, { longitude: { $gte: we, $lte: e } }); }
    const [r] = await col('businesses').aggregate([
      ...(and.length ? [{ $match: { $and: and } }] : []),
      { $facet: {
        rows: [...nullsLastStages(SORTS[f.sort], f.dir === 'asc' ? 1 : -1), { $skip: (f.page - 1) * f.pageSize }, { $limit: f.pageSize },
          { $lookup: { from: 'leads', localField: '_id', foreignField: 'business_id', as: 'l' } },
          { $lookup: { from: 'business_sources', localField: '_id', foreignField: 'business_id', as: 's' } }],
        total: [{ $count: 'n' }],
      } },
    ], { collation: textCollation }).toArray();
    const data = r.rows.map((b: any) => { const srcs = [...new Set(b.s.map((x: any) => x.provider as string))].sort();
      return { ...pick(b, RESULT_COLS), lead_id: b.l[0]?._id ?? null, sources: srcs.length ? srcs : null }; });
    return { data, meta: { page: f.page, pageSize: f.pageSize, total: r.total[0]?.n ?? 0 } };
  });

  app.post('/api/discovery/add-to-leads', async (req) => {
    const { businessIds } = z.object({ businessIds: z.array(z.string().uuid()).min(1).max(200) }).parse(req.body);
    const eligible = (await col('businesses').find({ _id: { $in: businessIds }, do_not_contact: false, excluded: false }, { projection: { _id: 1 } }).toArray()).map((x) => x._id as string);
    let added = 0;
    for (const business_id of eligible) { // one at a time so the unique index on leads.business_id decides, like ON CONFLICT DO NOTHING
      const leadId = await insertIgnore(col('leads'), { business_id }, { status: 'new', opportunity_score: null, assigned_tags: [], notes: null, follow_up_at: null, created_at: now(), updated_at: now() });
      if (!leadId) continue;
      await addActivity(leadId, 'created', 'Added from discovery');
      added++;
    }
    return { data: { added, skipped: businessIds.length - added } };
  });

  app.post('/api/businesses/:id/exclude', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const r = await col('businesses').updateOne({ _id: id }, { $set: { excluded: true, updated_at: now() } });
    return r.matchedCount ? { data: { id } } : reply.code(404).send(notFound);
  });
  app.post('/api/businesses/:id/do-not-contact', async (req, reply) => {
    const { id } = Id.parse(req.params); const { reason } = z.object({ reason: z.string().max(300).optional() }).parse(req.body ?? {});
    const r = await col('businesses').updateOne({ _id: id }, { $set: { do_not_contact: true, excluded: true, updated_at: now() } });
    if (!r.matchedCount) return reply.code(404).send(notFound);
    await col('suppression_list').insertOne({ _id: newId(), business_id: id, contact_value: null, reason: reason ?? 'Marked do not contact', created_at: now() });
    return { data: { id } };
  });

  app.get('/api/discovery/categories', async () => ({ data: Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label })) }));

  app.post('/api/businesses/bulk', async (req) => {
    const b = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), action: z.enum(['exclude', 'do_not_contact']) }).parse(req.body);
    if (b.action === 'exclude') return { data: { updated: (await col('businesses').updateMany({ _id: { $in: b.ids } }, { $set: { excluded: true, updated_at: now() } })).matchedCount } };
    const found = (await col('businesses').find({ _id: { $in: b.ids } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id as string);
    if (found.length) await col('businesses').updateMany({ _id: { $in: found } }, { $set: { do_not_contact: true, excluded: true, updated_at: now() } });
    const already = new Set(await col('suppression_list').distinct('business_id', { business_id: { $in: found } }));
    const fresh = found.filter((id) => !already.has(id));
    if (fresh.length) await col('suppression_list').insertMany(fresh.map((business_id) => ({ _id: newId(), business_id, contact_value: null, reason: 'Marked do not contact (bulk)', created_at: now() })));
    return { data: { updated: found.length } };
  });

  app.get('/api/saved-searches', async () => ({ data: (await col('saved_searches').find({}).sort({ created_at: -1 }).limit(100).toArray()).map((s) => pick(s, ['name', 'filters', 'created_at'])) }));
  app.post('/api/saved-searches', async (req, reply) => {
    const b = z.object({ name: z.string().trim().min(1).max(100), filters: DiscoverySearch }).parse(req.body);
    const id = newId();
    await col('saved_searches').insertOne({ _id: id, name: b.name, filters: b.filters, created_at: now() });
    return reply.code(201).send({ data: { id } });
  });
  app.delete('/api/saved-searches/:id', async (req, reply) => {
    const { id } = Id.parse(req.params);
    return (await col('saved_searches').deleteOne({ _id: id })).deletedCount ? reply.code(204).send() : reply.code(404).send(notFound);
  });

  app.get('/api/providers', async () => {
    const off = new Set((await col('provider_settings').find({ enabled: false }).toArray()).map((r) => r.provider_name as string));
    return { data: Object.values(ADAPTERS).map((a) => ({ name: a.name, label: a.label, requiresKey: a.requiresKey, configured: a.isConfigured(), enabled: !off.has(a.name), coverageNote: a.coverageNote, attribution: a.attribution })) };
  });
  app.patch('/api/providers/:name', async (req, reply) => {
    const { name } = z.object({ name: z.string() }).parse(req.params); const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    if (!ADAPTERS[name]) return reply.code(404).send(notFound);
    await col('provider_settings').updateOne({ provider_name: name }, { $set: { enabled, updated_at: now() }, $setOnInsert: { _id: newId(), configuration: {}, created_at: now() } }, { upsert: true });
    return { data: { name, enabled } };
  });
  app.post('/api/providers/:name/test', async (req, reply) => {
    const { name } = z.object({ name: z.string() }).parse(req.params); const a = ADAPTERS[name];
    if (!a) return reply.code(404).send(notFound);
    try { return { data: { ok: true, message: await a.test(AbortSignal.timeout(20_000)) } }; }
    catch (e) { return { data: { ok: false, message: e instanceof Error ? e.message : 'Test failed' } }; } // message never contains the key
  });
}
