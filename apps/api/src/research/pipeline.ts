import { coalesce, col, insertIgnore, newId, now as dbNow, safeKeys } from '../db.js';
import { env } from '../env.js';
import { normalizeDomain } from '../lib/normalize.js';
import { normalizePhone } from '../lib/phone.js';
import { throttle } from '../lib/throttle.js';
import { auditPage, hostPlatform, type AuditOutput, type Issue } from './audit.js';
import { parseHtml } from './html.js';
import { scoreIdentity, type IdentityResult } from './identity.js';
import { validateUrl } from './net.js';
import { runPageSpeed, type PsiResult } from './pagespeed.js';
import { robotsAllows } from './robots.js';
import { FetchError, safeFetch, type FetchResult } from './safeFetch.js';

export class PermanentError extends Error { permanent = true; }
export type Depth = 'fast' | 'deep';
type Cls = 'verified' | 'inferred' | 'unknown';
interface Ev { type: string; cls: Cls; claim: string; url?: string | null; obs?: string; conf: number }
interface Finding { claim: string; observation?: string; sourceUrl?: string | null; severity?: string }

const TAG_PLATFORM: Record<string, string> = { 'contact:facebook': 'facebook', facebook: 'facebook', 'contact:instagram': 'instagram', instagram: 'instagram', 'contact:linkedin': 'linkedin',
  linkedin: 'linkedin', 'contact:twitter': 'twitter', twitter: 'twitter', 'contact:youtube': 'youtube', 'contact:tiktok': 'tiktok' };
function listedBySources(sources: { raw_data?: { original?: { tags?: Record<string, unknown> } } }[]) {
  const social: { platform: string; url: string }[] = []; let whatsapp: string | null = null;
  for (const s of sources) for (const [k, v] of Object.entries(s.raw_data?.original?.tags ?? {})) {
    if (typeof v !== 'string') continue;
    const pl = TAG_PLATFORM[k]; if (pl && /^https?:\/\//i.test(v) && v.length < 300) social.push({ platform: pl, url: v });
    if (k === 'contact:whatsapp' && v.length < 40) whatsapp = v;
  }
  return { social, whatsapp };
}

async function robotsFor(origin: string, signal?: AbortSignal): Promise<(path: string) => boolean> {
  try {
    await throttle(`site:${new URL(origin).hostname}`, 1000);
    const r = await safeFetch(`${origin}/robots.txt`, { accept: null, maxBytes: 200_000, timeoutMs: 6000, signal });
    if (r.status >= 500) return () => false;        // server error: assume no access (standard crawler behaviour)
    if (r.status >= 400) return () => true;         // no robots.txt: no restrictions
    return (path) => robotsAllows(r.body, path);
  } catch { return () => true; }                    // unreachable robots.txt: the homepage fetch will report the real problem
}

async function checkLinks(base: string, links: string[], allows: (p: string) => boolean, limit: number, signal?: AbortSignal) {
  const pick = links.filter((l) => { try { const u = new URL(l); return u.href !== base && !/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp[34])$/i.test(u.pathname) && allows(u.pathname); } catch { return false; } }).slice(0, limit);
  const broken: { url: string; status: number }[] = []; let unreachable = 0; let idx = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let url = pick[idx++]; url; url = pick[idx++]) {
      try { await throttle(`site:${new URL(url).hostname}`, 1000); const r = await safeFetch(url, { accept: null, maxBytes: 4096, timeoutMs: 8000, signal });
        if (r.status === 404 || r.status === 410) broken.push({ url, status: r.status }); } catch { unreachable++; } // timeouts/5xx are not proof a link is broken
    }
  }));
  return { checked: pick.length, broken, unreachable };
}

