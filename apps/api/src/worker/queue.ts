import { col, getSetting, jobDefaults, newId, now } from '../db.js';

export const MAX_RETRIES = 3;
export interface ResearchSettings { paused: boolean; concurrency: number; depth: 'fast' | 'deep'; freshnessDays: number; maxPerSweep: number }
const DEFAULTS: ResearchSettings = { paused: false, concurrency: 2, depth: 'fast', freshnessDays: 30, maxPerSweep: 50 };
export interface Item { id: string; job_id: string; business_id: string; retry_count: number; params: { depth?: string; force?: boolean } | null }

export async function getSettings(): Promise<ResearchSettings> {
  const v = { ...DEFAULTS, ...((await getSetting('research')) ?? {}) } as ResearchSettings;
  return { ...v, concurrency: Math.min(5, Math.max(1, Math.round(v.concurrency))) };
}

export async function createResearchJob(ids: string[], o: { depth: 'fast' | 'deep'; force: boolean }) {
  const unique = [...new Set(ids)];
  const jobId = newId();
  await col('prospecting_jobs').insertOne({ ...jobDefaults(), _id: jobId, job_type: 'research', status: 'running', parameters: o });
  const existing = (await col('businesses').find({ _id: { $in: unique } }, { projection: { _id: 1 } }).toArray()).map((x) => x._id as string);
  if (existing.length) await col('job_items').insertMany(existing.map((business_id) => ({ _id: newId(), job_id: jobId, business_id, status: 'pending', retry_count: 0,
    next_attempt_at: null, error_message: null, started_at: null, completed_at: null })), { ordered: false });
  const n = existing.length;
  await col('prospecting_jobs').updateOne({ _id: jobId }, { $set: { total_tasks: n, ...(n === 0 ? { status: 'completed' } : {}), updated_at: now() } });
  if (unique.length) await col('businesses').updateMany({ _id: { $in: unique }, research_status: { $ne: 'researching' } }, { $set: { research_status: 'queued', updated_at: now() } });
  return { jobId, count: n };
}

/** Businesses marked "queued" by discovery get picked up here, bounded by the per-sweep budget. */
export async function sweepQueued(s: ResearchSettings) {
  const activeJobs = (await col('prospecting_jobs').find({ job_type: 'research', status: { $in: ['running', 'paused'] } }, { projection: { _id: 1 } }).toArray()).map((j) => j._id as string);
  const busy = activeJobs.length ? await col('job_items').distinct('business_id', { job_id: { $in: activeJobs }, status: { $in: ['pending', 'running'] } }) : [];
  const rows = await col('businesses').find({ research_status: 'queued', ...(busy.length ? { _id: { $nin: busy } } : {}) }, { projection: { _id: 1 } }).sort({ created_at: 1 }).limit(s.maxPerSweep).toArray();
  if (rows.length) await createResearchJob(rows.map((x) => x._id as string), { depth: s.depth, force: false });
  return rows.length;
}

/** findOneAndUpdate is atomic, so several workers can pull from the same collection without being handed the same item twice. */
export async function claimItem(): Promise<Item | null> {
  const running = (await col('prospecting_jobs').find({ job_type: 'research', status: 'running' }, { projection: { _id: 1, parameters: 1 } }).toArray());
  if (!running.length) return null;
  const t = now();
  const it = await col('job_items').findOneAndUpdate(
    { status: 'pending', job_id: { $in: running.map((j) => j._id) }, $or: [{ next_attempt_at: null }, { next_attempt_at: { $lte: t } }] },
    { $set: { status: 'running', started_at: t } }, { sort: { next_attempt_at: 1, _id: 1 }, returnDocument: 'after' });
  if (!it) return null;
  return { id: it._id, job_id: it.job_id, business_id: it.business_id, retry_count: it.retry_count, params: running.find((j) => j._id === it.job_id)?.parameters ?? null };
}

export async function refreshJob(jobId: string) {
  const g = await col('job_items').aggregate([{ $match: { job_id: jobId } }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray();
  const n = (s: string) => g.find((x) => x._id === s)?.n ?? 0;
  const done = n('completed'), failed = n('failed'), open = n('pending') + n('running');
  await col('prospecting_jobs').updateOne({ _id: jobId }, { $set: { completed_tasks: done, failed_tasks: failed, updated_at: now() } });
  if (open === 0) await col('prospecting_jobs').updateOne({ _id: jobId, status: 'running' }, { $set: { status: failed === 0 ? 'completed' : done === 0 ? 'failed' : 'partial' } });
}

export async function completeItem(item: Item, reusedFreshReport = false) {
  await col('job_items').updateOne({ _id: item.id }, { $set: { status: 'completed', completed_at: now(), error_message: null } });
  if (reusedFreshReport) {
    const rep = (await col('research_reports').find({ business_id: item.business_id }, { projection: { status: 1 } }).sort({ created_at: -1 }).limit(1).toArray())[0];
    await col('businesses').updateOne({ _id: item.business_id, research_status: 'queued' }, { $set: { research_status: rep?.status ?? 'partial' } });
  }
  await refreshJob(item.job_id);
}

/** Retries use exponential backoff with jitter (30s, 60s, 120s, ...) up to MAX_RETRIES; permanent errors fail immediately. */
export async function failItem(item: Item, err: unknown, permanent: boolean) {
  const msg = (err instanceof Error ? err.message : 'Unknown error').slice(0, 500);
  if (!permanent && item.retry_count < MAX_RETRIES) {
    const secs = Math.round(30 * 2 ** item.retry_count * (0.8 + Math.random() * 0.4));
    await col('job_items').updateOne({ _id: item.id }, { $set: { status: 'pending', next_attempt_at: new Date(Date.now() + secs * 1000), error_message: msg, started_at: null }, $inc: { retry_count: 1 } });
    await col('businesses').updateOne({ _id: item.business_id }, { $set: { research_status: 'queued' } });
  } else {
    await col('job_items').updateOne({ _id: item.id }, { $set: { status: 'failed', completed_at: now(), error_message: msg } });
    await col('businesses').updateOne({ _id: item.business_id }, { $set: { research_status: 'failed', updated_at: now() } });
  }
  await refreshJob(item.job_id);
}

/** Items left "running" by a crashed worker are retried, and count toward the retry limit so a poison item cannot loop forever. */
export async function recoverStale() {
  const stale = await col('job_items').find({ status: 'running', started_at: { $lt: new Date(Date.now() - 10 * 60_000) } }).toArray();
  let n = 0;
  for (const it of stale) {
    const status = it.retry_count + 1 > MAX_RETRIES ? 'failed' : 'pending';
    const r = await col('job_items').updateOne({ _id: it._id, status: 'running', started_at: it.started_at },
      { $set: { status, error_message: 'Worker stopped while processing', started_at: null }, $inc: { retry_count: 1 } });
    if (!r.modifiedCount) continue; // another worker got there first
    n++;
    await col('businesses').updateOne({ _id: it.business_id, research_status: 'researching' }, { $set: { research_status: status === 'failed' ? 'failed' : 'queued' } });
    await refreshJob(it.job_id);
  }
  return n;
}
