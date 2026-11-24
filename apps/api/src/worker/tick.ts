import { analyzeBusiness } from '../ai/analyze.js';
import { col } from '../db.js';
import { PermanentError, researchBusiness } from '../research/pipeline.js';
import { claimItem, completeItem, failItem, getSettings, recoverStale, sweepQueued, type Item, type ResearchSettings } from './queue.js';

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function freshReport(businessId: string, days: number) {
  const r = (await col('research_reports').find({ business_id: businessId, status: { $in: ['partial', 'completed', 'needs_review'] }, created_at: { $gt: new Date(Date.now() - days * 864e5) } },
    { projection: { model: 1 } }).sort({ created_at: -1 }).limit(1).toArray())[0];
  return r ? { id: r._id as string, model: (r.model ?? null) as string | null } : undefined;
}

/** Processes one queued research item. Shared by the long-running worker and the serverless tick. */
export async function handle(item: Item, cfg: ResearchSettings) {
  const p = item.params ?? {};
  const depth = p.depth === 'deep' || p.depth === 'fast' ? p.depth : cfg.depth;
  try {
    const fresh = p.force ? undefined : await freshReport(item.business_id, cfg.freshnessDays); // reuse recent reports instead of re-crawling
    if (!fresh) { const r = await researchBusiness(item.business_id, { depth }); log('researched', item.business_id, r.status); }
    if (!fresh || !fresh.model) { const a = await analyzeBusiness(item.business_id, { depth }); log('analysis', item.business_id, a.status, a.reason ?? `${a.score} ${a.label}`); } // a retry after an AI outage skips the crawl and only redoes the analysis
    await completeItem(item, !!fresh);
  } catch (e) {
    log('research failed', item.business_id, e instanceof Error ? e.message : e);
    await failItem(item, e, e instanceof PermanentError);
  }
}

/**
 * Serverless worker: a Vercel function cannot run a background loop, so the web app (and an optional daily cron)
 * calls this. It recovers stale items, queues discovered businesses, then works items until the time budget is used.
 * Safe to call concurrently: claimItem claims atomically.
 */
export async function runTick(budgetMs = 25_000) {
  const started = Date.now();
  const cfg = await getSettings();
  if (cfg.paused) return { processed: 0, paused: true };
  await recoverStale();
  await sweepQueued(cfg);
  let processed = 0;
  const lane = async () => {
    while (Date.now() - started < budgetMs) {
      const item = await claimItem();
      if (!item) return;
      await handle(item, cfg); processed++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, cfg.concurrency) }, lane));
  return { processed, paused: false };
}
