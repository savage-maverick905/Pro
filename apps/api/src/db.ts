import { randomUUID } from 'node:crypto';
import { MongoClient, type Collection, type Document } from 'mongodb';
import { resolveDbName } from './dburl.js';
import { env } from './env.js';

// The driver connects lazily on the first operation. ignoreUndefined mirrors the old JSON.stringify behaviour (undefined = "not set").
export const client = new MongoClient(env.MONGODB_URI, { ignoreUndefined: true, maxPoolSize: process.env.VERCEL ? 3 : 10, serverSelectionTimeoutMS: 15_000 });
export const db = client.db(resolveDbName(env.MONGODB_URI));
export const closeDb = () => client.close();

/** Typed loosely on purpose: documents keep the same snake_case fields the SQL tables had, with a string UUID as _id. */
export const col = (name: string): Collection<any> => db.collection(name);

export const newId = () => randomUUID();
export const now = () => new Date();
export const startOfTodayUtc = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

/** Row as the API returns it: _id becomes id. */
export function row<T extends Document | null | undefined>(d: T): any {
  if (!d) return d;
  const { _id, ...rest } = d as Document;
  return { id: _id, ...rest };
}
/** Pick fields, filling missing ones with null (SQL columns were always present). */
export function pick(d: Document | null | undefined, keys: string[], idAs = 'id'): any {
  const o: Record<string, unknown> = { [idAs]: d?._id };
  for (const k of keys) o[k] = d?.[k] ?? null;
  return o;
}

/** "insert ... on conflict do nothing": inserts only if no document matches the filter. Returns the new _id, or null when a match already existed. */
export async function insertIgnore(c: Collection<any>, filter: Document, doc: Document = {}): Promise<string | null> {
  const rest = Object.fromEntries(Object.entries(doc).filter(([k]) => !(k in filter) && k !== '_id'));
  const id = newId();
  try {
    const r = await c.updateOne(filter, { $setOnInsert: { _id: id, ...rest } }, { upsert: true });
    return r.upsertedCount > 0 ? id : null;
  } catch (e) { if (isDuplicateKey(e)) return null; throw e; }
}

/** SQL "order by x nulls last": Mongo puts nulls first on ascending sorts, so sort on an is-null flag first. */
export const nullsLastStages = (field: string, dir: 1 | -1): Document[] => [
  { $addFields: { _nl: { $cond: [{ $eq: [{ $ifNull: [`$${field}`, null] }, null] }, 1, 0] } } },
  { $sort: { _nl: 1, [field]: dir, _id: 1 } },
];
export const textCollation = { locale: 'en', strength: 2 } as const;

/** "coalesce(col, value)" for pipeline-style updates: keeps the existing value, otherwise uses the new one ($literal stops "$..." strings being read as paths). */
export const coalesce = (field: string, v: unknown): Document => ({ $ifNull: [`$${field}`, { $literal: v ?? null }] });

/** MongoDB field names cannot start with "$" (older servers also reject "."), and provider tags can contain either. */
export function safeKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(safeKeys) as unknown as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k.replace(/\./g, '_').replace(/^\$/, '_'), safeKeys(x)])) as T;
  }
  return v;
}

/** Settings live as { key, value } documents. Missing keys fall back to the caller's defaults. */
export async function getSetting<T = Record<string, any>>(key: string): Promise<T | undefined> {
  return (await col('settings').findOne({ key }))?.value as T | undefined;
}
/** Shallow-merges into the stored value (like jsonb `||`). */
export async function mergeSetting(key: string, patch: Record<string, unknown>) {
  const set = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined).map(([k, v]) => [`value.${k}`, v]));
  await col('settings').updateOne({ key }, { $set: { ...set, updated_at: now() }, $setOnInsert: { _id: newId() } }, { upsert: true });
}
export async function replaceSetting(key: string, value: Record<string, unknown>) {
  await col('settings').updateOne({ key }, { $set: { value, updated_at: now() }, $setOnInsert: { _id: newId() } }, { upsert: true });
}

/** New-document defaults (what the SQL column defaults used to provide). */
export const businessDefaults = (): Document => ({
  name: null, normalized_name: null, category: null, description: null, country: null, country_code: null, region: null, city: null, district: null,
  postal_code: null, address: null, latitude: null, longitude: null, website_url: null, normalized_domain: null, website_status: 'unknown',
  phone: null, phone_e164: null, email: null, rating: null, review_count: null, business_status: null, data_completeness: null,
  research_status: 'not_researched', excluded: false, do_not_contact: false, opportunity_score: null, opportunity_label: null,
  created_at: now(), updated_at: now(), last_verified_at: null,
});
export const jobDefaults = (): Document => ({
  status: 'pending', parameters: {}, total_tasks: 0, completed_tasks: 0, failed_tasks: 0, retry_count: 0, error_details: null, created_at: now(), updated_at: now(),
});
export async function addActivity(leadId: string, type: string, description: string | null, metadata: unknown = null) {
  await col('activities').insertOne({ _id: newId(), lead_id: leadId, activity_type: type, description, metadata, created_at: now() });
}
