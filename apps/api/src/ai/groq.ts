import { LLMError, type CompleteInput, type CompleteOutput, type LLMProvider } from './types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Groq's OpenAI-compatible chat completions API. Uses JSON mode (works on every model); Zod validation is the real contract,
 *  because strict json_schema support varies by model. */
export class GroqProvider implements LLMProvider {
  readonly name = 'groq'; readonly model: string; private key: string; private base: string;
  constructor(o: { apiKey: string; model: string; baseUrl?: string }) { this.key = o.apiKey; this.model = o.model; this.base = o.baseUrl ?? 'https://api.groq.com/openai/v1'; }

  async complete(i: CompleteInput): Promise<CompleteOutput> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.base}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, temperature: i.temperature ?? 0.2, max_completion_tokens: i.maxTokens, response_format: { type: 'json_object' },
            messages: [{ role: 'system', content: i.system }, { role: 'user', content: i.user }] }),
          signal: i.signal ? AbortSignal.any([i.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
      } catch { if (attempt < 2) { await sleep(1500 * 2 ** attempt); continue; } throw new LLMError('Could not reach Groq (network or timeout)', true); }
      if (res.status === 429 || res.status >= 500) {
        if (attempt < 2) { const ra = Number(res.headers.get('retry-after')); await sleep(Number.isFinite(ra) ? Math.min(20, ra) * 1000 : 1500 * 2 ** attempt); continue; }
        throw new LLMError(`Groq is unavailable or rate limited (HTTP ${res.status})`, true);
      }
      if (res.status === 401 || res.status === 403) throw new LLMError('Groq rejected the API key (check GROQ_API_KEY)', false);
      if (!res.ok) { const t = await res.text().catch(() => ''); throw new LLMError(`Groq request failed (HTTP ${res.status}): ${t.slice(0, 200)}`, false); }
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
      const text = j.choices?.[0]?.message?.content;
      if (!text) throw new LLMError('Groq returned an empty response', true);
      return { text, model: j.model ?? this.model, usage: { inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 } };
    }
  }
}
