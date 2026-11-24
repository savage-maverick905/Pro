// On Vercel the API is served from the same origin (/api/*), so no URL is needed. Set VITE_API_URL only if the API lives elsewhere.
const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:4000');

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export type Envelope<T> = { data: T; meta?: { page: number; pageSize: number; total: number } };

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<Envelope<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Prospectos': '1' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  if (res.status === 204) return { data: undefined as T };
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'error', json?.error?.message ?? 'Request failed');
  return json as Envelope<T>;
}
