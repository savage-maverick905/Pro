import type { z } from 'zod';
import { AIValidationError, type LLMProvider, type Usage } from './types.js';

export function extractJson(text: string): unknown {
  let t = text.trim(); const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t); if (fence) t = fence[1];
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s === -1 || e <= s) throw new Error('No JSON object found');
  return JSON.parse(t.slice(s, e + 1));
}

/** Calls the model, validates with Zod, and on failure retries once with the validation error. Model output is never trusted unvalidated. */
export async function generateStructured<S extends z.ZodTypeAny>(p: LLMProvider, schema: S,
  i: { system: string; user: string; maxTokens: number; signal?: AbortSignal; onUsage?: (u: Usage, ok: boolean) => Promise<void> | void }, attempts = 2) {
  type T = z.output<S>;
  let user = i.user; let lastErr = '';
  for (let a = 0; a < attempts; a++) {
    const out = await p.complete({ system: i.system, user, maxTokens: i.maxTokens, signal: i.signal });
    let parsed: unknown; let value: T | undefined; let err: string | null = null;
    try {
      parsed = extractJson(out.text); const r = schema.safeParse(parsed);
      if (r.success) value = r.data; else err = r.error.issues.slice(0, 6).map((x) => `${x.path.join('.')}: ${x.message}`).join('; ');
    } catch (e) { err = e instanceof Error ? e.message : 'invalid JSON'; }
    await i.onUsage?.(out.usage, err === null);
    if (err === null) return { value: value as T, raw: parsed, usage: out.usage, model: out.model };
    lastErr = err; user = `${i.user}\n\nYour previous reply was rejected: ${err}\nReply again with ONLY one valid JSON object that follows the schema.`;
  }
  throw new AIValidationError(`AI output failed validation: ${lastErr}`);
}
