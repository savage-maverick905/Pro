import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AIValidationError, LLMError } from '../ai/types.js';
import { AiUnavailable } from '../ai/usage.js';
import { addActivity, col, newId, now, pick } from '../db.js';
import { APPROACHES, CHANNELS, LENGTHS, TONES } from '../outreach/rules.js';
import { OutreachError, generateFollowUp, generateSequence, interpretReply, regenerateMessage, suppressionReason } from '../outreach/service.js';

const Lead = z.object({ leadId: z.string().uuid() });
const Msg = z.object({ messageId: z.string().uuid() });
const Gen = z.object({ channel: z.enum(CHANNELS), tone: z.enum(TONES), approach: z.enum(APPROACHES), length: z.enum(LENGTHS).default('medium'), cta: z.string().trim().max(200).optional(), serviceId: z.string().uuid().optional() });
const err = (code: string, message: string) => ({ error: { code, message } });

async function guarded<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try { return await fn(); } catch (e) {
    if (e instanceof OutreachError) return reply.code(e.status).send(err(e.code, e.message));
    if (e instanceof AiUnavailable) return reply.code(503).send(err('ai_unavailable', e.message));
    if (e instanceof LLMError) return reply.code(502).send(err('ai_error', e.message));
    if (e instanceof AIValidationError) return reply.code(502).send(err('ai_invalid_output', 'The AI could not produce a message that passed the safety checks. Try again, or change the tone or approach.'));
    throw e;
  }
}
const OUTCOME_STATUS = { positive: 'interested', neutral: 'replied', negative: 'not_interested', unsubscribe: 'not_interested' } as const;

const SENT_BLOCKED = err('already_sent', 'A message that has been sent cannot be changed');
const MSG_COLS = ['sequence_id', 'sequence_number', 'kind', 'subject', 'content', 'status', 'sent_at', 'response', 'reply_outcome', 'replied_at'];

/** A message with its sequence, lead and business (the joins the SQL used to do). */
async function messageContext(messageId: string) {
  const m = await col('outreach_messages').findOne({ _id: messageId });
  if (!m) return null;
  const s = await col('outreach_sequences').findOne({ _id: m.sequence_id });
  const l = s && await col('leads').findOne({ _id: s.lead_id });
  if (!s || !l) return null;
  return { m, s, l };
}
const addVersion = (message_id: string, subject: string | null, content: string, source: string) =>
  col('message_versions').insertOne({ _id: newId(), message_id, subject, content, source, created_at: now() });

