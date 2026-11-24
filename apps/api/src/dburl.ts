/**
 * Finds the MongoDB connection string. Uses MONGODB_URI when set; otherwise falls back to DATABASE_URL (if it is a mongodb:// URL)
 * or to any env var holding a mongodb:// or mongodb+srv:// URL (e.g. the ones Vercel's MongoDB Atlas integration creates).
 */
const isMongo = (v: string | undefined): v is string => !!v && /^mongodb(\+srv)?:\/\//i.test(v);

export function resolveMongoUri(e: NodeJS.ProcessEnv = process.env): string | undefined {
  if (isMongo(e.MONGODB_URI)) return e.MONGODB_URI;
  if (isMongo(e.DATABASE_URL)) return e.DATABASE_URL;
  const k = Object.keys(e).find((k) => /(MONGO|DATABASE).*URI$|(MONGO|DATABASE).*URL$/i.test(k) && isMongo(e[k]));
  return k ? e[k] : undefined;
}

/** Database name: MONGODB_DB, else the one in the URI path, else "prospectos". */
export function resolveDbName(uri: string, e: NodeJS.ProcessEnv = process.env): string {
  if (e.MONGODB_DB) return e.MONGODB_DB;
  try { const p = new URL(uri).pathname.replace(/^\//, ''); if (p) return decodeURIComponent(p); } catch { /* fall through */ }
  return 'prospectos';
}
