# Deployment

You need three things running: the **API**, the **worker**, and the **web app**, plus a database. Vercel cannot run the worker, so host the API and worker on a Node host (Railway, Render, Fly.io or a small VPS).

1. **Database:** create a MongoDB Atlas cluster, add a database user, allow your host's IPs under Network Access (`0.0.0.0/0` for hosts without fixed IPs), set `MONGODB_URI`, and run `npm run migrate -w apps/api` once (from your machine is fine).
2. **API + worker:** build with `npm install && npm run build -w apps/api`. Run two processes from the same repo and environment: `npm run start -w apps/api` and `npm run start:worker -w apps/api`. Set all required variables from INSTALLATION.md with `NODE_ENV=production` and `FRONTEND_URL` set to the exact web origin.
3. **Web:** import the repo into Vercel, root directory `apps/web`, build command `npm run build`, output `dist`, environment variable `VITE_API_URL` set to the API's public HTTPS URL. Add a rewrite of all paths to `/index.html` so deep links work.
4. **Cookies:** in production the session cookie is `Secure; SameSite=None`. Browsers that block third-party cookies (Safari, some Chrome settings) can break login when the web and API are on unrelated domains. The reliable fix is a custom domain for both, for example `app.example.com` and `api.example.com`.
5. **Check:** open `/api/health` on the API, sign in, run a small Discover search, and watch the worker logs.

PWA installation is not built yet. Free tiers (MongoDB Atlas M0, Groq, Foursquare, PageSpeed, hosts that sleep) have limits; the app has caps and pause controls but does not assume the limits are unlimited.