export async function researchBusiness(businessId: string, opts: { depth: Depth; signal?: AbortSignal }): Promise<{ status: string; reportId: string }> {
  const b = await col('businesses').findOne({ _id: businessId });
  if (!b) throw new PermanentError('Business not found');
  await col('businesses').updateOne({ _id: businessId }, { $set: { research_status: 'researching', updated_at: dbNow() } });

  const ev: Ev[] = []; const verified: Finding[] = []; const unknown: string[] = []; const now = () => new Date().toISOString();
  const sources = await col('business_sources').find({ business_id: businessId }, { projection: { provider: 1, source_url: 1, raw_data: 1 } }).toArray();
  const providers = [...new Set(sources.map((s) => s.provider as string))];
  if (providers.length) ev.push({ type: 'source_listing', cls: 'verified', claim: `Listed by ${providers.join(', ')}`, url: sources[0].source_url, conf: 1 });
  const listed = listedBySources(sources);
  const social = new Map<string, { platform: string; url: string; verified: boolean }>();
  for (const s of listed.social) social.set(s.url, { ...s, verified: false });

  let websiteUrl: string | null = b.website_url; let socialOnly = false;
  if (websiteUrl) {
    try {
      const pl = hostPlatform(new URL(/^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`).hostname);
      if (pl) { socialOnly = true; social.set(websiteUrl, { platform: pl, url: websiteUrl, verified: false }); websiteUrl = null;
        verified.push({ claim: 'The only website listed is a social media profile', sourceUrl: b.website_url });
        ev.push({ type: 'social_only', cls: 'verified', claim: 'The only website listed is a social media profile', url: b.website_url, conf: 1 }); }
    } catch { websiteUrl = null; unknown.push('The listed website address is not a valid URL.'); }
  }
  if (!websiteUrl && !socialOnly) unknown.push('No website appears in provider listings. Searching the web for an unlisted official website needs a search API, which is not configured, so a site may still exist.');

  let siteStatus: string | null = socialOnly ? 'none_found' : null;
  let fetched: FetchResult | null = null; let audit: AuditOutput | null = null; let identity: IdentityResult | null = null; let psi: PsiResult | null = null;
  let links = { checked: 0, broken: [] as { url: string; status: number }[], unreachable: 0 }; let fetchError: string | null = null; let extraContacts = { emails: [] as string[], phones: [] as string[] };

  if (websiteUrl) {
    try {
      const u = validateUrl(websiteUrl); const allows = await robotsFor(u.origin, opts.signal);
      if (!allows(u.pathname || '/')) unknown.push('robots.txt asks automated tools not to visit the homepage, so the website was not inspected.');
      else {
        await throttle(`site:${u.hostname}`, 1000);
        fetched = await safeFetch(u.href, { signal: opts.signal });
        const sameHost = new URL(fetched.url).hostname.replace(/^www\./, '') === u.hostname.replace(/^www\./, '');
        siteStatus = fetched.status >= 400 ? 'inaccessible' : sameHost ? 'exists' : 'redirects';
        ev.push({ type: 'website_fetch', cls: 'verified', claim: `Homepage returned HTTP ${fetched.status} in ${fetched.ms} ms`, url: fetched.url, obs: fetched.redirects.length ? `Redirected via ${fetched.redirects.join(' → ')}` : undefined, conf: 1 });
        if (fetched.status < 400) {
          const page = parseHtml(fetched.body);
          identity = scoreIdentity({ name: b.name, city: b.city, phone: b.phone }, page, fetched.url, true);
          const probe = auditPage({ page, finalUrl: fetched.url, status: fetched.status, redirects: fetched.redirects, responseMs: fetched.ms, truncated: fetched.truncated, brokenLinks: [], linksChecked: 0 });
          if (identity.level !== 'unverified') {
            if (opts.depth === 'deep') {
              links = await checkLinks(fetched.url, probe.internalLinks, allows, 10, opts.signal);
              if (probe.contacts.contactPageUrl && allows(new URL(probe.contacts.contactPageUrl).pathname)) {
                try { await throttle(`site:${u.hostname}`, 1000); const cp = await safeFetch(probe.contacts.contactPageUrl, { signal: opts.signal });
                  const c = auditPage({ page: parseHtml(cp.body), finalUrl: cp.url, status: cp.status, redirects: [], responseMs: cp.ms, truncated: cp.truncated, brokenLinks: [], linksChecked: 0 }).contacts; extraContacts = { emails: c.emails, phones: c.phones };
                } catch { unknown.push('The contact page could not be fetched.'); }
              }
              if (env.GOOGLE_PAGESPEED_API_KEY) { try { psi = await runPageSpeed(fetched.url, env.GOOGLE_PAGESPEED_API_KEY, opts.signal); } catch (e) { unknown.push(`PageSpeed data unavailable: ${e instanceof Error ? e.message : 'failed'}`); } }
              else unknown.push('PageSpeed scores were not collected: GOOGLE_PAGESPEED_API_KEY is not set.');
            }
            audit = auditPage({ page, finalUrl: fetched.url, status: fetched.status, redirects: fetched.redirects, responseMs: fetched.ms, truncated: fetched.truncated, brokenLinks: links.broken, linksChecked: links.checked });
          } else audit = probe;
        }
      }
    } catch (e) {
      if (e instanceof FetchError) {
        fetchError = `${e.code}: ${e.message}`;
        if (e.code === 'tls') { siteStatus = 'exists'; verified.push({ claim: 'The website\'s TLS certificate could not be validated', observation: e.message, sourceUrl: websiteUrl, severity: 'major' }); ev.push({ type: 'website_fetch', cls: 'verified', claim: 'TLS certificate error when connecting', url: websiteUrl, obs: e.message, conf: 1 }); }
        else if (e.code !== 'unsafe_url' && e.code !== 'bad_content_type') siteStatus = 'inaccessible';
      } else fetchError = e instanceof Error ? e.message : 'Unknown error';
      unknown.push(`The website could not be inspected (${fetchError}). A single failed request does not prove the site is down.`);
    }
  }

  const attribute = !!identity && identity.level !== 'unverified';
  if (identity) ev.push({ type: 'identity', cls: identity.level === 'verified' ? 'verified' : identity.level === 'likely' ? 'inferred' : 'unknown', claim: 'The website belongs to this business', obs: identity.signals.join('; ') || 'No matching signals', url: fetched?.url, conf: identity.score });
  if (identity && !attribute) unknown.push('A website was fetched but could not be matched to this business, so nothing found on it was attributed. Review the URL manually.');
  if (audit && attribute) {
    for (const i of audit.issues as Issue[]) { verified.push({ claim: i.message, observation: i.evidence, sourceUrl: fetched?.url, severity: i.severity }); ev.push({ type: 'website_audit', cls: 'verified', claim: i.message, url: fetched?.url, obs: i.evidence, conf: 1 }); }
    if (links.unreachable) unknown.push(`${links.unreachable} link(s) could not be checked (timeouts or server errors), so they are not reported as broken.`);
    for (const s of audit.social) social.set(s.url, { ...s, verified: true });
  }
  const majors = verified.filter((f) => f.severity === 'major').length; const minors = verified.filter((f) => f.severity === 'minor').length;
  const state = socialOnly ? 'only a social media profile is listed as the website' : fetched ? `homepage fetched (HTTP ${fetched.status})` : websiteUrl ? 'the listed website could not be inspected' : 'no website found in provider listings';
  const summary = `Automated check: ${state}. ${majors} major and ${minors} minor observation(s)${psi ? ', with PageSpeed scores' : ''}. AI analysis has not been run yet.`;
  const confidence = !websiteUrl ? 0.3 : !fetched ? 0.2 : Math.max(0, Math.min(1, 0.2 + 0.5 * (identity?.score ?? 0) + (psi ? 0.1 : 0) + (audit?.jsRendered ? -0.1 : 0.1)));
  const status = identity && !attribute ? 'needs_review' : 'partial'; // "completed" is reserved for runs that include AI analysis

  let websiteId: string | null = null;
  if (websiteUrl) {
    const w = await col('websites').findOneAndUpdate({ business_id: businessId, url: websiteUrl },
      { $set: { domain: normalizeDomain(websiteUrl) ?? null, verified_official: identity?.level === 'verified', status: siteStatus ?? 'unknown', identity_confidence: identity?.score ?? null, last_checked_at: dbNow() }, $setOnInsert: { _id: newId() } },
      { upsert: true, returnDocument: 'after' });
    websiteId = w?._id ?? null;
  }
  if (audit || psi) await col('website_audits').insertOne({ _id: newId(), business_id: businessId, website_id: websiteId, performance_score: psi?.performance ?? null, accessibility_score: psi?.accessibility ?? null,
    best_practices_score: psi?.bestPractices ?? null, seo_score: psi?.seo ?? null, audit_data: safeKeys({ ...(audit?.data ?? {}), attributed: attribute, identity, pagespeed: psi, linkCheck: links }),
    issues: attribute ? audit?.issues ?? [] : [], created_at: dbNow() });
  const reportId = newId();
  await col('research_reports').insertOne({ _id: reportId, business_id: businessId, status, depth: opts.depth, summary, identity_confidence: identity?.score ?? null, research_confidence: Math.round(confidence * 100) / 100,
    verified_findings: verified, inferred_findings: [], unknown_information: unknown, recommendations: [], raw_ai_response: null, model: null, sources: providers,
    score: null, score_breakdown: null, score_label: null, created_at: dbNow() });
  if (ev.length) await col('research_evidence').insertMany(ev.map((e) => ({ _id: newId(), report_id: reportId, evidence_type: e.type, classification: e.cls, claim: e.claim.slice(0, 500), source_url: e.url ?? null,
    observation: e.obs?.slice(0, 1000) ?? null, confidence: Math.round(e.conf * 100) / 100, observed_at: dbNow() })));
  for (const s of social.values()) await insertIgnore(col('business_social_profiles'), { business_id: businessId, platform: s.platform, profile_url: s.url.slice(0, 500) }, { verification_status: s.verified ? 'verified' : 'unknown' });
  if (listed.whatsapp) await insertIgnore(col('business_contacts'), { business_id: businessId, contact_type: 'whatsapp', normalized_value: listed.whatsapp },
    { contact_value: listed.whatsapp, source_url: null, verification_status: 'verified', collected_at: dbNow() });
  if (attribute && audit) {
    const emails = [...new Set([...audit.contacts.emails, ...extraContacts.emails])]; const phones = [...new Set([...audit.contacts.phones, ...extraContacts.phones])];
    for (const [type, v, norm] of [...emails.map((e) => ['email', e, e] as const), ...phones.map((p) => ['phone', p, normalizePhone(p) ?? p] as const)])
      await insertIgnore(col('business_contacts'), { business_id: businessId, contact_type: type, normalized_value: norm },
        { contact_value: v, source_url: fetched?.url ?? null, verification_status: 'verified', collected_at: dbNow() });
    await col('businesses').updateOne({ _id: businessId }, [{ $set: { email: coalesce('email', emails[0]), phone: coalesce('phone', phones[0]), phone_e164: coalesce('phone_e164', phones[0] ? normalizePhone(phones[0]) : null) } }]);
  }
  await col('businesses').updateOne({ _id: businessId }, { $set: { ...(siteStatus != null ? { website_status: siteStatus } : {}), research_status: status, last_verified_at: dbNow(), updated_at: dbNow() } });
  return { status, reportId };
}
