import { col } from '../../db.js';
import type { ProviderAdapter } from '../types.js';
import { FoursquareAdapter } from './foursquare.js';
import { OverpassAdapter } from './overpass.js';

export const ADAPTERS: Record<string, ProviderAdapter> = {
  openstreetmap: new OverpassAdapter(),
  foursquare: new FoursquareAdapter(),
};

/** Usable = has credentials AND hasn't been switched off in provider_settings. */
export async function usableProviders(names: string[]) {
  const off = new Set((await col('provider_settings').find({ enabled: false }).toArray()).map((r) => r.provider_name as string));
  const usable: ProviderAdapter[] = []; const skipped: { name: string; reason: string }[] = [];
  for (const n of names) {
    const a = ADAPTERS[n];
    if (!a) skipped.push({ name: n, reason: 'Unknown provider' });
    else if (!a.isConfigured()) skipped.push({ name: n, reason: 'Not configured (missing API key)' });
    else if (off.has(n)) skipped.push({ name: n, reason: 'Disabled in settings' });
    else usable.push(a);
  }
  return { usable, skipped };
}
