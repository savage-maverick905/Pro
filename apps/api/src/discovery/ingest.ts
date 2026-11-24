import { businessDefaults, coalesce, col, insertIgnore, newId, now, safeKeys } from '../db.js';
import { normalizeDomain, normalizeName } from '../lib/normalize.js';
import { normalizePhone } from '../lib/phone.js';
import { compareBusinesses, type MatchInput } from './match.js';
import type { NormalizedPlace, WebsiteStatus } from './types.js';

export type Outcome = 'created' | 'merged' | 'existing' | 'review';
const cc = (v?: string) => (v && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : null);

export function mergeWebsiteStatus(existing: string, incoming: WebsiteStatus): string {
  if (incoming === 'exists' && ['unknown', 'none_found'].includes(existing)) return 'exists';
  if (incoming === 'none_found' && existing === 'unknown') return 'none_found';
  return existing; // research-derived states (inaccessible, redirects, verified_none) are never overwritten by listings
}
function completeness(p: NormalizedPlace): number {
  const f = [p.address, p.city, p.phone, p.website, p.email, p.lat, p.category];
  return Math.round((f.filter((x) => x !== undefined && x !== null && x !== '').length / f.length) * 100) / 100;
}
const rating = (p: NormalizedPlace) => (p.rating !== undefined && p.rating >= 0 && p.rating <= 5 ? p.rating : null);

export async function ingestPlace(p: NormalizedPlace, autoResearch: boolean): Promise<{ businessId: string; outcome: Outcome; excluded: boolean }> {
  // keeps each source's own values (conflicts stay visible); undefined fields are dropped, and keys are made safe for MongoDB
  const sourceData = safeKeys({ normalized: { ...p, raw: undefined }, original: p.raw });

  const src = await col('business_sources').findOne({ provider: p.provider, provider_record_id: p.providerRecordId });
  if (src) {
    await col('business_sources').updateOne({ _id: src._id }, { $set: { raw_data: sourceData, collected_at: now() } });
    const sb = await col('businesses').findOne({ _id: src.business_id }, { projection: { excluded: 1 } });
    return { businessId: src.business_id, outcome: 'existing', excluded: sb?.excluded ?? false };
  }

  const domain = normalizeDomain(p.website); const phoneE164 = normalizePhone(p.phone); const nname = normalizeName(p.name);
  const conds: Record<string, unknown>[] = [];
  if (domain) conds.push({ normalized_domain: domain });
  if (phoneE164) conds.push({ phone_e164: phoneE164 });
  if (p.lat !== undefined && p.lon !== undefined) {
    const dLat = 0.005, dLon = Math.min(0.005 / Math.max(Math.cos((p.lat * Math.PI) / 180), 0.01), 1);
    conds.push({ latitude: { $gte: p.lat - dLat, $lte: p.lat + dLat }, longitude: { $gte: p.lon - dLon, $lte: p.lon + dLon } });
  }
  const cands: any[] = conds.length ? await col('businesses').find({ $or: conds },
    { projection: { name: 1, normalized_name: 1, address: 1, city: 1, latitude: 1, longitude: 1, normalized_domain: 1, phone_e164: 1, website_status: 1, excluded: 1 } }).limit(50).toArray() : [];

  const me: MatchInput = { normalizedName: nname, address: p.address, city: p.city, lat: p.lat, lon: p.lon, domain, phoneE164 };
  let best: { row: any; res: ReturnType<typeof compareBusinesses> } | null = null;
  for (const row of cands) {
    const res = compareBusinesses(me, { normalizedName: row.normalized_name, address: row.address, city: row.city, lat: row.latitude, lon: row.longitude, domain: row.normalized_domain, phoneE164: row.phone_e164 });
    if (res.level !== 'low' && (!best || res.score > best.res.score)) best = { row, res };
  }

  let businessId: string; let outcome: Outcome; let excluded = false;
  if (best && best.res.level === 'high') {
    const r = best.row; businessId = r._id; outcome = 'merged'; excluded = r.excluded ?? false;
    // fills gaps only: existing values win (a pipeline update lets coalesce run atomically on the stored document)
    await col('businesses').updateOne({ _id: businessId }, [{ $set: {
      category: coalesce('category', p.category), address: coalesce('address', p.address), city: coalesce('city', p.city), region: coalesce('region', p.region),
      postal_code: coalesce('postal_code', p.postalCode), country_code: coalesce('country_code', cc(p.countryCode)), latitude: coalesce('latitude', p.lat), longitude: coalesce('longitude', p.lon),
      website_url: coalesce('website_url', p.website), normalized_domain: coalesce('normalized_domain', domain), website_status: { $literal: mergeWebsiteStatus(r.website_status, p.websiteStatus) },
      phone: coalesce('phone', p.phone), phone_e164: coalesce('phone_e164', phoneE164), email: coalesce('email', p.email), rating: coalesce('rating', rating(p)),
      review_count: coalesce('review_count', p.reviewCount), updated_at: '$$NOW' } }]);
  } else {
    businessId = newId();
    await col('businesses').insertOne({ ...businessDefaults(), _id: businessId, name: p.name, normalized_name: nname, category: p.category ?? null, country_code: cc(p.countryCode), region: p.region ?? null,
      city: p.city ?? null, postal_code: p.postalCode ?? null, address: p.address ?? null, latitude: p.lat ?? null, longitude: p.lon ?? null, website_url: p.website ?? null, normalized_domain: domain ?? null,
      website_status: p.websiteStatus, phone: p.phone ?? null, phone_e164: phoneE164 ?? null, email: p.email ?? null, rating: rating(p), review_count: p.reviewCount ?? null,
      data_completeness: completeness(p), research_status: autoResearch ? 'queued' : 'not_researched' });
    outcome = best ? 'review' : 'created';
    if (best) {
      const [a, b] = [businessId, best.row._id as string].sort();
      await insertIgnore(col('duplicate_candidates'), { business_a: a, business_b: b }, { score: best.res.score, signals: best.res.signals, status: 'pending', created_at: now() });
    }
  }

  await insertIgnore(col('business_sources'), { provider: p.provider, provider_record_id: p.providerRecordId },
    { business_id: businessId, source_url: p.sourceUrl ?? null, raw_data: sourceData, attribution: p.attribution ?? null, collected_at: now() });
  for (const [type, value, norm] of [['phone', p.phone, phoneE164], ['email', p.email, p.email?.toLowerCase() ?? null]] as const)
    if (value) await insertIgnore(col('business_contacts'), { business_id: businessId, contact_type: type, normalized_value: norm ?? value },
      { contact_value: value, source_url: p.sourceUrl ?? null, verification_status: 'verified', collected_at: now() });
  return { businessId, outcome, excluded };
}
