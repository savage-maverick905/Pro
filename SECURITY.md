# Security

**Implemented**
- Owner-only login: scrypt password hash, constant-time comparison, signed httpOnly cookie (7 days), login limited to 5 per minute, global API rate limit.
- CSRF defence: changing requests need a custom header, which forces a CORS preflight; CORS is restricted to `FRONTEND_URL`.
- Secure headers via Helmet; Zod validation on all inputs; all database queries use the driver's typed filters (no string-built queries; user text in searches is regex-escaped; sort fields are whitelisted); raw database errors are never returned.
- SSRF protection for all crawling: only http/https on ports 80, 443, 8080, 8443; no credentials in URLs; loopback, private, link-local (including cloud metadata), CGNAT and reserved ranges blocked for IPv4, IPv6 and IPv4-mapped forms; the address is checked at connect time (defeats DNS rebinding); every redirect re-validated; size, time and content-type limits; no JavaScript is executed; robots.txt is respected. Tested against hostile inputs.
- Untrusted data: website text and provider data are treated as data. Map popups use text nodes, links are only rendered for http(s), AI prompts delimit untrusted text and tell the model never to follow instructions in it, and AI output is validated and claim-checked in code.
- Suppression list honoured before generating outreach and before marking a message sent; replies asking to stop add the business automatically.
- Secrets live only in server environment variables; keys are never sent to the browser.

**Not implemented yet:** audit-log table, encrypted credential storage, in-app data deletion beyond deleting leads and suppression entries, a dependency audit, and any penetration testing. Do not expose the API without HTTPS. Use a long, unique owner password.

**Outreach compliance:** the app drafts messages and blocks known opt-outs, but you are responsible for complying with marketing and privacy law in each recipient's country (for example GDPR/PECR, CAN-SPAM, CASL). It collects only publicly listed business contact details.
