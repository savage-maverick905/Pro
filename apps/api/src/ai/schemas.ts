import { z } from 'zod';

export const Classification = z.enum(['verified', 'inferred', 'unknown']);
export const AnalysisSchema = z.object({
  summary: z.string().trim().min(1).max(900),
  findings: z.array(z.object({ claim: z.string().trim().min(1).max(300), classification: Classification, evidence: z.array(z.string()).max(8).default([]), reasoning: z.string().max(400).optional() })).max(20),
  opportunities: z.array(z.object({ service: z.string(), problem: z.string().trim().min(1).max(300), solution: z.string().trim().min(1).max(400),
    priority: z.coerce.number().int().min(1).max(5), confidence: z.coerce.number().min(0).max(1), evidence: z.array(z.string()).max(8).default([]) })).max(8),
  unknown: z.array(z.string().max(300)).max(10).default([]),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
