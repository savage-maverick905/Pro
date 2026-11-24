import { closeDb } from '../db.js';
import { claimItem, getSettings, recoverStale, sweepQueued, type ResearchSettings } from './queue.js';
import { handle } from './tick.js';

const MAX_LOOPS = 5; let stopping = false; let inflight = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let cache: { at: number; v: ResearchSettings } | null = null;
async function settings() { if (cache && Date.now() - cache.at < 5000) return cache.v; cache = { at: Date.now(), v: await getSettings() }; return cache.v; }
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

async function loop(n: number) {
  while (!stopping) {
    try {
      const cfg = await settings();
      if (cfg.paused || n >= cfg.concurrency) { await sleep(3000); continue; }
      const item = await claimItem();
      if (!item) { await sleep(2000); continue; }
      inflight++; try { await handle(item, cfg); } finally { inflight--; }
    } catch (e) { log('loop error', e instanceof Error ? e.message : e); await sleep(5000); }
  }
}

async function sweeper() {
  while (!stopping) {
    try { const cfg = await settings(); const r = await recoverStale(); if (r) log('recovered stale items', r); if (!cfg.paused) { const q = await sweepQueued(cfg); if (q) log('queued', q, 'businesses'); } }
    catch (e) { log('sweep error', e instanceof Error ? e.message : e); }
    await sleep(10_000);
  }
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => {
  log('shutting down'); stopping = true;
  for (let i = 0; i < 30 && inflight > 0; i++) await sleep(1000); // let in-flight items finish; anything left is recovered as stale
  await closeDb(); process.exit(0);
});
log('research worker started');
await Promise.all([sweeper(), ...Array.from({ length: MAX_LOOPS }, (_, i) => loop(i))]);
