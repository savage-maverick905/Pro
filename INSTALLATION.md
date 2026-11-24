# Installation

Requires **Node.js 20.3 or newer** (22 recommended) and a MongoDB database: a free [MongoDB Atlas](https://www.mongodb.com/atlas) M0 cluster, or MongoDB 6+ running locally.

## 1. Install

Linux / macOS:
```bash
cd prospectos
npm install
cp .env.example .env
```
Windows (PowerShell):
```powershell
cd prospectos
npm install
copy .env.example .env
```

## 2. Create secrets

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # use for SESSION_SECRET
npm run hash-password -w apps/api -- "your-long-password-12+chars"            # prints OWNER_PASSWORD_HASH=...
```
Paste both into `.env`.

## 3. Configure `.env`

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | no | `development` or `production` |
| `PORT` | no | API port, default 4000 |
| `FRONTEND_URL` | **yes** | Exact origin of the web app, e.g. `http://localhost:5173` (used for CORS) |
| `MONGODB_URI` | **yes** | Atlas: Connect, Drivers, copy the `mongodb+srv://...` string and insert your password. Local: `mongodb://127.0.0.1:27017/prospectos` |
| `MONGODB_DB` | no | Database name. Defaults to the name in the URI, otherwise `prospectos` |
| `OWNER_EMAIL` | **yes** | Your login email; also used in the User-Agent sent to OpenStreetMap services |
| `OWNER_PASSWORD_HASH` | **yes** | From the hash-password command |
| `SESSION_SECRET` | **yes** | 32+ characters |
| `GROQ_API_KEY` | for AI | Without it, research still runs but reports stay "partial" and outreach is unavailable |
| `GROQ_MODEL` | no | Defaults to `llama-3.3-70b-versatile`; check console.groq.com/docs/models |
| `FOURSQUARE_API_KEY` | no | Foursquare provider is disabled without it |
| `GOOGLE_PAGESPEED_API_KEY` | no | PageSpeed scores are collected only in deep research |
| `ENCRYPTION_KEY`, `BACKEND_URL` | no | Reserved; not used by the code yet |

For the web app, create `apps/web/.env` with `VITE_API_URL=http://localhost:4000`.

## 4. Database

In Atlas, add your IP under Network Access (or `0.0.0.0/0` for a hosted deploy) and create a database user. Then:

```bash
npm run migrate -w apps/api
```
Creates the collection indexes and inserts the default settings and the 24-service catalogue. It is safe to re-run; existing data is never overwritten.

## 5. Run (three terminals)

```bash
npm run dev:api                     # API on :4000
npm run worker -w apps/api          # research worker (required for research and AI analysis)
npm run dev:web                     # web app on :5173
```
Open http://localhost:5173 and sign in with `OWNER_EMAIL` and your password.

## 6. Check the code

```bash
npm run typecheck
npm test
```
Tests need no API keys and no database. Fix any type errors before relying on the app.

## First use

1. Settings: test the OpenStreetMap provider; add your sender details.
2. Discover: search, for example "restaurants" in a city.
3. Research: the worker picks up newly discovered businesses (check the pause switch).
4. Open a report; add promising businesses to leads.
5. Outreach: generate, edit and copy messages; mark them sent after you send them yourself.
