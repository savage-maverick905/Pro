import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { authPlugin } from './auth.js';
import { recoverDiscoveryJobs } from './discovery/run.js';
import { db } from './db.js';
import { env } from './env.js';
import { workerRoutes } from './routes/worker.js';
import { analyticsRoutes } from './routes/analytics.js';
import { discoveryRoutes } from './routes/discovery.js';
import { leadRoutes } from './routes/leads.js';
import { outreachRoutes } from './routes/outreach.js';
import { researchRoutes } from './routes/research.js';
import { serviceRoutes } from './routes/services.js';
import { settingsRoutes } from './routes/settings.js';

export async function buildServer() {
  const app = Fastify({ logger: { level: env.NODE_ENV === 'production' ? 'info' : 'debug', redact: ['req.headers.cookie'] }, trustProxy: true });
  await app.register(helmet);
  await app.register(cors, { origin: env.FRONTEND_URL ?? false, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Prospectos'] });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError)
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Invalid input', details: err.issues.map((i) => ({ path: i.path, message: i.message })) } });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: { code: err.code ?? 'bad_request', message: err.message } });
    req.log.error(err); // never leak DB errors or internals to the client
    return reply.code(500).send({ error: { code: 'internal_error', message: 'Something went wrong' } });
  });

  app.get('/api/health', async () => { await db.command({ ping: 1 }); return { data: { ok: true } }; });
  await app.register(authPlugin);
  await app.register(leadRoutes);
  await app.register(analyticsRoutes);
  await app.register(discoveryRoutes);
  await app.register(researchRoutes);
  await app.register(outreachRoutes);
  await app.register(serviceRoutes);
  await app.register(settingsRoutes);
  await app.register(workerRoutes);
  return app;
}

// Vercel's Fastify runtime imports this module and uses the default export; locally we listen on PORT.
let app: Awaited<ReturnType<typeof buildServer>> | undefined;
if (process.env.VITEST === undefined) {
  app = await buildServer();
  if (!process.env.VERCEL) {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    await recoverDiscoveryJobs((e) => app!.log.error(e));
  }
}
export default app;
