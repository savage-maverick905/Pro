import { hasUnsupportedClaim } from '../ai/guard.js';

export const CHANNELS = ['email', 'whatsapp', 'instagram', 'linkedin'] as const;
export const TONES = ['professional', 'friendly', 'conversational', 'persuasive', 'direct'] as const;
export const APPROACHES = ['problem_first', 'opportunity_first', 'website_audit', 'service_specific'] as const;
export const LENGTHS = ['short', 'medium', 'detailed'] as const;
export const MAX_CHARS = { short: 500, medium: 1000, detailed: 1800 } as const;

const PERSONAL = /\bI(?:'ve| have)?\s+(?:personally\s+)?(?:visited|eaten|tried|tested|stayed|used|bought|ordered|phoned|spoke|talked|watched|walked|read your reviews)\b|\bwhen I (?:visited|stopped by|came by)\b/i;
const HYPE = /\bguarantee[ds]?\b|\b(?:100%|double|triple|\d+x)\s+(?:your\s+)?(?:sales|revenue|bookings|customers|traffic|leads)\b|\bfirst page of google\b|\b(?:last chance|act now|limited time|only \d+ (?:spots|slots))\b/i;

/** Rejects the things cold outreach must never do: invent facts, claim personal experience the sender did not have, or promise results. */
export function outreachViolations(text: string, allowedText: string): string[] {
  const v: string[] = [];
  if (hasUnsupportedClaim(text)) v.push('contains an unsupported claim about lost customers or revenue, complaints or reviews');
  if (PERSONAL.test(text)) v.push('claims the sender personally did something (visited, tried, spoke to someone) that they did not do');
  if (HYPE.test(text)) v.push('contains a guarantee or high-pressure wording');
  const allowed = allowedText.toLowerCase(); const bad = new Set<string>();
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?%?/g)) {
    const t = m[0]; if (!t.endsWith('%') && Number(t.replace(',', '.')) <= 3) continue; // tiny counts like "2 changes" are tolerated
    if (!allowed.includes(t.toLowerCase())) bad.add(t);
  }
  if (bad.size) v.push(`mentions figures that are not in the research facts: ${[...bad].slice(0, 5).join(', ')}`);
  return v;
}
