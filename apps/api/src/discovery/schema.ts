import { z } from 'zod';

export const LocationSchema = z.object({
  country: z.string().trim().max(100).optional(), state: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(), district: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(), query: z.string().trim().max(200).optional(),
  lat: z.number().min(-90).max(90).optional(), lon: z.number().min(-180).max(180).optional(),
  radiusKm: z.number().min(0.1).max(50).default(10),
}).refine((l) => (l.lat !== undefined && l.lon !== undefined) || l.query || l.country || l.state || l.city || l.district || l.postalCode,
  'Provide a place name or coordinates');

export const DiscoverySearch = z.object({
  location: LocationSchema.optional(),
  locations: z.array(LocationSchema).min(1).max(10).optional(),
  categories: z.array(z.string().trim().min(1).max(50)).max(10).default([]),
  keywords: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  filters: z.object({
    websiteStatus: z.array(z.enum(['missing', 'exists', 'unknown'])).optional(),
    minRating: z.number().min(0).max(5).optional(), maxRating: z.number().min(0).max(5).optional(),
    minReviewCount: z.number().int().min(0).optional(), maxReviewCount: z.number().int().min(0).optional(),
    hasPhone: z.boolean().optional(), hasEmail: z.boolean().optional(),
    opportunityMin: z.number().min(0).max(100).optional(), // applies after research, not at discovery time
  }).default({}),
  providers: z.array(z.enum(['openstreetmap', 'foursquare'])).min(1).default(['openstreetmap']),
  limit: z.number().int().min(1).max(500).default(100),
  autoResearch: z.boolean().default(true),
}).refine((s) => s.location || s.locations?.length, 'At least one location is required: provider APIs cannot search "worldwide" in one query')
  .refine((s) => s.categories.length > 0 || s.keywords.length > 0, 'Provide at least one category or keyword');
export type DiscoveryParams = z.infer<typeof DiscoverySearch>;
export type LocationInput = z.infer<typeof LocationSchema>;
