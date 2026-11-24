# Providers

| Provider | Key | Notes |
|---|---|---|
| OpenStreetMap via Overpass | none | Volunteer-maintained data: completeness varies by country and category. No ratings or review counts. Public server has fair-use limits (the app spaces requests 2 s apart). Attribution: © OpenStreetMap contributors (ODbL). A missing website tag is reported as "No website found", never as proof. |
| Nominatim geocoding | none | Max 1 request per second, identifying User-Agent (uses `OWNER_EMAIL`), no bulk use. |
| Foursquare Places | `FOURSQUARE_API_KEY` | Uses `places-api.foursquare.com` with a Bearer key and the `X-Places-Api-Version` header, as in Foursquare's current docs when this was written. Website, phone and rating fields may depend on your plan; a missing website field is treated as "unknown". Check Foursquare's terms on storing results before long-term use. |
| Google PageSpeed Insights | `GOOGLE_PAGESPEED_API_KEY` | Deep research only. Written from memory of the v5 API and **not verified against current docs**. Only real returned values are stored. |
| Groq | `GROQ_API_KEY` | OpenAI-compatible chat completions with JSON mode. Free-tier limits apply; the app enforces a configurable daily token cap. Default model is the example from Groq's docs; set `GROQ_MODEL` to one your account supports. |

Verify the Overpass and Nominatim usage policies yourself before heavy use: they were written from knowledge, not looked up. Providers can be disabled in Settings. No scraping is used; worldwide coverage is not claimed.

To add a provider, implement `ProviderAdapter` (`src/discovery/types.ts`) and register it in `src/discovery/providers/index.ts`. To add an LLM, implement `LLMProvider` (`src/ai/types.ts`).
