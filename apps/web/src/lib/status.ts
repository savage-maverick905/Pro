export const STATUSES = [
  ['new', 'New'], ['researching', 'Researching'], ['qualified', 'Qualified'], ['ready_to_contact', 'Ready to contact'],
  ['contacted', 'Contacted'], ['replied', 'Replied'], ['interested', 'Interested'], ['negotiating', 'Negotiating'],
  ['converted', 'Converted'], ['not_interested', 'Not interested'], ['unresponsive', 'Unresponsive'], ['archived', 'Archived'],
] as const;
export const statusLabel = (s: string) => STATUSES.find(([v]) => v === s)?.[1] ?? s;

// "No website found" is an observation, not proof the business has none.
export const websiteLabel = (s: string) => ({ unknown: 'Website unknown', none_found: 'No website found', exists: 'Has website',
  inaccessible: 'Website inaccessible', redirects: 'Website redirects', verified_none: 'Verified: no website' } as Record<string, string>)[s] ?? s;

export type Lead = {
  id: string; business_id: string; status: string; opportunity_score: number | null; tags: string[]; notes: string | null;
  follow_up_at: string | null; updated_at: string; name: string; category: string | null; city: string | null;
  country: string | null; website_url: string | null; website_status: string; phone: string | null; email: string | null;
  research_status: string;
};
