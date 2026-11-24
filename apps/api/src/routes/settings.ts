import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEFAULT_GROQ_MODEL, getAiSettings, getWeights, tokensUsedToday } from '../ai/analyze.js';
import { col, mergeSetting, replaceSetting, startOfTodayUtc } from '../db.js';
import { env } from '../env.js';
import { getOutreachSettings } from '../outreach/service.js';
import { getSettings } from '../worker/queue.js';

const Weights = z.object({ websiteDeficiency: z.number().int().min(0).max(100), problem: z.number().int().min(0).max(100), solutionValue: z.number().int().min(0).max(100),
  contactAccess: z.number().int().min(0).max(100), evidenceConfidence: z.number().int().min(0).max(100), activity: z.number().int().min(0).max(100) }).partial();
const Patch = z.object({
  scoring: z.object({ weights: Weights }).optional(),
  ai: z.object({ enabled: z.boolean(), dailyTokenLimit: z.number().int().min(1000).max(5_000_000), maxOutputTokensFast: z.number().int().min(200).max(4000), maxOutputTokensDeep: z.number().int().min(200).max(8000) }).partial().optional(),
  outreach: z.object({ senderName: z.string().max(100), senderBusiness: z.string().max(150), signature: z.string().max(500), defaultCta: z.string().max(200), optOutLine: z.string().max(300), language: z.string().trim().min(2).max(40) }).partial().optional(),
}).refine((o) => o.scoring || o.ai || o.outreach, 'Nothing to update');

async function snapshot() {
  return { research: await getSettings(), outreach: await getOutreachSettings(), scoring: { weights: await getWeights() },
    ai: { ...(await getAiSettings()), provider: 'groq', configured: !!env.GROQ_API_KEY, model: env.GROQ_MODEL || DEFAULT_GROQ_MODEL, tokensUsedToday: await tokensUsedToday() } };
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => ({ data: await snapshot() }));
  app.patch('/api/settings', async (req, reply) => {
    const b = Patch.parse(req.body);
    if (b.scoring) {
      const merged = { ...(await getWeights()), ...b.scoring.weights };
      if (Object.values(merged).reduce((a, c) => a + c, 0) <= 0) return reply.code(400).send({ error: { code: 'validation_error', message: 'Weights must add up to more than zero' } });
      await replaceSetting('scoring', { weights: merged });
    }
    if (b.ai) await mergeSetting('ai', b.ai);
    if (b.outreach) await mergeSetting('outreach', b.outreach);
    return { data: await snapshot() };
  });
  app.get('/api/ai/usage', async () => {
    const [today, month] = await Promise.all([
      col('ai_usage').aggregate([{ $match: { created_at: { $gte: startOfTodayUtc() } } },
        { $group: { _id: null, calls: { $sum: 1 }, input: { $sum: '$input_tokens' }, output: { $sum: '$output_tokens' }, failed: { $sum: { $cond: [{ $eq: ['$success', false] }, 1, 0] } } } }]).toArray(),
      col('ai_usage').aggregate([{ $match: { created_at: { $gte: new Date(Date.now() - 30 * 864e5) } } },
        { $group: { _id: '$operation', calls: { $sum: 1 }, input: { $sum: '$input_tokens' }, output: { $sum: '$output_tokens' } } }, { $sort: { _id: 1 } }]).toArray(),
    ]);
    const t = today[0];
    return { data: { today: { calls: t?.calls ?? 0, input: t?.input ?? 0, output: t?.output ?? 0, failed: t?.failed ?? 0 },
      last30Days: month.map((m) => ({ operation: m._id, calls: m.calls, input: m.input, output: m.output })), dailyTokenLimit: (await getAiSettings()).dailyTokenLimit } };
  });
}
