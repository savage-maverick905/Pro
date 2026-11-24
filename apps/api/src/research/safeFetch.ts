import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { DEFAULT_GUARD, UnsafeUrlError, validateUrl, type Guard } from './net.js';

export type FetchErrorCode = 'timeout' | 'bad_content_type' | 'too_many_redirects' | 'network' | 'unsafe_url' | 'tls';
export class FetchError extends Error {
  code: FetchErrorCode;
  constructor(code: FetchErrorCode, message: string) { super(message); this.code = code; }
}
export interface FetchOptions { timeoutMs?: number; maxBytes?: number; maxRedirects?: number; accept?: string[] | null; userAgent?: string; signal?: AbortSignal }
export interface FetchResult { url: string; status: number; headers: Record<string, string>; contentType: string; body: string; redirects: string[]; truncated: boolean; ms: number }

const HTML_TYPES = ['text/html', 'application/xhtml+xml', 'text/plain'];
const TLS_CODES = /^(CERT_|DEPTH_ZERO|ERR_TLS|UNABLE_TO_VERIFY|SELF_SIGNED|ERR_SSL|HOSTNAME_MISMATCH)/;

interface Hop { status: number; headers: http.IncomingHttpHeaders; body: Buffer; truncated: boolean; redirectTo?: string }

function hop(u: URL, o: Required<Omit<FetchOptions, 'signal'>>, guard: Guard, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve, reject) => {
    // Validation happens in the same lookup the socket uses, so DNS rebinding cannot swap in a private address afterwards.
    const lookup = (hostname: string, options: { all?: boolean }, cb: (...a: unknown[]) => void) => {
      dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
        if (err) return cb(err);
        if (!addrs.length || addrs.some((a) => guard.isBlockedIp(a.address))) return cb(new UnsafeUrlError('Host resolves to a blocked address'));
        return options.all ? cb(null, addrs) : cb(null, addrs[0].address, addrs[0].family);
      });
    };
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'GET', agent: false, signal, lookup: lookup as never, headers: {
      'User-Agent': o.userAgent, Accept: 'text/html,application/xhtml+xml,*/*;q=0.5', 'Accept-Encoding': 'gzip, deflate, br', 'Accept-Language': 'en' } }, (res) => {
      const status = res.statusCode ?? 0; const loc = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && loc) { res.resume(); return resolve({ status, headers: res.headers, body: Buffer.alloc(0), truncated: false, redirectTo: loc }); }
      const ct = String(res.headers['content-type'] ?? '').toLowerCase();
      if (o.accept && status < 400 && !o.accept.some((t) => ct.startsWith(t))) { res.destroy(); return reject(new FetchError('bad_content_type', `Unsupported content type: ${ct || 'none'}`)); }
      const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
      let stream: NodeJS.ReadableStream = res;
      if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
      else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
      else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
      else if (enc && enc !== 'identity') { res.destroy(); return reject(new FetchError('bad_content_type', `Unsupported encoding: ${enc}`)); }
      const chunks: Buffer[] = []; let size = 0; let done = false;
      const finish = (truncated: boolean) => { if (done) return; done = true; res.destroy(); resolve({ status, headers: res.headers, body: Buffer.concat(chunks), truncated }); };
      stream.on('data', (c: Buffer) => { size += c.length; if (size > o.maxBytes) { chunks.push(c.subarray(0, c.length - (size - o.maxBytes))); finish(true); } else chunks.push(c); });
      stream.on('end', () => finish(false));
      stream.on('error', (e) => { if (chunks.length) finish(true); else if (!done) { done = true; reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

export function makeSafeFetch(guard: Guard = DEFAULT_GUARD) {
  return async function safeFetch(raw: string, opts: FetchOptions = {}): Promise<FetchResult> {
    const o = { timeoutMs: 12_000, maxBytes: 1_500_000, maxRedirects: 5, accept: HTML_TYPES as string[] | null, userAgent: 'ProspectOS-Research/0.1 (personal prospecting; respects robots.txt)', ...opts };
    const started = Date.now(); const redirects: string[] = [];
    const t = AbortSignal.timeout(o.timeoutMs); const signal = opts.signal ? AbortSignal.any([opts.signal, t]) : t;
    try {
      let u = validateUrl(raw, guard);
      for (let i = 0; ; i++) {
        const r = await hop(u, o, guard, signal);
        if (r.redirectTo) {
          if (i >= o.maxRedirects) throw new FetchError('too_many_redirects', 'Too many redirects');
          u = validateUrl(new URL(r.redirectTo, u).href, guard); // every redirect target is re-validated
          redirects.push(u.href); continue;
        }
        const headers: Record<string, string> = {};
        for (const k of ['content-type', 'server', 'x-powered-by', 'last-modified', 'content-language']) { const v = r.headers[k]; if (typeof v === 'string') headers[k] = v; }
        return { url: u.href, status: r.status, headers, contentType: headers['content-type'] ?? '', body: r.body.toString('utf8'), redirects, truncated: r.truncated, ms: Date.now() - started };
      }
    } catch (e) {
      if (e instanceof FetchError) throw e;
      if (e instanceof UnsafeUrlError) throw new FetchError('unsafe_url', e.message);
      const err = e as NodeJS.ErrnoException & { cause?: unknown };
      if (err.name === 'AbortError' || err.name === 'TimeoutError' || signal.aborted) throw new FetchError('timeout', 'Request timed out');
      if (err.cause instanceof UnsafeUrlError) throw new FetchError('unsafe_url', err.cause.message);
      if (TLS_CODES.test(String(err.code ?? ''))) throw new FetchError('tls', `TLS certificate problem (${err.code})`);
      throw new FetchError('network', err.code ? `Network error (${err.code})` : 'Network error');
    }
  };
}
export const safeFetch = makeSafeFetch();
