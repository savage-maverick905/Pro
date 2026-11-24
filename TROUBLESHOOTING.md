# Troubleshooting

- **API exits at start with "Invalid environment configuration":** the message lists the missing or invalid variable. `OWNER_PASSWORD_HASH` must come from `npm run hash-password`.
- **Login works locally but not when deployed:** see cookie notes in DEPLOYMENT.md; check `FRONTEND_URL` matches the browser origin exactly (no trailing slash).
- **Browser shows CORS errors:** `FRONTEND_URL` is wrong, or `VITE_API_URL` points at the wrong host.
- **`npm run migrate` fails or the API cannot reach the database:** check `MONGODB_URI` (password URL-encoded, no angle brackets) and that your IP is allowed in Atlas under Network Access. A `ENOTFOUND` or `Server selection timed out` error almost always means the URI or the IP allow-list. The setup is idempotent and can be re-run.
- **Discovery job "failed" with no providers usable:** a provider has no key or is disabled. OpenStreetMap needs no key.
- **Overpass errors (429, 504):** the public server is busy. Try a smaller radius or fewer categories and wait a minute.
- **Nothing gets researched:** the worker must be running (`npm run worker -w apps/api`), research must not be paused (Research screen), and businesses must be "queued".
- **Reports stay "partial":** AI analysis did not run. Check `GROQ_API_KEY`, the AI toggle and the daily token limit in Settings.
- **"AI output failed validation":** the model returned unusable output twice; try again or set a different `GROQ_MODEL`.
- **A business says "needs review":** a website was found but could not be matched to the business. Open the URL and judge it yourself.
- **Typecheck errors on first run:** expected, since the code was written without a compiler. Fix them before deploying.
