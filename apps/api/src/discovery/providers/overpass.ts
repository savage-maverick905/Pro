import { fetchTimeout, throttle } from '../../lib/throttle.js';
import { env } from '../../env.js';
import { CATEGORIES, splitCategories } from '../categories.js';
import { ProviderError, type Area, type DiscoveryQuery, type NormalizedPlace, type ProviderAdapter, type SearchResult } from '../types.js';

const ENDPOINT = 'https://overpass-api.de/api/interpreter';
const esc = (s: string) => s.replace(/[\\"]/g, '\\$&');
const escRegex = (s: string) => esc(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

function selector(def: string): string {
  const re = def.includes('~');
  const [k, v] = def.split(re ? '~' : '=');
  return re ? `["${k}"~"${esc(v)}"]` : `["${k}"="${esc(v)}"]`;
}

export function buildOverpassQuery(area: Area, osmSelectors: string[], keywords: string[], limit: number): string {
  const around = `(around:${area.radiusM},${area.lat},${area.lon})`;
  const lines = osmSelectors.map((s) => `  nwr${selector(s)}["name"]${around};`);
  for (const kw of keywords)
    for (const key of ['amenity', 'shop', 'office', 'tourism', 'craft', 'leisure'])
      lines.push(`  nwr["name"~"${escRegex(kw)}",i]["${key}"]${around};`);
  return `[out:json][timeout:25];\n(\n${lines.join('\n')}\n);\nout center tags ${limit};`;
}

type El = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

export function normalizeElement(e: El): NormalizedPlace | null {
  const t = e.tags ?? {};
  if (!t.name) return null;
  const lat = e.lat ?? e.center?.lat; const lon = e.lon ?? e.center?.lon;
  const website = t.website ?? t['contact:website'];
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  return {
    provider: 'openstreetmap', providerRecordId: `${e.type}/${e.id}`, sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    attribution: '© OpenStreetMap contributors (ODbL)', name: t.name,
    category: t.amenity ?? t.shop ?? t.office ?? t.tourism ?? t.craft ?? t.leisure,
    address: street || undefined, city: t['addr:city'], region: t['addr:state'], postalCode: t['addr:postcode'],
    countryCode: t['addr:country']?.length === 2 ? t['addr:country'].toUpperCase() : undefined,
    lat, lon, website, websiteStatus: website ? 'exists' : 'none_found', // absence in OSM = "no website found", not proof
    phone: t.phone ?? t['contact:phone'], email: t.email ?? t['contact:email'], raw: e,
  };
}

export class OverpassAdapter implements ProviderAdapter {
  readonly name = 'openstreetmap'; readonly label = 'OpenStreetMap (Overpass)'; readonly requiresKey = false;
  readonly attribution = '© OpenStreetMap contributors (ODbL)';
  readonly coverageNote = 'Volunteer-maintained; completeness varies widely by country and category. No ratings or review counts. Public Overpass server has fair-use limits.';
  isConfigured() { return true; }

  private async run(query: string, signal: AbortSignal) {
    await throttle('overpass', 2000);
    const res = await fetchTimeout(ENDPOINT, { method: 'POST', headers: { 'User-Agent': `ProspectOS/0.1 (${env.OWNER_EMAIL})`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: query }) }, 40_000, signal);
    if (!res.ok) throw new ProviderError(this.name, `Overpass returned HTTP ${res.status}`, [429, 502, 503, 504].includes(res.status));
    return (await res.json()) as { elements: El[]; remark?: string };
  }

  async search(q: DiscoveryQuery, signal: AbortSignal): Promise<SearchResult> {
    const { known, custom } = splitCategories(q.categories);
    const sels = known.flatMap((k) => CATEGORIES[k].osm);
    const kws = [...custom, ...q.keywords];
    const places: NormalizedPlace[] = []; const warnings: string[] = []; let firstErr: unknown;
    for (const area of q.areas) {
      try {
        const json = await this.run(buildOverpassQuery(area, sels, kws, q.limit), signal);
        if (json.remark) warnings.push(`${area.label}: ${json.remark}`);
        for (const el of json.elements) { const p = normalizeElement(el); if (p) places.push(p); }
      } catch (e) { firstErr ??= e; warnings.push(`${area.label}: ${e instanceof Error ? e.message : 'failed'}`); }
    }
    if (!places.length && firstErr) throw firstErr;
    return { places, warnings };
  }

  async test(signal: AbortSignal) {
    const res = await fetchTimeout('https://overpass-api.de/api/status', { headers: { 'User-Agent': `ProspectOS/0.1 (${env.OWNER_EMAIL})` } }, 10_000, signal);
    if (!res.ok) throw new ProviderError(this.name, `Overpass status returned HTTP ${res.status}`);
    return 'Overpass reachable';
  }
}
