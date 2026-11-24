import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addActivity, businessDefaults, col, escapeRegex, newId, nullsLastStages, now, pick, textCollation } from '../db.js';
import { normalizeDomain, normalizeName } from '../lib/normalize.js';

export const LEAD_STATUSES = ['new', 'researching', 'qualified', 'ready_to_contact', 'contacted', 'replied',
  'interested', 'negotiating', 'converted', 'not_interested', 'unresponsive', 'archived'] as const;
const Status = z.enum(LEAD_STATUSES);
const Id = z.object({ id: z.string().uuid() });
const SORTS: Record<string, string> = { updated: 'updated_at', created: 'created_at', score: 'opportunity_score', name: 'b.name', followUp: 'follow_up_at' };

const ListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.string().optional().transform((s) => s?.split(',').filter(Boolean)).pipe(z.array(Status).optional()),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  sort: z.enum(['updated', 'created', 'score', 'name', 'followUp']).default('updated'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const CreateBody = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  countryCode: z.string().length(2).optional(),
  city: z.string().trim().max(100).optional(),
  address: z.string().trim().max(300).optional(),
  websiteUrl: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().email().optional(),
  notes: z.string().max(5000).optional(),
});

const PatchBody = z.object({
  status: Status.optional(),
  notes: z.string().max(5000).nullable().optional(),
  followUpAt: z.string().datetime().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
}).refine((o) => Object.keys(o).length > 0, 'No fields to update');

const BulkBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  status: Status.optional(),
  followUpAt: z.string().datetime().nullable().optional(),
}).refine((o) => o.status !== undefined || o.followUpAt !== undefined, 'No fields to update');

const LIST_BIZ = ['name', 'category', 'city', 'country', 'website_url', 'website_status', 'phone', 'email', 'research_status'];
const DETAIL_BIZ = ['description', 'address', 'region', 'district', 'postal_code', 'latitude', 'longitude', 'rating', 'review_count', 'business_status'];
const toDate = (v: string | null | undefined) => (v ? new Date(v) : null);
const notFound = { error: { code: 'not_found', message: 'Lead not found' } };

/** A lead joined with its business, shaped like the old SQL select. */
function leadView(l: any, b: any, extra: string[] = []) {
  const biz = pick(b, [...LIST_BIZ, ...extra]); delete biz.id;
  return { id: l._id, business_id: l.business_id, status: l.status, opportunity_score: l.opportunity_score ?? null, tags: l.assigned_tags ?? [], notes: l.notes ?? null,
    follow_up_at: l.follow_up_at ?? null, created_at: l.created_at, updated_at: l.updated_at, ...biz };
}

