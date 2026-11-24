# API

All routes except `POST /api/auth/login` and `GET /api/health` need the session cookie. Changing requests (POST, PATCH, DELETE) also need the header `X-Prospectos: 1`. Success: `{ "data": ..., "meta"?: {page,pageSize,total} }`. Errors: `{ "error": { "code", "message", "details"? } }`. Lists are paginated (`page`, `pageSize` up to 100 or 200).

**Auth** `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me`
**Leads** `GET/POST /api/leads` · `GET/PATCH/DELETE /api/leads/:id` · `POST /api/leads/bulk-update` · `GET /api/leads/:id/activities`
**Discovery** `POST /api/discovery/search` (202, returns jobId) · `GET /api/discovery/jobs/:id` · `POST /api/discovery/jobs/:id/{pause|resume|cancel}` · `GET /api/discovery/results` (filters: q, jobId, countryCode, city, category, websiteStatus, researchStatus, provider, hasPhone, hasEmail, minRating, maxRating, minReviewCount, minScore, since, bbox, sort, dir) · `GET /api/discovery/categories` · `POST /api/discovery/add-to-leads` · `POST /api/businesses/bulk` (exclude or do_not_contact) · `POST /api/businesses/:id/{exclude|do-not-contact}` · `GET/POST /api/saved-searches` · `DELETE /api/saved-searches/:id`
**Providers** `GET /api/providers` · `PATCH /api/providers/:name` · `POST /api/providers/:name/test`
**Research** `POST /api/research/:businessId` (and `/retry`) · `POST /api/research/bulk` · `GET /api/research/:businessId` · `POST /api/research/:businessId/analyze` · `GET /api/research/jobs/:jobId` · `POST /api/research/jobs/:jobId/{pause|resume|cancel}` · `GET/PATCH /api/research/settings`
**Services** `GET/POST /api/services` · `PATCH/DELETE /api/services/:id`
**Settings** `GET/PATCH /api/settings` (scoring, ai, outreach) · `GET /api/ai/usage`
**Outreach** `GET /api/outreach` · `GET /api/outreach/:leadId` · `POST /api/outreach/generate/:leadId` · `PATCH /api/outreach/messages/:id` · `POST /api/outreach/messages/:id/{regenerate|restore|mark-sent|record-reply}` · `GET /api/outreach/messages/:id/versions` · `POST /api/outreach/:leadId/follow-up` · `POST /api/outreach/interpret-reply`
**Suppression** `GET/POST /api/suppression` · `DELETE /api/suppression/:id`
**Analytics** `GET /api/analytics/overview` (the other analytics endpoints and all export endpoints are not built)