export async function outreachRoutes(app: FastifyInstance) {
  app.get('/api/outreach', async () => {
    const seqs = await col('outreach_sequences').find({}).sort({ created_at: -1 }).limit(100).toArray();
    const leads = new Map<string, any>((await col('leads').find({ _id: { $in: seqs.map((s) => s.lead_id) } }).toArray()).map((l) => [l._id, l]));
    const biz = new Map<string, string>((await col('businesses').find({ _id: { $in: [...leads.values()].map((l) => l.business_id) } }, { projection: { name: 1 } }).toArray()).map((b) => [b._id, b.name]));
    const msgs = await col('outreach_messages').find({ sequence_id: { $in: seqs.map((s) => s._id) } }, { projection: { sequence_id: 1, kind: 1, status: 1, response: 1 } }).toArray();
    const rows = seqs.filter((s) => leads.has(s.lead_id)).map((s) => { const ms = msgs.filter((m) => m.sequence_id === s._id);
      return { lead_id: s.lead_id, name: biz.get(leads.get(s.lead_id)!.business_id) ?? null, sequence_id: s._id, channel: s.channel, status: s.status, created_at: s.created_at,
        generated: ms.filter((m) => m.kind === 'sequence').length, sent: ms.filter((m) => m.status === 'sent').length, replies: ms.filter((m) => m.response != null).length }; });
    return { data: { sequences: rows, totals: { generated: rows.reduce((a, r) => a + r.generated, 0), sent: rows.reduce((a, r) => a + r.sent, 0), replies: rows.reduce((a, r) => a + r.replies, 0) } } };
  });

  app.post('/api/outreach/interpret-reply', async (req, reply) => {
    const { response } = z.object({ response: z.string().trim().min(1).max(5000) }).parse(req.body);
    return guarded(reply, async () => ({ data: await interpretReply(response) }));
  });

  app.post('/api/outreach/generate/:leadId', async (req, reply) => {
    const { leadId } = Lead.parse(req.params); const o = Gen.parse(req.body);
    return guarded(reply, async () => reply.code(201).send({ data: await generateSequence(leadId, o) }));
  });

  app.get('/api/outreach/:leadId', async (req, reply) => {
    const { leadId } = Lead.parse(req.params);
    const lead = await col('leads').findOne({ _id: leadId });
    const b = lead && await col('businesses').findOne({ _id: lead.business_id }, { projection: { name: 1 } });
    if (!lead || !b) return reply.code(404).send(err('not_found', 'Lead not found'));
    const report = (await col('research_reports').find({ business_id: lead.business_id }, { projection: { recommendations: 1 } }).sort({ created_at: -1 }).limit(1).toArray())[0];
    const seqs = await col('outreach_sequences').find({ lead_id: leadId }).sort({ created_at: -1 }).toArray();
    const msgs = seqs.length ? await col('outreach_messages').find({ sequence_id: { $in: seqs.map((s) => s._id) } }).sort({ sequence_id: 1, sequence_number: 1 }).toArray() : [];
    const counts = msgs.length ? new Map((await col('message_versions').aggregate([{ $match: { message_id: { $in: msgs.map((m) => m._id) } } }, { $group: { _id: '$message_id', n: { $sum: 1 } } }]).toArray()).map((x) => [x._id, x.n as number])) : new Map<string, number>();
    const recs = Array.isArray(report?.recommendations) ? report.recommendations : [];
    return { data: { lead: { id: lead._id, name: b.name, status: lead.status }, suppressed: await suppressionReason(lead.business_id), hasResearch: !!report,
      recommendations: recs.map((r: { serviceId?: string; service?: string }) => ({ serviceId: r.serviceId, service: r.service })).filter((r: { serviceId?: string }) => r.serviceId),
      sequences: seqs.map((s) => ({ ...pick(s, ['channel', 'tone', 'approach', 'length', 'cta', 'status', 'model', 'created_at']),
        messages: msgs.filter((m) => m.sequence_id === s._id).map((m) => ({ ...pick(m, MSG_COLS), versions: counts.get(m._id) ?? 0 })) })) } };
  });

  app.patch('/api/outreach/messages/:messageId', async (req, reply) => {
    const { messageId } = Msg.parse(req.params); const b = z.object({ content: z.string().trim().min(1).max(5000), subject: z.string().trim().max(200).nullable().optional() }).parse(req.body);
    const m = await col('outreach_messages').findOne({ _id: messageId }, { projection: { status: 1 } });
    if (!m) return reply.code(404).send(err('not_found', 'Message not found'));
    if (m.status === 'sent') return reply.code(409).send(SENT_BLOCKED);
    const after = await col('outreach_messages').findOneAndUpdate({ _id: messageId }, { $set: { content: b.content, ...(b.subject != null ? { subject: b.subject } : {}), updated_at: now() } }, { returnDocument: 'after' });
    if (after) await addVersion(messageId, after.subject ?? null, after.content, 'edit');
    return { data: { id: messageId } };
  });

  app.post('/api/outreach/messages/:messageId/regenerate', async (req, reply) => {
    const { messageId } = Msg.parse(req.params); const { instruction } = z.object({ instruction: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    return guarded(reply, async () => { await regenerateMessage(messageId, instruction); return { data: { id: messageId } }; });
  });

  app.get('/api/outreach/messages/:messageId/versions', async (req) => {
    const { messageId } = Msg.parse(req.params);
    return { data: (await col('message_versions').find({ message_id: messageId }).sort({ created_at: -1 }).limit(50).toArray()).map((v) => pick(v, ['subject', 'content', 'source', 'created_at'])) };
  });
  app.post('/api/outreach/messages/:messageId/restore', async (req, reply) => {
    const { messageId } = Msg.parse(req.params); const { versionId } = z.object({ versionId: z.string().uuid() }).parse(req.body);
    const m = await col('outreach_messages').findOne({ _id: messageId }, { projection: { status: 1 } });
    if (!m) return reply.code(404).send(err('not_found', 'Message or version not found'));
    if (m.status === 'sent') return reply.code(409).send(SENT_BLOCKED);
    const v = await col('message_versions').findOne({ _id: versionId, message_id: messageId });
    if (!v) return reply.code(404).send(err('not_found', 'Message or version not found'));
    await col('outreach_messages').updateOne({ _id: messageId }, { $set: { content: v.content, subject: v.subject ?? null, updated_at: now() } });
    await addVersion(messageId, v.subject ?? null, v.content, 'restore');
    return { data: { id: messageId } };
  });

  // The app never sends anything. This only records that the owner sent it themselves.
  app.post('/api/outreach/messages/:messageId/mark-sent', async (req, reply) => {
    const { messageId } = Msg.parse(req.params); const { sentAt } = z.object({ sentAt: z.string().datetime().optional() }).parse(req.body ?? {});
    const when = sentAt ? new Date(sentAt) : new Date(); if (when.getTime() > Date.now() + 5 * 60_000) return reply.code(400).send(err('validation_error', 'The send date cannot be in the future'));
    const x = await messageContext(messageId);
    if (!x) return reply.code(404).send(err('not_found', 'Message not found'));
    if (x.m.status === 'sent') return reply.code(409).send(err('already_sent', 'This message is already marked as sent'));
    const why = await suppressionReason(x.l.business_id); if (why) return reply.code(409).send(err('suppressed', `Do not send: ${why}`));
    await col('outreach_messages').updateOne({ _id: messageId }, { $set: { status: 'sent', sent_at: when, updated_at: now() } });
    await col('leads').updateOne({ _id: x.l._id, status: { $in: ['new', 'researching', 'qualified', 'ready_to_contact'] } }, { $set: { status: 'contacted', updated_at: now() } });
    await addActivity(x.l._id, 'message_sent', `Marked message ${x.m.sequence_number} as sent manually via ${x.s.channel}`, { messageId, sentAt: when.toISOString() });
    return { data: { id: messageId, sentAt: when.toISOString() } };
  });

  app.post('/api/outreach/messages/:messageId/record-reply', async (req, reply) => {
    const { messageId } = Msg.parse(req.params); const b = z.object({ response: z.string().trim().min(1).max(5000), outcome: z.enum(['positive', 'neutral', 'negative', 'unsubscribe']) }).parse(req.body);
    const x = await messageContext(messageId);
    if (!x) return reply.code(404).send(err('not_found', 'Message not found'));
    if (x.m.status !== 'sent') return reply.code(409).send(err('not_sent', 'Mark the message as sent before recording a reply'));
    await col('outreach_messages').updateOne({ _id: messageId }, { $set: { response: b.response, reply_outcome: b.outcome, replied_at: now(), updated_at: now() } });
    await col('leads').updateOne({ _id: x.l._id, status: { $nin: ['converted', 'archived'] } }, { $set: { status: OUTCOME_STATUS[b.outcome], updated_at: now() } });
    if (b.outcome === 'unsubscribe') { // an opt-out is honoured immediately and permanently
      await col('businesses').updateOne({ _id: x.l.business_id }, { $set: { do_not_contact: true, excluded: true, updated_at: now() } });
      if (!(await col('suppression_list').findOne({ business_id: x.l.business_id }))) await col('suppression_list').insertOne({ _id: newId(), business_id: x.l.business_id, contact_value: null, reason: 'Asked not to be contacted', created_at: now() });
    }
    await addActivity(x.l._id, 'reply_received', `Reply recorded on message ${x.m.sequence_number}: ${b.outcome}`, { messageId, outcome: b.outcome });
    return { data: { id: messageId, leadStatus: OUTCOME_STATUS[b.outcome] } };
  });

  app.post('/api/outreach/:leadId/follow-up', async (req, reply) => {
    const { leadId } = Lead.parse(req.params); const b = z.object({ sequenceId: z.string().uuid().optional(), instruction: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    return guarded(reply, async () => reply.code(201).send({ data: await generateFollowUp(leadId, b.sequenceId, b.instruction) }));
  });

  app.get('/api/suppression', async () => {
    const rows = await col('suppression_list').find({}).sort({ created_at: -1 }).limit(500).toArray();
    const ids = rows.map((r) => r.business_id).filter(Boolean);
    const names = new Map((ids.length ? await col('businesses').find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray() : []).map((b) => [b._id, b.name as string]));
    return { data: rows.map((s) => ({ ...pick(s, ['business_id', 'contact_value', 'reason', 'created_at']), business_name: names.get(s.business_id) ?? null })) };
  });
  app.post('/api/suppression', async (req, reply) => {
    const b = z.object({ businessId: z.string().uuid().optional(), contactValue: z.string().trim().min(3).max(200).optional(), reason: z.string().trim().max(300).optional() }).refine((o) => o.businessId || o.contactValue, 'Provide a business or a contact value').parse(req.body);
    const value = b.contactValue ? (b.contactValue.includes('@') ? b.contactValue.toLowerCase() : b.contactValue.replace(/[^\d+]/g, '')) : null;
    await col('suppression_list').insertOne({ _id: newId(), business_id: b.businessId ?? null, contact_value: value, reason: b.reason ?? 'Added manually', created_at: now() });
    if (b.businessId) await col('businesses').updateOne({ _id: b.businessId }, { $set: { do_not_contact: true, excluded: true, updated_at: now() } });
    return reply.code(201).send({ data: { ok: true } });
  });
  app.delete('/api/suppression/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const r = await col('suppression_list').findOneAndDelete({ _id: id });
    if (!r) return reply.code(404).send(err('not_found', 'Entry not found'));
    if (r.business_id && !(await col('suppression_list').findOne({ business_id: r.business_id })))
      await col('businesses').updateOne({ _id: r.business_id }, { $set: { do_not_contact: false, updated_at: now() } });
    return reply.code(204).send();
  });
}
