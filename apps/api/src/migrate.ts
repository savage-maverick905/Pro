import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { resolveDbName, resolveMongoUri } from './dburl.js';
import { DEFAULT_SERVICES, DEFAULT_SETTINGS } from './seed.js';

// Standalone on purpose: it runs during the Vercel build, so it must not require the full runtime env (session secret, etc.).
// MongoDB has no schema migrations: this creates indexes (idempotent) and inserts the default settings and services if missing.
const uri = resolveMongoUri();
if (!uri) { console.warn('MONGODB_URI is not set: skipping database setup.'); process.exit(0); }
const client = new MongoClient(uri, { ignoreUndefined: true, serverSelectionTimeoutMS: 20_000 });

type Idx = [Record<string, 1 | -1>, Record<string, unknown>?];
const INDEXES: Record<string, Idx[]> = {
  businesses: [[{ normalized_domain: 1 }], [{ country_code: 1, city: 1 }], [{ category: 1 }], [{ research_status: 1 }], [{ latitude: 1, longitude: 1 }], [{ normalized_name: 1 }],
    [{ phone_e164: 1 }, { partialFilterExpression: { phone_e164: { $type: 'string' } } }], [{ created_at: -1 }], [{ opportunity_score: 1 }, { partialFilterExpression: { opportunity_score: { $type: 'number' } } }]],
  business_sources: [[{ provider: 1, provider_record_id: 1 }, { unique: true }], [{ business_id: 1 }]],
  business_contacts: [[{ business_id: 1, contact_type: 1, normalized_value: 1 }, { unique: true }]],
  business_social_profiles: [[{ business_id: 1, platform: 1, profile_url: 1 }, { unique: true }]],
  services: [[{ name: 1 }, { unique: true }]],
  leads: [[{ business_id: 1 }, { unique: true }], [{ status: 1 }], [{ follow_up_at: 1 }]],
  activities: [[{ lead_id: 1, created_at: -1 }], [{ created_at: -1 }]],
  prospecting_jobs: [[{ job_type: 1, status: 1 }], [{ created_at: -1 }]],
  job_items: [[{ job_id: 1, business_id: 1 }, { unique: true }], [{ status: 1, next_attempt_at: 1 }], [{ job_id: 1, status: 1 }], [{ business_id: 1 }]],
  suppression_list: [[{ business_id: 1 }], [{ contact_value: 1 }]],
  saved_searches: [[{ created_at: -1 }]],
  provider_settings: [[{ provider_name: 1 }, { unique: true }]],
  settings: [[{ key: 1 }, { unique: true }]],
  duplicate_candidates: [[{ business_a: 1, business_b: 1 }, { unique: true }]],
  websites: [[{ business_id: 1, url: 1 }, { unique: true }]],
  website_audits: [[{ business_id: 1, created_at: -1 }]],
  research_reports: [[{ business_id: 1, created_at: -1 }]],
  research_evidence: [[{ report_id: 1 }]],
  opportunities: [[{ business_id: 1 }], [{ report_id: 1 }]],
  ai_usage: [[{ created_at: -1 }]],
  outreach_sequences: [[{ lead_id: 1, created_at: -1 }]],
  outreach_messages: [[{ sequence_id: 1, sequence_number: 1 }, { unique: true }]],
  message_versions: [[{ message_id: 1, created_at: -1 }]],
};

try {
  const db = client.db(resolveDbName(uri));
  for (const [name, list] of Object.entries(INDEXES))
    for (const [keys, opts] of list) await db.collection(name).createIndex(keys, opts ?? {});
  console.log('indexes ready');

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS))
    await db.collection('settings').updateOne({ key }, { $setOnInsert: { _id: randomUUID() as any, key, value, updated_at: new Date() } }, { upsert: true });
  for (const s of DEFAULT_SERVICES)
    await db.collection('services').updateOne({ name: s.name }, { $setOnInsert: { _id: randomUUID() as any, ...s, active: true } }, { upsert: true });
  console.log('defaults ready');
} catch (e) {
  console.error('FAILED', e);
  process.exit(1);
} finally {
  await client.close();
}
