export type WebsiteStatus = 'exists' | 'none_found' | 'unknown';
export interface Area { label: string; lat: number; lon: number; radiusM: number; countryCode?: string }
export interface DiscoveryQuery { areas: Area[]; categories: string[]; keywords: string[]; limit: number }
export interface NormalizedPlace {
  provider: string; providerRecordId: string; sourceUrl?: string; attribution: string;
  name: string; category?: string; address?: string; city?: string; region?: string; postalCode?: string;
  country?: string; countryCode?: string; lat?: number; lon?: number;
  website?: string; websiteStatus: WebsiteStatus; phone?: string; email?: string;
  rating?: number; reviewCount?: number; raw: unknown;
}
export interface SearchResult { places: NormalizedPlace[]; warnings: string[] }
export interface ProviderAdapter {
  readonly name: string; readonly label: string; readonly requiresKey: boolean;
  readonly coverageNote: string; readonly attribution: string;
  isConfigured(): boolean;
  search(q: DiscoveryQuery, signal: AbortSignal): Promise<SearchResult>;
  test(signal: AbortSignal): Promise<string>;
}
export class ProviderError extends Error {
  constructor(public provider: string, message: string, public retryable = false) { super(message); }
}