export async function leadRoutes(app: FastifyInstance) {
  app.get('/api/leads', async (req) => {
    const f = ListQuery.parse(req.query);
    const match: Record<string, unknown> = {};
    if (f.status?.length) match.status = { $in: f.status };
    if (f.minScore !== undefined) match.opportunity_score = { $gte: f.minScore };
    const dir = f.dir === 'asc' ? 1 : -1;
    const [r] = await col('leads').aggregate([
      { $match: match },
      { $lookup: { from: 'businesses', localField: 'business_id', foreignField: '_id', as: 'b' } },
      { $unwind: '$b' },
      ...(f.q ? [{ $match: { 'b.name': { $regex: escapeRegex(f.q), $options: 'i' } } }] : []),
      { $facet: {
        rows: [...nullsLastStages(SORTS[f.sort], dir), { $skip: (f.page - 1) * f.pageSize }, { $limit: f.pageSize }],
        total: [{ $count: 'n' }],
      } },
    ], { collation: textCollation }).toArray();
    return { data: r.rows.map((x: any) => leadView(x, x.b)), meta: { page: f.page, pageSize: f.pageSize, total: r.total[0]?.n ?? 0 } };
  });

  app.post('/api/leads', async (req, reply) => {
    const b = CreateBody.parse(req.body);
    const businessId = newId(); const leadId = newId();
    await col('businesses').insertOne({ ...businessDefaults(), _id: businessId, name: b.name, normalized_name: normalizeName(b.name), category: b.category ?? null, country: b.country ?? null,
      country_code: b.countryCode?.toUpperCase() ?? null, city: b.city ?? null, address: b.address ?? null, website_url: b.websiteUrl ?? null, normalized_domain: normalizeDomain(b.websiteUrl) ?? null,
      website_status: b.websiteUrl ? 'exists' : 'unknown', phone: b.phone ?? null, email: b.email ?? null });
    await col('leads').insertOne({ _id: leadId, business_id: businessId, status: 'new', opportunity_score: null, assigned_tags: [], notes: b.notes ?? null, follow_up_at: null, created_at: now(), updated_at: now() });
    await addActivity(leadId, 'created', 'Lead added manually');
    return reply.code(201).send({ data: { id: leadId } });
  });

  app.get('/api/leads/:id', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const l = await col('leads').findOne({ _id: id });
    const b = l && await col('businesses').findOne({ _id: l.business_id });
    if (!l || !b) return reply.code(404).send(notFound);
    return { data: leadView(l, b, DETAIL_BIZ) };
  });

  app.patch('/api/leads/:id', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const b = PatchBody.parse(req.body);
    const cur = await col('leads').findOne({ _id: id }, { projection: { status: 1 } });
    if (!cur) return reply.code(404).send(notFound);
    const set: Record<string, unknown> = { updated_at: now() };
    if (b.status !== undefined) set.status = b.status;
    if (b.notes !== undefined) set.notes = b.notes;
    if (b.followUpAt !== undefined) set.follow_up_at = toDate(b.followUpAt);
    if (b.tags !== undefined) set.assigned_tags = [...new Set(b.tags)];
    await col('leads').updateOne({ _id: id }, { $set: set });
    if (b.status && b.status !== cur.status) await addActivity(id, 'status_change', `Status changed to ${b.status}`, { from: cur.status, to: b.status });
    return { data: { id } };
  });

  app.delete('/api/leads/:id', async (req, reply) => {
    const { id } = Id.parse(req.params);
    const r = await col('leads').deleteOne({ _id: id }); // business record is kept
    if (!r.deletedCount) return reply.code(404).send(notFound);
    // MongoDB has no ON DELETE CASCADE: remove everything that hung off the lead.
    const seqIds = (await col('outreach_sequences').find({ lead_id: id }, { projection: { _id: 1 } }).toArray()).map((x) => x._id);
    if (seqIds.length) {
      const msgIds = (await col('outreach_messages').find({ sequence_id: { $in: seqIds } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id);
      if (msgIds.length) await col('message_versions').deleteMany({ message_id: { $in: msgIds } });
      await col('outreach_messages').deleteMany({ sequence_id: { $in: seqIds } });
      await col('outreach_sequences').deleteMany({ _id: { $in: seqIds } });
    }
    await col('activities').deleteMany({ lead_id: id });
    return reply.code(204).send();
  });

  app.post('/api/leads/bulk-update', async (req) => {
    const b = BulkBody.parse(req.body);
    const ids = (await col('leads').find({ _id: { $in: b.ids } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id as string);
    const set: Record<string, unknown> = { updated_at: now() };
    if (b.status !== undefined) set.status = b.status;
    if (b.followUpAt !== undefined) set.follow_up_at = toDate(b.followUpAt);
    if (ids.length) await col('leads').updateMany({ _id: { $in: ids } }, { $set: set });
    if (b.status && ids.length)
      await col('activities').insertMany(ids.map((lead_id) => ({ _id: newId(), lead_id, activity_type: 'status_change', description: `Status changed to ${b.status} (bulk)`, metadata: null, created_at: now() })));
    return { data: { updated: ids.length } };
  });

  app.get('/api/leads/:id/activities', async (req) => {
    const { id } = Id.parse(req.params);
    const r = await col('activities').find({ lead_id: id }).sort({ created_at: -1 }).limit(200).toArray();
    return { data: r.map((a) => pick(a, ['activity_type', 'description', 'metadata', 'created_at'])) };
  });
}
