import { fetchTimeout, throttle } from '../lib/throttle.js';
import { validateUrl } from './net.js';

export interface PsiResult { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null; labMetrics: Record<string, number | null>; fieldData: Record<string, number | null> | null; fetchedAt: string }
const score = (v: unknown) => (typeof v === 'number' ? Math.round(v * 100) : null);
const num = (v: unknown) => (typeof v === 'number' ? v : null);

/** Google PageSpeed Insights v5. Only real returned values are stored; anything missing stays null. */
export async function runPageSpeed(url: string, apiKey: string, signal?: AbortSignal): Promise<PsiResult> {
  const target = validateUrl(url).href; // never forward internal addresses
  const q = new URLSearchParams({ url: target, strategy: 'mobile', key: apiKey });
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) q.append('category', c);
  await throttle('pagespeed', 1500);
  const res = await fetchTimeout(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { headers: { Accept: 'application/json' } }, 70_000, signal);
  if (res.status === 429) throw new Error('PageSpeed quota exceeded; try again later');
  if (res.status === 400 || res.status === 403) throw new Error(`PageSpeed rejected the request (HTTP ${res.status}); check GOOGLE_PAGESPEED_API_KEY and that the API is enabled`);
  if (!res.ok) throw new Error(`PageSpeed returned HTTP ${res.status}`);
  const j = (await res.json()) as { lighthouseResult?: { categories?: Record<string, { score?: number }>; audits?: Record<string, { numericValue?: number }> }; loadingExperience?: { metrics?: Record<string, { percentile?: number }> } };
  const c = j.lighthouseResult?.categories ?? {}; const a = j.lighthouseResult?.audits ?? {}; const f = j.loadingExperience?.metrics;
  return { performance: score(c.performance?.score), accessibility: score(c.accessibility?.score), bestPractices: score(c['best-practices']?.score), seo: score(c.seo?.score),
    labMetrics: { fcpMs: num(a['first-contentful-paint']?.numericValue), lcpMs: num(a['largest-contentful-paint']?.numericValue), cls: num(a['cumulative-layout-shift']?.numericValue), tbtMs: num(a['total-blocking-time']?.numericValue) },
    fieldData: f ? { lcpMs: num(f.LARGEST_CONTENTFUL_PAINT_MS?.percentile), cls: num(f.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile), inpMs: num(f.INTERACTION_TO_NEXT_PAINT?.percentile) } : null, fetchedAt: new Date().toISOString() };
}
