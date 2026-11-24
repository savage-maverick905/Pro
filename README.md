# ProspectOS

A personal sales-intelligence tool for finding businesses that could use web development services. It discovers businesses from public data providers, researches their websites safely, separates verified facts from inferences, scores opportunities transparently, and drafts outreach **that you send yourself**. It never sends messages.

## Status (read this first)

This code was written without network access, so **it has never been installed, type-checked, or run against a real database or the live Groq/Foursquare APIs.** The database layer was later ported from PostgreSQL/Supabase to MongoDB the same way: syntax-checked, but not run against a live MongoDB. Expect to fix some type errors and small bugs on first run.

What *was* verified in a sandbox (pure logic, Node 22, local test servers): the SSRF-safe fetcher, robots.txt parser, HTML parser and website audit, identity matching, duplicate matcher, Groq client retry logic, AI claim guards, scoring maths, outreach safety rules and the prompt builders. These checks are included as vitest suites.

| Phase | Area | State |
|---|---|---|
| 1 | Auth, app shell, dashboard, leads (table, cards, kanban), lead profile | Written, untested |
| 2 | Discovery: Overpass + Foursquare, geocoding, dedupe, filters, map, saved searches | Written, untested; matcher verified |
| 3 | Research worker, SSRF-safe crawling, audits, PageSpeed, reports | Written; crawler/parser verified, DB parts untested |
| 4 | Groq analysis, guards, scoring, service catalogue, Research screens | Written; logic verified, DB/UI untested |
| 5 | Outreach generator, manual sent/reply tracking, suppression, Settings screen | Written; rules verified, DB/UI untested |
| 6 | Analytics screen, CSV/JSON export, PWA install, daily goals, accessibility review | **Not built** |

Also missing: integration and end-to-end tests, an audit-log table, encrypted credential storage (keys live only in environment variables), a duplicate-review screen (medium-confidence matches are stored in `duplicate_candidates` but have no UI), and web search for unlisted websites (needs a search API).

## Quick start

See [INSTALLATION.md](INSTALLATION.md). In short: `npm install`, create a free MongoDB Atlas cluster (or run MongoDB locally), fill `.env`, `npm run migrate -w apps/api` (creates indexes and default data), then run the API, the worker and the web app.

## Documents

[INSTALLATION](INSTALLATION.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DATABASE](DATABASE.md) · [API](API.md) · [PROVIDERS](PROVIDERS.md) · [SECURITY](SECURITY.md) · [DEPLOYMENT](DEPLOYMENT.md) · [TROUBLESHOOTING](TROUBLESHOOTING.md)
