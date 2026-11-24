# Database

MongoDB (Atlas or self-hosted) through the official Node driver. There are no schema migrations: `npm run migrate -w apps/api` creates the indexes (`src/migrate.ts`) and inserts the default settings and services (`src/seed.ts`), and is idempotent. Only the backend connects to the database; browsers never do.

Every document uses a string UUID as `_id` (the API still returns it as `id`) and keeps the same snake_case field names the old SQL tables had, so the web app is unchanged. Collections: businesses, business_sources, business_contacts, business_social_profiles, services, leads, activities, prospecting_jobs, job_items, suppression_list, saved_searches, provider_settings, settings, duplicate_candidates, websites, website_audits, research_reports, research_evidence, opportunities, ai_usage, outreach_sequences, outreach_messages, message_versions.

Notes: `business_sources.raw_data` keeps each provider's own values so conflicts stay visible. Provider API keys are never stored in the database. Distance matching uses indexed latitude/longitude bounding boxes (no geospatial index is required).

**Behaviour differences from the PostgreSQL version.** MongoDB does not enforce foreign keys or cascades, so the code does it: deleting a lead removes its activities and outreach data, and deleting a service clears its links on opportunities and sequences. Multi-document transactions are not used (they need a replica set), so a crash in the middle of a multi-step write can leave a partial result; inserts are idempotent through unique indexes and the research queue recovers stale items. Name searches use case-insensitive regular expressions instead of a trigram index, which is fine at personal-tool scale.

## Backup and restore

Atlas M0 has no automatic backups; paid tiers do. To take your own with the MongoDB Database Tools:
```bash
mongodump --uri="$MONGODB_URI" --gzip --archive=prospectos.archive.gz
mongorestore --uri="$NEW_MONGODB_URI" --gzip --archive=prospectos.archive.gz --drop
```
Test a restore into a scratch database before you depend on it. In-app export and backup are not built yet.
