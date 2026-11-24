import { env } from '../env.js';
import { fetchTimeout, throttle } from '../lib/throttle.js';
import type { Area } from './types.js';
import type { LocationInput } from './schema.js';

// Nominatim public instance: max 1 request/second, identifying User-Agent, no bulk use.
// Verify current terms at https://operations.osmfoundation.org/policies/nominatim/ before heavy use.
const cache = new Map<string, Area>();

export function locationText(l: LocationInput): string {
  return l.query ?? [l.district, l.city, l.postalCode, l.state, l.country].filter(Boolean).join(', ');
}

export async function resolveArea(l: LocationInput, signal: AbortSignal): Promise<Area> {
  const radiusM = Math.round(l.radiusKm * 1000);
  if (l.lat !== undefined && l.lon !== undefined) return { label: `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}`, lat: l.lat, lon: l.lon, radiusM };
  const text = locationText(l);
  const hit = cache.get(text.toLowerCase());
  if (hit) return { ...hit, radiusM };
  await throttle('nominatim', 1100);
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: text, format: 'jsonv2', limit: '1', addressdetails: '1' })}`;
  const res = await fetchTimeout(url, { headers: { 'User-Agent': `ProspectOS/0.1 (${env.OWNER_EMAIL})`, Accept: 'application/json' } }, 15_000, signal);
  if (!res.ok) throw new Error(`Geocoder returned HTTP ${res.status} for "${text}"`);
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string; address?: { country_code?: string } }[];
  if (!rows[0]) throw new Error(`Location not found: "${text}"`);
  const area: Area = { label: rows[0].display_name, lat: Number(rows[0].lat), lon: Number(rows[0].lon), radiusM, countryCode: rows[0].address?.country_code?.toUpperCase() };
  cache.set(text.toLowerCase(), area);
  return area;
}
