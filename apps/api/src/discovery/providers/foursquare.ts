import { env } from '../../env.js';
import { fetchTimeout, throttle } from '../../lib/throttle.js';
import { CATEGORIES, splitCategories } from '../categories.js';
import { ProviderError, type DiscoveryQuery, type NormalizedPlace, type ProviderAdapter, type SearchResult } from '../types.js';

// Endpoint, Bearer auth and version header per docs.foursquare.com (checked at build time; re-verify before relying on it).
const BASE = 'https://places-api.foursquare.com';
const VERSION = '2025-06-17';

type FsqPlace = { fsq_place_id: string; name: string; latitude?: number; longitude?: number;
  location?: { address?: string; locality?: string; region?: string; postcode?: string; country?: string };
  categories?: { name: string }[]; tel?: string; website?: string; email?: string; rating?: number; stats?: { total_ratings?: number } };

export function normalizeFsq(p: FsqPlace): NormalizedPlace {
  const cc = p.location?.country;
  const rating = typeof p.rating === 'number' ? (p.rating > 5 ? p.rating / 2 : p.rating) : undefined; // FSQ legacy scale is 0-10
  return {
    provider: 'foursquare', providerRecordId: p.fsq_place_id, sourceUrl: `https://foursquare.com/v/${p.fsq_place_id}`,
    attribution: 'Data from Foursquare', name: p.name, category: p.categories?.[0]?.name,
    address: p.location?.address, city: p.location?.locality, region: p.location?.region, postalCode: p.location?.postcode,
    countryCode: cc?.length === 2 ? cc.toUpperCase() : undefined, lat: p.latitude, lon: p.longitude,
    website: p.website,
    // A missing website field may just mean the field isn't available on your plan, so never infer "none".
    websiteStatus: p.website ? 'exists' : 'unknown',
    phone: p.tel, email: p.email, rating: rating === undefined ? undefined : Math.round(rating * 10) / 10,
    reviewCount: p.stats?.total_ratings, raw: p,
  };
}

export class FoursquareAdapter implements ProviderAdapter {
  readonly name = 'foursquare'; readonly label = 'Foursquare Places'; readonly requiresKey = true;
  readonly attribution = 'Data from Foursquare';
  readonly coverageNote = 'Global POI coverage, strongest in cities. Contact, website and rating fields may depend on your plan. Check Foursquare terms before storing results long-term. Free-tier limits apply.';
  isConfigured() { return !!env.FOURSQUARE_API_KEY; }

  private async get(path: string, params: Record<string, string>, signal: AbortSignal) {
    await throttle('foursquare', 250);
    const res = await fetchTimeout(`${BASE}${path}?${new URLSearchParams(params)}`, { headers: {
      Authorization: `Bearer ${env.FOURSQUARE_API_KEY}`, 'X-Places-Api-Version': VERSION, Accept: 'application/json' } }, 20_000, signal);
    if (res.status === 401 || res.status === 403) throw new ProviderError(this.name, 'Foursquare rejected the API key (check FOURSQUARE_API_KEY and plan)');
    if (!res.ok) throw new ProviderError(this.name, `Foursquare returned HTTP ${res.status}`, res.status === 429 || res.status >= 500);
    return (await res.json()) as { results?: FsqPlace[] };
  }

  async search(q: DiscoveryQuery, signal: AbortSignal): Promise<SearchResult> {
    const { known, custom } = splitCategories(q.categories);
    const terms = [...known.map((k) => CATEGORIES[k].fsq), ...custom, ...q.keywords].slice(0, 10);
    const seen = new Set<string>(); const places: NormalizedPlace[] = []; const warnings: string[] = []; let firstErr: unknown;
    for (const area of q.areas) for (const term of terms) {
      try {
        const json = await this.get('/places/search', { query: term, ll: `${area.lat},${area.lon}`,
          radius: String(Math.min(area.radiusM, 100_000)), limit: String(Math.min(q.limit, 50)) }, signal);
        for (const r of json.results ?? []) if (!seen.has(r.fsq_place_id)) { seen.add(r.fsq_place_id); places.push(normalizeFsq(r)); }
      } catch (e) { firstErr ??= e; warnings.push(`${area.label} / ${term}: ${e instanceof Error ? e.message : 'failed'}`); }
    }
    if (!places.length && firstErr) throw firstErr;
    return { places, warnings };
  }

  async test(signal: AbortSignal) {
    if (!this.isConfigured()) throw new ProviderError(this.name, 'FOURSQUARE_API_KEY is not set');
    await this.get('/places/search', { query: 'coffee', ll: '40.7128,-74.0060', limit: '1' }, signal);
    return 'Foursquare key accepted';
  }
}
