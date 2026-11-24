const chains = new Map<string, Promise<void>>();
/** Serialises calls per key and enforces a minimum gap between them (provider fair-use limits). */
export function throttle(key: string, minMs: number): Promise<void> {
  const prev = chains.get(key) ?? Promise.resolve();
  chains.set(key, prev.then(() => new Promise<void>((r) => setTimeout(r, minMs))));
  return prev;
}
export const fetchTimeout = (url: string, init: RequestInit, ms: number, outer?: AbortSignal) =>
  fetch(url, { ...init, signal: outer ? AbortSignal.any([outer, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms) });
