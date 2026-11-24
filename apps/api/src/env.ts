import 'dotenv/config';
import { z } from 'zod';
import { resolveMongoUri } from './dburl.js';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  FRONTEND_URL: z.string().url().optional(), // only needed when the web app is on a different origin than the API
  CRON_SECRET: z.string().optional(),
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//i, 'must start with mongodb:// or mongodb+srv://'),
  MONGODB_DB: z.string().optional(),
  OWNER_EMAIL: z.string().email(),
  OWNER_PASSWORD_HASH: z.string().regex(/^[0-9a-f]{32}:[0-9a-f]{128}$/, 'generate with: npm run hash-password -w apps/api'),
  SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
  // Optional: features degrade gracefully when unset
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  FOURSQUARE_API_KEY: z.string().optional(),
  GOOGLE_PAGESPEED_API_KEY: z.string().optional(),
});

process.env.MONGODB_URI ||= resolveMongoUri();
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const i of parsed.error.issues) console.error(` - ${i.path.join('.')}: ${i.message}`);
  process.exit(1);
}
export const env = parsed.data;
