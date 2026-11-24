import { z } from 'zod';
import { MAX_CHARS, outreachViolations, type CHANNELS, type LENGTHS } from './rules.js';

type Channel = (typeof CHANNELS)[number]; type Length = (typeof LENGTHS)[number];
const checkBody = (ctx: z.RefinementCtx, path: (string | number)[], body: string, subject: string | undefined, o: { channel: Channel; length: Length; allowedText: string }) => {
  const max = Math.min(MAX_CHARS[o.length], o.channel === 'instagram' ? 700 : 5000);
  if (body.trim().length < 20) ctx.addIssue({ code: 'custom', path: [...path, 'body'], message: 'body is too short' });
  if (body.length > max) ctx.addIssue({ code: 'custom', path: [...path, 'body'], message: `body must be at most ${max} characters` });
  if (o.channel === 'email' && (!subject || !subject.trim() || subject.length > 100)) ctx.addIssue({ code: 'custom', path: [...path, 'subject'], message: 'email needs a subject of at most 100 characters' });
  for (const why of outreachViolations(`${subject ?? ''} ${body}`, o.allowedText)) ctx.addIssue({ code: 'custom', path: [...path, 'body'], message: why });
};
const msg = z.object({ number: z.coerce.number().int().min(1).max(3), subject: z.string().max(200).optional(), body: z.string() });

export const makeSequenceSchema = (o: { channel: Channel; length: Length; allowedText: string }) =>
  z.object({ messages: z.array(msg).length(3) }).superRefine((v, ctx) => {
    if (v.messages.map((m) => m.number).sort().join() !== '1,2,3') ctx.addIssue({ code: 'custom', path: ['messages'], message: 'messages must be numbered 1, 2 and 3 exactly once' });
    v.messages.forEach((m, i) => checkBody(ctx, ['messages', i], m.body, m.subject, o));
  });
export const makeSingleSchema = (o: { channel: Channel; length: Length; allowedText: string }) =>
  z.object({ subject: z.string().max(200).optional(), body: z.string() }).superRefine((v, ctx) => checkBody(ctx, [], v.body, v.subject, o));

export const ReplyInterpretation = z.object({
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  intent: z.enum(['interested', 'asks_question', 'asks_price', 'not_now', 'not_interested', 'unsubscribe', 'other']),
  summary: z.string().max(300), suggestedOutcome: z.enum(['positive', 'neutral', 'negative', 'unsubscribe']), suggestedNextStep: z.string().max(300),
});
