import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { col, isDuplicateKey, newId, textCollation } from '../db.js';

const list = z.array(z.string().trim().min(1).max(60)).max(40);
const Svc = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).default(''), targetCategories: list.default([]),
  problemsSolved: list.default([]), keywords: list.default([]), priority: z.number().int().min(1).max(10).default(5), active: z.boolean().default(true) });
const Id = z.object({ id: z.string().uuid() });
const map = (r: Record<string, unknown>) => ({ id: r._id, name: r.name, description: r.description, targetCategories: r.target_categories, problemsSolved: r.problems_solved, keywords: r.keywords, priority: r.priority, active: r.active });
const notFound = { error: { code: 'not_found', message: 'Service not found' } };
const dup = { error: { code: 'duplicate', message: 'A service with that name already exists' } };

export async function serviceRoutes(app: FastifyInstance) {
  app.get('/api/services', async () => ({ data: (await col('services').find({}).sort({ active: -1, priority: -1, name: 1 }).collation(textCollation).toArray()).map(map) }));
  app.post('/api/services', async (req, reply) => {
    const b = Svc.parse(req.body);
    try {
      const doc = { _id: newId(), name: b.name, description: b.description, target_categories: b.targetCategories, problems_solved: b.problemsSolved, keywords: b.keywords, priority: b.priority, active: b.active };
      await col('services').insertOne(doc);
      return reply.code(201).send({ data: map(doc) });
    } catch (e) { if (isDuplicateKey(e)) return reply.code(409).send(dup); throw e; }
  });
  app.patch('/api/services/:id', async (req, reply) => {
    const { id } = Id.parse(req.params); const b = Svc.partial().refine((o) => Object.keys(o).length > 0).parse(req.body);
    const set: Record<string, unknown> = {};
    const add = (c: string, v: unknown) => { if (v !== undefined) set[c] = v; };
    add('name', b.name); add('description', b.description); add('target_categories', b.targetCategories); add('problems_solved', b.problemsSolved);
    add('keywords', b.keywords); add('priority', b.priority); add('active', b.active);
    try {
      const r = await col('services').findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: 'after' });
      return r ? { data: map(r) } : reply.code(404).send(notFound);
    } catch (e) { if (isDuplicateKey(e)) return reply.code(409).send(dup); throw e; }
  });
  app.delete('/api/services/:id', async (req, reply) => {
    const { id } = Id.parse(req.params); // existing opportunities keep their text; their service link is cleared
    const r = await col('services').deleteOne({ _id: id });
    if (!r.deletedCount) return reply.code(404).send(notFound);
    await Promise.all([col('opportunities').updateMany({ service_id: id }, { $set: { service_id: null } }), col('outreach_sequences').updateMany({ service_id: id }, { $set: { service_id: null } })]);
    return reply.code(204).send();
  });
}
