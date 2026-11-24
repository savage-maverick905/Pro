import { normalizeName } from '../lib/normalize.js';
import type { Page } from './html.js';

const STOP = new Set(['the', 'and', 'of', 'ltd', 'llc', 'inc', 'co', 'company', 'limited', 'restaurant', 'cafe', 'bar', 'hotel', 'shop', 'store', 'salon', 'clinic', 'dental', 'studio', 'gym', 'services', 'group']);
export type IdentityLevel = 'verified' | 'likely' | 'unverified';
export interface IdentityResult { score: number; level: IdentityLevel; signals: string[] }

/** Decides whether a website plausibly belongs to the business. Never trust a URL just because it was listed or ranked first. */
export function scoreIdentity(b: { name: string; city?: string | null; phone?: string | null }, page: Page, finalUrl: string, listedBySource: boolean): IdentityResult {
  const signals: string[] = []; let score = 0;
  const all = normalizeName(b.name).split(' ').filter(Boolean);
  const tokens = all.filter((t) => t.length >= 3 && !STOP.has(t)); const use = tokens.length ? tokens : all;
  const label = normalizeName(new URL(finalUrl).hostname.replace(/^www\./, '').split('.').slice(0, -1).join(' '));
  const head = normalizeName([page.title ?? '', page.meta['og:site_name'] ?? '', ...page.headings.filter((h) => h.level <= 2).map((h) => h.text), label, page.text.slice(0, 3000)].join(' '));
  if (use.length) {
    const frac = use.filter((t) => head.includes(t)).length / use.length;
    score += 0.4 * frac; if (frac > 0) signals.push(`${Math.round(frac * 100)}% of name words appear on the site`);
  }
  if (listedBySource) { score += 0.3; signals.push('Website URL was listed by a data provider'); }
  const city = b.city ? normalizeName(b.city) : '';
  if (city && normalizeName(page.text).includes(city)) { score += 0.1; signals.push(`City "${b.city}" mentioned`); }
  const last8 = (b.phone ?? '').replace(/\D/g, '').slice(-8);
  if (last8.length === 8 && page.text.replace(/\D/g, '').includes(last8)) { score += 0.2; signals.push('Business phone number appears on the site'); }
  score = Math.round(Math.min(1, score) * 100) / 100;
  return { score, level: score >= 0.7 ? 'verified' : score >= 0.4 ? 'likely' : 'unverified', signals };
}
