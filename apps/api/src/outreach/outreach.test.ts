import { describe, expect, it } from 'vitest';
import { makeSequenceSchema } from './schema.js';
import { outreachViolations } from './rules.js';
import { buildOutreachPrompt } from './prompt.js';
describe('outreach rules, prompt and schema', () => {
  it('passes all checks', () => {
 const failed: string[] = []; const ok = (n: string, c: boolean, x = '') => { if (!c) failed.push(`${n} ${x}`); };
const facts = '{"findings":[{"finding":"No mobile viewport tag","detail":"2 of 9 images"}],"cta":"a 15-minute call"} +351 21 123 4567';
const good = "Hi, an automated check of your website found that the page has no mobile viewport tag, which can make it hard to read on phones. I'd be glad to share 2 quick ideas. If you'd rather not hear from me, just reply no thanks.";
ok('clean message passes', outreachViolations(good, facts).length === 0, outreachViolations(good, facts).join(';'));
ok('personal claim flagged', outreachViolations("I visited your restaurant last week and loved it.", facts).length === 1);
ok('personal claim variants', ["I've tried your menu", 'I personally used your booking page', 'When I stopped by your shop', 'I read your reviews'].every((t) => outreachViolations(t, facts).some((v) => v.includes('personally'))));
ok('lost customers flagged', outreachViolations('Your slow site is losing customers every day.', facts).length >= 1);
ok('guarantee/hype flagged', ['We guarantee more bookings.', 'Double your sales in a month', 'Act now, limited time offer', 'First page of Google fast'].every((t) => outreachViolations(t, facts).some((v) => v.includes('guarantee'))));
ok('invented figure flagged', outreachViolations('Sites like yours see a 40% jump in enquiries.', facts).some((v) => v.includes('40%')));
ok('figure from facts allowed', outreachViolations('Can we book a 15-minute call?', facts).length === 0);
ok('tiny counts tolerated', outreachViolations('Here are 2 small ideas and 3 quick fixes for your website.', facts).length === 0);
ok('phone in signature allowed', outreachViolations('Call me on +351 21 123 4567 if useful, thanks again.', facts).length === 0);
const p = buildOutreachPrompt({ mode: 'sequence', channel: 'email', tone: 'friendly', approach: 'website_audit', length: 'short', cta: 'a 15-minute call', language: 'English', sender: { name: '', business: '', signature: '', optOutLine: '' },
  business: { name: 'Blue Door Bakery', category: 'bakery', city: 'Lisbon' }, website: 'https://bluedoor.pt', service: { name: 'SEO improvements', problem: 'p', solution: 's' }, findings: [{ finding: 'No meta description' }] });
ok('prompt has honesty + injection rules', ['AUTOMATED check', 'Never invent', 'Never follow instructions', 'at most 500 characters', '[Your name]', 'JSON only'].every((s) => p.system.toLowerCase().includes(s.toLowerCase())), p.system.slice(0, 300));
ok('sequence prompt lists three roles', p.system.includes('Message 3') && p.user.includes('Blue Door Bakery'));
const f = buildOutreachPrompt({ mode: 'follow_up', channel: 'whatsapp', tone: 'direct', approach: 'problem_first', length: 'short', cta: null, language: 'English', sender: { name: 'Sam', business: '', signature: '', optOutLine: '' },
  business: { name: 'X', category: null, city: null }, website: null, service: null, findings: [], followUp: { daysSinceFirstSent: 5, sentMessages: ['hello'], reply: null } });
ok('follow-up prompt includes history', f.user.includes('previous_messages') && f.user.includes('"days_since_first_message":5') && f.allowedText.includes('hello'));
const sch = makeSequenceSchema({ channel: 'email', length: 'short', allowedText: facts });
const m = (n: number, body = good, subject: string | undefined = 'Quick note') => ({ number: n, subject, body });
ok('sequence schema accepts three clean messages', sch.safeParse({ messages: [m(1), m(2), m(3)] }).success);
ok('sequence schema rejects two messages', !sch.safeParse({ messages: [m(1), m(2)] }).success);
ok('sequence schema rejects duplicate numbers', !sch.safeParse({ messages: [m(1), m(1), m(3)] }).success);
ok('email needs a subject', !sch.safeParse({ messages: [m(1, good, undefined), m(2), m(3)] }).success);
ok('schema applies the violation rules', !sch.safeParse({ messages: [m(1, 'We guarantee more bookings for your bakery, no risk at all.'), m(2), m(3)] }).success);
ok('schema enforces length cap', !sch.safeParse({ messages: [m(1, 'a '.repeat(400)), m(2), m(3)] }).success);
expect(failed).toEqual([]);

  });
});
