import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from './env.js';

const COOKIE = 'pos_session';
const TTL_S = 60 * 60 * 24 * 7;
const prod = env.NODE_ENV === 'production';

const sign = (p: string) => createHmac('sha256', env.SESSION_SECRET).update(p).digest('base64url');
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function makeToken() {
  const p = Buffer.from(JSON.stringify({ sub: env.OWNER_EMAIL, exp: Date.now() + TTL_S * 1000 })).toString('base64url');
  return `${p}.${sign(p)}`;
}
function validToken(t: string | undefined): boolean {
  if (!t) return false;
  const [p, s] = t.split('.');
  if (!p || !s || !safeEq(s, sign(p))) return false;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
function passwordOk(pw: string): boolean {
  const [salt, hash] = env.OWNER_PASSWORD_HASH.split(':');
  return timingSafeEqual(scryptSync(pw, salt, 64), Buffer.from(hash, 'hex'));
}

export async function authPlugin(app: FastifyInstance) {
  // Gate every /api route except login and health. Mutations also need a custom header,
  // which forces a CORS preflight and blocks cross-site form posts (CSRF defence).
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (!path.startsWith('/api/') || path === '/api/auth/login' || path === '/api/health' || path === '/api/cron/tick') return;
    if (!validToken(req.cookies[COOKIE])) return reply.code(401).send({ error: { code: 'unauthorized', message: 'Sign in required' } });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-prospectos'] !== '1')
      return reply.code(403).send({ error: { code: 'csrf', message: 'Missing request header' } });
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = z.object({ email: z.string(), password: z.string().min(1).max(200) }).safeParse(req.body);
    const okPw = b.success && passwordOk(b.data.password); // always run the hash to avoid timing leaks
    if (!b.success || !okPw || b.data.email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase())
      return reply.code(401).send({ error: { code: 'invalid_credentials', message: 'Invalid email or password' } });
    reply.setCookie(COOKIE, makeToken(), { httpOnly: true, secure: prod, sameSite: prod ? 'none' : 'lax', path: '/', maxAge: TTL_S });
    return { data: { email: env.OWNER_EMAIL } };
  });
  app.post('/api/auth/logout', async (_q, reply) => { reply.clearCookie(COOKIE, { path: '/' }); return { data: { ok: true } }; });
  app.get('/api/auth/me', async () => ({ data: { email: env.OWNER_EMAIL } }));
}
