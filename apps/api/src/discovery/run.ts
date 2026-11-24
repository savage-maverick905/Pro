import { waitUntil } from '@vercel/functions';
import { col, insertIgnore, now } from '../db.js';
import { ingestPlace } from './ingest.js';
import { resolveArea } from './geocode.js';
import { usableProviders } from './providers/index.js';
import { DiscoverySearch, type DiscoveryParams } from './schema.js';
import type { Area, DiscoveryQuery, NormalizedPlace } from './types.js';

const WEB_MAP = { missing: ['none_found', 'unknown'], exists: ['exists'], unknown: ['unknown'] } as const;

/** Provider-side filtering. Missing data is never treated as a negative: unknown ratings/counts pass. */
export function passesFilters(p: NormalizedPlace, f: DiscoveryParams['filters']): boolean {
  if (f.websiteStatus?.length && !f.websiteStatus.some((s) => (WEB_MAP[s] as readonly string[]).includes(p.websiteStatus))) return false;
  if (p.rating !== undefined && ((f.minRating !== undefined && p.rating < f.minRating) || (f.maxRating !== undefined && p.rating > f.maxRating))) return false;
  if (p.reviewCount !== undefined && ((f.minReviewCount !== undefined && p.reviewCount < f.minReviewCount) || (f.maxReviewCount !== undefined && p.reviewCount > f.maxReviewCount))) return false;
  if (f.hasPhone && !p.phone) return false;
  if (f.hasEmail && !p.email) return false;
  return true;
}

const status = async (id: string) => (await col('prospecting_jobs').findOne({ _id: id }, { projection: { status: 1 } }))?.status as string | undefined;
const setJob = (id: string, patch: Record<string, unknown>) => col('prospecting_jobs').updateOne({ _id: id }, { $set: { ...patch, updated_at: now() } });

/** Idempotent: re-running a job re-uses existing provider records, so resume/recovery is safe. */
export async function runDiscovery(jobId: string): Promise<void> {
  const job = await col('prospecting_jobs').findOneAndUpdate({ _id: jobId, status: 'pending' }, { $set: { status: 'running', updated_at: now() } }, { returnDocument: 'after' });
  if (!job) return;
  const detail: { providers: Record<string, unknown>; warnings: string[]; skipped: unknown[]; counts: Record<string, number> } = { providers: {}, warnings: [], skipped: [], counts: { created: 0, merged: 0, existing: 0, review: 0 } };
  try {
    const params = DiscoverySearch.parse(job.parameters);
    const { usable, skipped } = await usableProviders(params.providers);
    detail.skipped = skipped;
    await setJob(jobId, { total_tasks: usable.length });
    if (!usable.length) throw new Error('No requested provider is usable: ' + skipped.map((s) => `${s.name} (${s.reason})`).join(', '));

    const ctl = new AbortController();
    const areas: Area[] = [];
    for (const l of params.locations ?? (params.location ? [params.location] : [])) {
      try { areas.push(await resolveArea(l, ctl.signal)); } catch (e) { detail.warnings.push(e instanceof Error ? e.message : 'Geocoding failed'); }
    }
    if (!areas.length) throw new Error('None of the locations could be resolved');
    if ((await status(jobId)) !== 'running') return;

    const q: DiscoveryQuery = { areas, categories: params.categories, keywords: params.keywords, limit: params.limit };
    const collected: NormalizedPlace[] = []; let ok = 0, failed = 0;
    await Promise.all(usable.map(async (a) => {
      try {
        const r = await a.search(q, ctl.signal);
        collected.push(...r.places.slice(0, params.limit)); detail.warnings.push(...r.warnings.map((w) => `${a.name}: ${w}`));
        detail.providers[a.name] = { status: 'ok', fetched: r.places.length }; ok++;
        await setJob(jobId, { completed_tasks: ok });
      } catch (e) {
        failed++; detail.providers[a.name] = { status: 'failed', error: e instanceof Error ? e.message : 'Unknown error' };
        await setJob(jobId, { failed_tasks: failed });
      }
    }));

    for (const p of collected.filter((x) => passesFilters(x, params.filters))) {
      if ((await status(jobId)) !== 'running') return; // paused or cancelled: stop at a safe checkpoint
      const r = await ingestPlace(p, params.autoResearch);
      detail.counts[r.outcome]++;
      if (!r.excluded) await insertIgnore(col('job_items'), { job_id: jobId, business_id: r.businessId },
        { status: 'completed', retry_count: 0, next_attempt_at: null, error_message: null, started_at: null, completed_at: now() });
    }
    const final = ok === 0 ? 'failed' : failed > 0 || detail.warnings.length ? 'partial' : 'completed';
    await setJob(jobId, { status: final, error_details: detail });
  } catch (e) {
    await setJob(jobId, { status: 'failed', error_details: { ...detail, error: e instanceof Error ? e.message : 'Unknown error' } });
  }
}

/** On Vercel the function is frozen once the response is sent, so waitUntil keeps it alive until the job finishes. */
export const kick = (jobId: string, log: (e: unknown) => void) => { const p = runDiscovery(jobId).catch(log); try { waitUntil(p); } catch { /* not on Vercel */ } };

/** On boot, any job still marked running was interrupted by a restart: re-queue it. */
export async function recoverDiscoveryJobs(log: (e: unknown) => void) {
  const ids = (await col('prospecting_jobs').find({ job_type: 'discovery', status: 'running' }, { projection: { _id: 1 } }).toArray()).map((x) => x._id as string);
  if (!ids.length) return;
  await col('prospecting_jobs').updateMany({ _id: { $in: ids } }, { $set: { status: 'pending' }, $inc: { retry_count: 1 } });
  for (const id of ids) kick(id, log);
}
