import { normalizeName } from '../lib/normalize.js';

export interface MatchInput {
  normalizedName: string; address?: string | null; city?: string | null;
  lat?: number | null; lon?: number | null; domain?: string | null; phoneE164?: string | null;
}
export type MatchLevel = 'high' | 'medium' | 'low';
export interface MatchResult { score: number; level: MatchLevel; signals: { name: number; address: number | null; distanceM: number | null; domain: boolean; phone: boolean } }

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const bigrams = (s: string) => { const t = s.replace(/ /g, ''); const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); } return m; };

/** Sørensen–Dice similarity over character bigrams of already-normalised strings (0..1). */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0; if (a === b) return 1;
  const A = bigrams(a), B = bigrams(b); let inter = 0, total = 0;
  for (const n of A.values()) total += n; for (const n of B.values()) total += n;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return total ? (2 * inter) / total : 0;
}

const ABBR: Record<string, string> = { st: 'street', rd: 'road', ave: 'avenue', av: 'avenue', blvd: 'boulevard', dr: 'drive', ln: 'lane', ct: 'court', pl: 'place', sq: 'square' };
/** English street abbreviations only; other languages fall back to plain similarity. */
const normalizeAddress = (a: string) => normalizeName(a).split(' ').map((t) => ABBR[t] ?? t).join(' ');

const hasXY = (x: MatchInput): x is MatchInput & { lat: number; lon: number } => typeof x.lat === 'number' && typeof x.lon === 'number';

export function compareBusinesses(a: MatchInput, b: MatchInput): MatchResult {
  const name = similarity(a.normalizedName, b.normalizedName);
  const addr = a.address && b.address ? similarity(normalizeAddress(a.address), normalizeAddress(b.address)) : null;
  const dist = hasXY(a) && hasXY(b) ? distanceM(a, b) : null;
  const domain = !!a.domain && a.domain === b.domain;
  const phone = !!a.phoneE164 && a.phoneE164 === b.phoneE164;
  const cityConflict = !!a.city && !!b.city && normalizeName(a.city) !== normalizeName(b.city);
  const proximity = dist === null ? 0 : dist <= 50 ? 1 : dist >= 300 ? 0 : (300 - dist) / 250;
  const score = Math.round((0.35 * name + 0.30 * proximity + 0.10 * (addr ?? 0) + 0.15 * (phone ? 1 : 0) + 0.10 * (domain ? 1 : 0)) * 1000) / 1000;

  const near = dist !== null && dist <= 100, close = dist !== null && dist <= 300;
  let level: MatchLevel = 'low';
  // Shared brand/domain alone never merges: chains share names and domains across branches, so location must agree.
  if (cityConflict && !(dist !== null && dist <= 200)) level = 'low';
  else if ((name >= 0.85 && near) || (phone && name >= 0.6 && (dist === null || close)) ||
    (domain && name >= 0.7 && dist !== null && dist <= 150) || (dist === null && name >= 0.85 && (addr ?? 0) >= 0.8)) level = 'high';
  else if ((name >= 0.6 && close) || phone || (domain && name >= 0.5 && (dist === null || close)) || (dist === null && name >= 0.85)) level = 'medium';
  return { score, level, signals: { name: Math.round(name * 100) / 100, address: addr === null ? null : Math.round(addr * 100) / 100, distanceM: dist === null ? null : Math.round(dist), domain, phone } };
}
