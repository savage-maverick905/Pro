import { describe, expect, it } from 'vitest';
import http from 'node:http'; import zlib from 'node:zlib';
import { isBlockedIp, validateUrl } from './net.js';
import { makeSafeFetch, FetchError } from './safeFetch.js';
import { robotsAllows } from './robots.js';
import { parseHtml } from './html.js';
import { auditPage, hostPlatform } from './audit.js';
import { scoreIdentity } from './identity.js';
describe('research modules (SSRF guard, robots, parser, audit, identity)', () => {
  it('passes all checks', async () => {
let _x = 0;
const failed: string[] = []; const ok = (n: string, c: boolean, extra = '') => { if (!c) failed.push(`${n} ${extra}`); };
const throws = (n: string, f: () => unknown) => { try { f(); ok(n, false, 'did not throw'); } catch { /* expected */ } };

for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.100.100.200', '0.0.0.0', '224.0.0.1', '::1', 'fd00:ec2::254', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', 'garbage'])
  ok(`blocks ${ip}`, isBlockedIp(ip));
for (const ip of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '2606:4700:4700::1111']) ok(`allows ${ip}`, !isBlockedIp(ip));
for (const u of ['http://localhost/', 'http://127.0.0.1/', 'http://2130706433/', 'http://[::1]/', 'http://0x7f.1/', 'http://10.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'ftp://example.com', 'file:///etc/passwd', 'javascript:alert(1)',
  'https://user:pw@example.com', 'https://example.com:22/', 'http://intranet/', 'http://printer.local/', 'http://foo.internal/']) throws(`rejects ${u}`, () => validateUrl(u));
ok('accepts bare domain', validateUrl('example.com/a').href === 'https://example.com/a');

ok('robots disallow', !robotsAllows('User-agent: *\nDisallow: /private', '/private/x'));
ok('robots allow other', robotsAllows('User-agent: *\nDisallow: /private', '/'));
ok('robots allow longest', robotsAllows('User-agent: *\nDisallow: /a\nAllow: /a/b', '/a/b/c'));
ok('robots full block', !robotsAllows('User-agent: *\nDisallow: /', '/'));
ok('robots specific agent', !robotsAllows('User-agent: *\nAllow: /\nUser-agent: prospectos-research\nDisallow: /', '/'));
ok('robots empty disallow', robotsAllows('User-agent: *\nDisallow:', '/x'));

const big = 'x'.repeat(2_000_000);
const server = http.createServer((req, res) => {
  const u = req.url ?? '/';
  if (u === '/ok') { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<html><title>Hi</title></html>'); }
  else if (u === '/redir') { res.statusCode = 302; res.setHeader('location', '/ok'); res.end(); }
  else if (u === '/loop') { res.statusCode = 302; res.setHeader('location', '/loop'); res.end(); }
  else if (u === '/meta') { res.statusCode = 302; res.setHeader('location', 'http://169.254.169.254/latest/meta-data/'); res.end(); }
  else if (u === '/big') { res.setHeader('content-type', 'text/html'); res.end(big); }
  else if (u === '/pdf') { res.setHeader('content-type', 'application/pdf'); res.end('%PDF'); }
  else if (u === '/gz') { res.setHeader('content-type', 'text/html'); res.setHeader('content-encoding', 'gzip'); res.end(zlib.gzipSync('<p>' + 'a'.repeat(5_000_000) + '</p>')); }
  else if (u === '/404') { res.statusCode = 404; res.setHeader('content-type', 'text/html'); res.end('nope'); }
  else if (u === '/slow') { /* never respond */ }
  else res.end('?');
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port; const base = `http://127.0.0.1:${port}`;
const open = makeSafeFetch({ isBlockedIp: (ip) => ip.startsWith('10.') || ip.startsWith('169.254.'), allowedPorts: null, allowLocalNames: true });
const code = async (p: Promise<unknown>) => { try { await p; return 'none'; } catch (e) { return e instanceof FetchError ? e.code : 'other:' + String(e); } };

const r = await open(`${base}/ok`); ok('fetch ok', r.status === 200 && r.body.includes('Hi'));
const rr = await open(`${base}/redir`); ok('follows redirect', rr.status === 200 && rr.redirects.length === 1);
ok('redirect loop capped', (await code(open(`${base}/loop`, { maxRedirects: 3 }))) === 'too_many_redirects');
ok('redirect to metadata IP blocked', (await code(open(`${base}/meta`))) === 'unsafe_url');
const b = await open(`${base}/big`, { maxBytes: 100_000 }); ok('size cap truncates', b.truncated && b.body.length === 100_000, String(b.body.length));
ok('pdf rejected', (await code(open(`${base}/pdf`))) === 'bad_content_type');
const g = await open(`${base}/gz`, { maxBytes: 50_000 }); ok('gzip bomb capped', g.truncated && g.body.length === 50_000, String(g.body.length));
ok('404 returned not thrown', (await open(`${base}/404`)).status === 404);
const t0 = Date.now(); ok('timeout', (await code(open(`${base}/slow`, { timeoutMs: 500 }))) === 'timeout' && Date.now() - t0 < 3000);
const rebind = makeSafeFetch({ isBlockedIp: (ip) => ip.startsWith('127.') || ip === '::1', allowedPorts: null, allowLocalNames: true });
ok('connect-time block (name resolves to loopback)', (await code(rebind(`http://localhost:${port}/ok`))) === 'unsafe_url');
ok('default guard blocks loopback', (await code(makeSafeFetch()(`${base}/ok`))) === 'unsafe_url');
server.close(); server.closeAllConnections?.();

const html = `<!doctype html><html lang="en"><head><title>Blue Door Bakery | Lisbon</title><meta name="description" content="Fresh bread baked daily in the heart of Lisbon since 1998, order ahead."><meta name="viewport" content="width=device-width"><!-- <h1>hidden</h1> -->
<script>var a = "<h1>fake</h1>";</script><style>h1{}</style><script type="application/ld+json">{"@type":"Bakery"}</script></head>
<body><nav><a href="/menu">Menu</a><a href="/contact">Contact us</a></nav><h1>Blue Door Bakery</h1><p>Call +351 21 123 4567 in Lisbon.</p>
<a href="mailto:Hello@Bluedoor.pt?subject=x">Email</a><a href="tel:+351211234567">Call</a><a href="https://www.instagram.com/bluedoor">IG</a><a href="https://facebook.com/sharer.php?u=1">Share</a>
<button>Order now</button><a href="https://calendly.com/x">Book</a><img src="a.jpg"><img src="b.jpg" alt="b"><img src="c.jpg"><img src="d.jpg"><p>Prices from €3</p></body></html>`;
const pg = parseHtml(html);
ok('parse title', pg.title === 'Blue Door Bakery | Lisbon'); ok('script text not parsed as tags', pg.headings.length === 1 && pg.headings[0].text === 'Blue Door Bakery', JSON.stringify(pg.headings));
ok('parse links', pg.links.length === 7, String(pg.links.length)); ok('json-ld type', pg.jsonLdTypes.includes('Bakery')); ok('images', pg.images.length === 4);
const a = auditPage({ page: pg, finalUrl: 'https://bluedoor.pt/', status: 200, redirects: [], responseMs: 300, truncated: false, brokenLinks: [], linksChecked: 0 });
ok('emails/phones', a.contacts.emails[0] === 'hello@bluedoor.pt' && a.contacts.phones[0] === '+351211234567', JSON.stringify(a.contacts));
ok('contact page', a.contacts.contactPageUrl === 'https://bluedoor.pt/contact'); ok('social ignores share links', a.social.length === 1 && a.social[0].platform === 'instagram', JSON.stringify(a.social));
ok('booking detected', (a.data.booking as { found: boolean }).found); ok('pricing detected', a.data.pricingFound === true); ok('has viewport -> no viewport issue', !a.issues.some((i) => i.code === 'no_viewport'));
ok('alt issue', a.issues.some((i) => i.code === 'images_missing_alt'));
const bare = auditPage({ page: parseHtml('<html><head></head><body><p>hi</p></body></html>'), finalUrl: 'http://x.com/', status: 200, redirects: [], responseMs: 100, truncated: false, brokenLinks: [], linksChecked: 0 });
const codes = bare.issues.map((i) => i.code); ok('flags http/title/viewport', ['no_https', 'missing_title', 'no_viewport', 'no_contact_info'].every((c) => codes.includes(c)), codes.join());
const spa = parseHtml('<html><head><script src="a.js"></script><script src="b.js"></script><script src="c.js"></script></head><body><div id="root"></div></body></html>');
const sa = auditPage({ page: spa, finalUrl: 'https://spa.io/', status: 200, redirects: [], responseMs: 100, truncated: false, brokenLinks: [], linksChecked: 0 });
ok('SPA: content checks skipped, not reported as problems', sa.jsRendered && !sa.issues.some((i) => ['no_contact_info', 'no_booking_found', 'no_cta'].includes(i.code)));
ok('platform map', hostPlatform('www.facebook.com') === 'facebook' && hostPlatform('example.com') === undefined);
const idv = scoreIdentity({ name: 'Blue Door Bakery', city: 'Lisbon', phone: '+351 21 123 4567' }, pg, 'https://bluedoor.pt/', true);
ok('identity verified', idv.level === 'verified', JSON.stringify(idv));
const idx = scoreIdentity({ name: 'Joe Plumbing', city: 'Leeds', phone: '+44 113 000 0000' }, pg, 'https://bluedoor.pt/', false);
ok('identity unverified for a different business', idx.level === 'unverified', JSON.stringify(idx));
const t1 = Date.now(); parseHtml('<a '.repeat(150_000)); parseHtml('<!--'.repeat(150_000)); parseHtml('<div class="'.repeat(100_000)); ok('hostile HTML parses fast', Date.now() - t1 < 4000, `${Date.now() - t1}ms`);
expect(failed).toEqual([]);

  }, 90_000);
});
