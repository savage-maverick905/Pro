# Architecture

```
apps/web (React, Vite)  --HTTPS/cookie-->  apps/api (Fastify)  --driver-->  MongoDB
                                                 ^                            ^
                                   apps/api worker process  ---- atomic job queue
                                   (research + AI analysis)
```

- **API** (`apps/api/src/server.ts`): REST, Zod validation, owner-only session cookie, rate limiting.
- **Worker** (`src/worker`): separate process; claims `job_items` with an atomic `findOneAndUpdate`, retries with exponential backoff, recovers items left running by a crash, honours the pause and concurrency settings. Research reports younger than the freshness window are reused.
- **Discovery** (`src/discovery`): provider adapters implement one interface; searches run in parallel with partial-success handling; results are normalised, matched by a weighted score (domain, phone, name, address, distance) and merged only at high confidence. Discovery jobs currently run inside the API process (idempotent, re-queued on restart); only research uses the worker.
- **Research** (`src/research`): SSRF-safe fetch (validated at connect time, every redirect re-validated, size/time/type limits), robots.txt respected, static HTML parsing (no JavaScript executed), identity check before attributing findings, evidence rows classified verified, inferred or unknown.
- **AI** (`src/ai`): provider interface (Groq implemented), JSON mode plus Zod validation with one corrective retry, then code-level guards that downgrade or remove claims unsupported by cited evidence. Only structured facts and a short delimited snippet of website text reach the model.
- **Scoring** (`src/scoring`): deterministic, six weighted components, each with an explanation. Missing evidence earns partial credit, never full.
- **Outreach** (`src/outreach`): generation requires a research report; safety rules reject invented figures, claims of personal activity, guarantees and hype; suppression is checked before generating and before marking sent. Nothing is ever sent.

Everything provider-specific is behind an interface so providers can be swapped or added.
