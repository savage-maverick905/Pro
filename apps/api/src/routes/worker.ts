import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { runTick } from '../worker/tick.js';

export async function workerRoutes(app: FastifyInstance) {
  // Called by the signed-in web app while it is open (session + CSRF header are enforced by the auth hook).
  app.post('/api/worker/tick', async () => ({ data: await runTick() }));

  // Optional Vercel Cron fallback. Vercel sends "Authorization: Bearer $CRON_SECRET" when CRON_SECRET is set.
  app.get('/api/cron/tick', async (req, reply) => {
    if (!env.CRON_SECRET || req.headers.authorization !== `Bearer ${env.CRON_SECRET}`)
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Invalid cron secret' } });
    return { data: await runTick() };
  });
}
