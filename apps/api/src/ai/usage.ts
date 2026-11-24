import { col, newId, now } from '../db.js';
import { getAiSettings, getProvider, tokensUsedToday } from './analyze.js';
import type { LLMProvider, Usage } from './types.js';

export class AiUnavailable extends Error {}
/** Single gate for every AI call: configured, switched on, and under the daily token limit. */
export async function requireProvider(): Promise<LLMProvider> {
  const cfg = await getAiSettings(); const p = getProvider();
  if (!cfg.enabled) throw new AiUnavailable('AI features are switched off in Settings');
  if (!p) throw new AiUnavailable('GROQ_API_KEY is not set');
  if ((await tokensUsedToday()) >= cfg.dailyTokenLimit) throw new AiUnavailable('The daily AI token limit has been reached');
  return p;
}
export const recorder = (p: LLMProvider, operation: string, businessId: string | null) => async (u: Usage, ok: boolean) => {
  await col('ai_usage').insertOne({ _id: newId(), provider: p.name, model: p.model, operation, business_id: businessId, input_tokens: u.inputTokens, output_tokens: u.outputTokens, estimated_cost: null, success: ok, created_at: now() });
};
