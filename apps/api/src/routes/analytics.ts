import type { FastifyInstance } from 'fastify';
import { col, pick } from '../db.js';

// Contacted/replied/interested are derived from lead status until manual outreach tracking exists (Phase 5).
const CONTACTED = ['contacted', 'replied', 'interested', 'negotiating', 'converted', 'unresponsive'];

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/api/analytics/overview', async () => {
    const b = col('businesses'); const l = col('leads');
    const [total, no_website, researched, research_pending, high_opportunity, contacted, replies, interested, converted, pipe, acts, jobs] = await Promise.all([
      b.countDocuments({}),
      b.countDocuments({ website_status: { $in: ['none_found', 'verified_none'] } }),
      b.countDocuments({ research_status: 'completed' }),
      b.countDocuments({ research_status: { $in: ['queued', 'researching'] } }),
      l.countDocuments({ opportunity_score: { $gte: 65 } }),
      l.countDocuments({ status: { $in: CONTACTED } }),
      l.countDocuments({ status: { $in: ['replied', 'interested', 'negotiating', 'converted'] } }),
      l.countDocuments({ status: { $in: ['interested', 'negotiating'] } }),
      l.countDocuments({ status: 'converted' }),
      l.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
      col('activities').aggregate([
        { $sort: { created_at: -1 } }, { $limit: 10 },
        { $lookup: { from: 'leads', localField: 'lead_id', foreignField: '_id', as: 'l' } }, { $unwind: '$l' },
        { $lookup: { from: 'businesses', localField: 'l.business_id', foreignField: '_id', as: 'b' } }, { $unwind: '$b' },
      ]).toArray(),
      col('prospecting_jobs').find({ status: { $in: ['pending', 'running', 'paused'] } }).sort({ created_at: -1 }).limit(10).toArray(),
    ]);
    return { data: { total, no_website, researched, research_pending, high_opportunity, contacted, replies, interested, converted,
      conversion_rate: contacted ? Math.round((converted / contacted) * 1000) / 10 : null,
      pipeline: Object.fromEntries(pipe.map((r) => [r._id, r.count])),
      recent_activities: acts.map((a) => ({ ...pick(a, ['activity_type', 'description', 'created_at']), business_name: a.b.name })),
      active_jobs: jobs.map((j) => pick(j, ['job_type', 'status', 'total_tasks', 'completed_tasks', 'failed_tasks'])) } };
  });
}
