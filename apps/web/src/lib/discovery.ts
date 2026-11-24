export type Biz = {
  id: string; name: string; category: string | null; city: string | null; country_code: string | null; address: string | null;
  latitude: number | null; longitude: number | null; website_url: string | null; website_status: string; phone: string | null; email: string | null;
  rating: string | number | null; review_count: number | null; research_status: string; data_completeness: string | number | null;
  created_at: string; excluded: boolean; do_not_contact: boolean; lead_id: string | null; opportunity_score: number | null; sources: string[] | null;
};
export type Job = {
  id: string; status: string; total_tasks: number; completed_tasks: number; failed_tasks: number; businesses_found: number;
  error_details: null | { providers?: Record<string, { status: string; fetched?: number; error?: string }>; warnings?: string[];
    skipped?: { name: string; reason: string }[]; counts?: Record<string, number>; error?: string };
};
export type Provider = { name: string; label: string; requiresKey: boolean; configured: boolean; enabled: boolean; coverageNote: string };
export const TERMINAL = ['completed', 'partial', 'failed', 'cancelled'];

export type Filters = { websiteStatus: string[]; hasPhone: boolean; hasEmail: boolean; minRating: string; minReviewCount: string;
  researchStatus: string[]; provider: string[]; since: string };
export const emptyFilters: Filters = { websiteStatus: [], hasPhone: false, hasEmail: false, minRating: '', minReviewCount: '', researchStatus: [], provider: [], since: '' };
export type SearchForm = { categories: string[]; keywords: string; locations: string[]; radius: number; unit: 'km' | 'mi';
  providers: string[]; limit: number; autoResearch: boolean; filters: Filters };

export const WEB_OPTIONS = [['missing', 'No website found'], ['exists', 'Has website'], ['unknown', 'Website status unknown']] as const;
export const RESEARCH_OPTIONS = [['not_researched', 'Not researched'], ['queued', 'Queued'], ['researching', 'Researching'], ['completed', 'Completed'],
  ['partial', 'Partially completed'], ['failed', 'Failed'], ['needs_review', 'Needs review']] as const;
export const SINCE_OPTIONS = [['', 'Any time'], ['1', 'Last 24 hours'], ['7', 'Last 7 days'], ['30', 'Last 30 days']] as const;
const WEB_DB: Record<string, string[]> = { missing: ['none_found', 'unknown', 'verified_none'], exists: ['exists', 'redirects', 'inaccessible'], unknown: ['unknown'] };

export function resultsParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.websiteStatus.length) p.set('websiteStatus', [...new Set(f.websiteStatus.flatMap((s) => WEB_DB[s]))].join(','));
  if (f.hasPhone) p.set('hasPhone', 'true');
  if (f.hasEmail) p.set('hasEmail', 'true');
  if (f.minRating) p.set('minRating', f.minRating);
  if (f.minReviewCount) p.set('minReviewCount', f.minReviewCount);
  if (f.researchStatus.length) p.set('researchStatus', f.researchStatus.join(','));
  if (f.provider.length) p.set('provider', f.provider.join(','));
  if (f.since) p.set('since', new Date(Date.now() - Number(f.since) * 864e5).toISOString());
  return p;
}

export function buildPayload(f: SearchForm) {
  const km = Math.round((f.unit === 'mi' ? f.radius * 1.609344 : f.radius) * 10) / 10;
  const x = f.filters; const filters: Record<string, unknown> = {};
  if (x.websiteStatus.length) filters.websiteStatus = x.websiteStatus;
  if (x.minRating) filters.minRating = Number(x.minRating);
  if (x.minReviewCount) filters.minReviewCount = Number(x.minReviewCount);
  if (x.hasPhone) filters.hasPhone = true;
  if (x.hasEmail) filters.hasEmail = true;
  return {
    locations: f.locations.map((t) => t.trim()).filter(Boolean).map((query) => ({ query, radiusKm: km })),
    categories: f.categories, keywords: f.keywords.split(',').map((k) => k.trim()).filter(Boolean),
    filters, providers: f.providers, limit: f.limit, autoResearch: f.autoResearch,
  };
}

export type Chip = { id: string; label: string; clear: (f: Filters) => Filters };
export function chips(f: Filters): Chip[] {
  const out: Chip[] = [];
  const label = (list: readonly (readonly [string, string])[], v: string) => list.find(([k]) => k === v)?.[1] ?? v;
  for (const s of f.websiteStatus) out.push({ id: `w-${s}`, label: label(WEB_OPTIONS, s), clear: (x) => ({ ...x, websiteStatus: x.websiteStatus.filter((v) => v !== s) }) });
  if (f.minRating) out.push({ id: 'minr', label: `Rating ≥ ${f.minRating}`, clear: (x) => ({ ...x, minRating: '' }) });
  if (f.minReviewCount) out.push({ id: 'minrc', label: `Reviews ≥ ${f.minReviewCount}`, clear: (x) => ({ ...x, minReviewCount: '' }) });
  if (f.hasPhone) out.push({ id: 'ph', label: 'Phone available', clear: (x) => ({ ...x, hasPhone: false }) });
  if (f.hasEmail) out.push({ id: 'em', label: 'Email available', clear: (x) => ({ ...x, hasEmail: false }) });
  for (const s of f.researchStatus) out.push({ id: `r-${s}`, label: label(RESEARCH_OPTIONS, s), clear: (x) => ({ ...x, researchStatus: x.researchStatus.filter((v) => v !== s) }) });
  for (const s of f.provider) out.push({ id: `p-${s}`, label: `Source: ${s}`, clear: (x) => ({ ...x, provider: x.provider.filter((v) => v !== s) }) });
  if (f.since) out.push({ id: 'since', label: label(SINCE_OPTIONS, f.since), clear: (x) => ({ ...x, since: '' }) });
  return out;
}

export function summary(f: SearchForm, catLabels: Record<string, string>): string {
  const what = [...f.categories.map((c) => catLabels[c] ?? c), ...f.keywords.split(',').map((k) => k.trim()).filter(Boolean)].join(', ') || 'Businesses';
  const where = f.locations.map((l) => l.trim()).filter(Boolean).join(' / ');
  const parts = [where ? `${what} in ${where}` : what, ...chips(f.filters).filter((c) => !c.id.startsWith('r-') && !c.id.startsWith('p-') && c.id !== 'since').map((c) => c.label)];
  return parts.join(' · ') + '.';
}

export function safeHref(url: string | null): string | null {
  if (!url) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^https?:\/\//i.test(url)) return null; // non-http(s) scheme
  if (/^(javascript|data|vbscript|mailto|tel):/i.test(url)) return null;
  try { const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null; } catch { return null; }
}
