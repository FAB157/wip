# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**WIP / "World in Pocket"** (`com.itaintasca.app`, historically *itainta* / "Italia in Tasca") — a location-aware AI audio-guide app. As the user walks or drives, geofences around points of interest (POIs) fire and an AI-generated audioguide is spoken aloud. Ships as a Vite PWA, an Android/iOS Capacitor app, and a Vercel-hosted API.

UI strings, comments and commit history are largely in Italian. Keep that convention when editing existing files.

## Commands

```bash
npm install            # .npmrc forces legacy-peer-deps; peer conflicts are expected
npm run dev            # tsx server.ts — Express + Vite middleware on :3000 (NOT vite dev)
npm run build          # vite build → dist/  +  esbuild server.ts → dist/server.cjs
npm start              # node dist/server.cjs (serves dist/ + API on :3000)
npm run lint           # tsc --noEmit — the only automated check in the repo
npm run deploy         # vercel --prod --yes
```

There is **no test framework and no test script**. "Verifying" here means `npm run lint` plus running the app.

`npm run dev` starts Express with Vite in middleware mode on **port 3000** and serves the SPA from there. `vite.config.ts` also defines a dev server on 5173 that proxies `/api` → `:3000`; that path is only used if you run `npx vite` directly.

### Mobile

```bash
npm run build && npx cap sync android    # web assets must be built before every sync
npx cap open android                     # then build/run from Android Studio
npm run generate-assets                  # regenerate icons/splash (brand color #1e3a8a)
```

iOS is built in CI only (`.github/workflows/ios-build.yml`, unsigned Release build on macOS runners).

### Data/maintenance scripts

`scripts/` holds supported one-offs (`npm run enrich-bg`, `npm run repair-carrara`). `scratch/` and the ~100 loose `.cjs`/`.mjs`/`.js` files at the repo root are ad-hoc DB-poking scripts from past sessions — they are excluded from `tsconfig.json` and are not part of the build. Don't treat them as reference implementations, and prefer adding new one-offs to `scratch/`.

## Architecture

### Three runtimes, one codebase

1. **`src/` — React 19 SPA** (Vite, Tailwind v4, `vite-plugin-pwa`). `src/App.tsx` is the whole shell: one component holding tab state (`map | plan | camera | profile | events`), the session, the itinerary and the audio-guide flags. There is no router — tabs are conditionally rendered divs.
2. **`server.ts` — a single ~5900-line Express app** exporting `app`. It is both the local dev server and, via `api/index.ts`, the Vercel serverless function (`vercel.json` rewrites all `/api/*` to it, `maxDuration: 300`). The whole file is `// @ts-nocheck`.
3. **`android/app/src/main/java/com/itaintasca/app/` — a native Kotlin geofencing stack** that keeps working when the WebView is dead.

`itainta-native/` is a **separate, unfinished Expo rewrite** with its own `package.json` and its own `AGENTS.md`. It is excluded from the root tsconfig. Don't edit it when working on the main app.

### The server is an API-key proxy

No third-party key ever reaches the client. `server.ts` fronts ~70 routes over: Groq / DeepSeek / Together / Gemini / OpenAI (LLM), Azure Speech + Google TTS + ElevenLabs (TTS), Foursquare, TripAdvisor, Mapbox, Geoapify, Overpass, Wikipedia/Wikidata, Ticketmaster/Viator/GetYourGuide, Stripe and RevenueCat.

Two patterns to preserve when touching routes:

- **`callUniversalAi(primaryEngine, ...)`** (top of `server.ts`) — LLM calls go through it so they fall back across engines and log token usage. Don't call a provider SDK directly in a new route.
- **`getFromCache` / `saveToCache`** against the Supabase `api_cache` table, and `saveAudioToStorageAndCache` for MP3s into the `audio_cache` storage bucket. Expensive routes are cache-first by key.

`rateLimiter` is an in-memory per-IP middleware (100 req/min) — it resets on every serverless cold start, so it is a courtesy limit, not a security control.

`src/lib/api.ts::getApiUrl()` decides the API base: relative paths in the browser, hardcoded `https://wip.guide` when `Capacitor.isNativePlatform()`. Native builds always hit production (`itainta.vercel.app` stays alive as the secondary domain of the same Vercel project — old installed builds and the native Kotlin/Swift constants of past releases depend on it).

### POI data flow (DB-first, cache-first)

`shared_pois` in Supabase is the live POI table (the `Poi`/`NearbyPoi` types in `src/types/poi.ts` document the intended schema, including the `pois`/`poi_details`/`poi_audioguides`/`indexed_areas` split — parts of it are aspirational, verify against the DB before relying on a column).

Reads funnel through **`src/services/poiRepository.ts`** — every Supabase POI query lives there. Its fallback chain is: Dexie (`src/lib/db.ts`, IndexedDB, offline) → `nearby_pois` PostGIS RPC → plain select. `src/lib/circuitBreaker.ts` trips the whole path after repeated failures.

Content is generated once and cached forever:

- `enrichmentService.ensurePoiDetails()` → `POST /api/poi/enrich` (Wikipedia + Wikidata + Commons + Foursquare) → stored in `poi_details`.
- `audioguideService.getOrCreateAudioguideText()` → keyed on `(poi_id, language, guide_character)` → `POST /api/regenerate` → stored in `poi_audioguides`. "Chiedi di più" levels 1–3 are deliberately **not** cached.
- `poiDiscovery.runOverpassDiscovery()` auto-populates missing areas from OpenStreetMap with `status='auto'`, recording covered areas in `indexed_areas` so it doesn't re-query.
- A Vercel cron hits `/api/poi/batch-enrich` nightly at 03:00 (guarded by `CRON_SECRET`).

`supabase/functions/` holds four Deno edge functions (`auto-enrich-poi`, `generate-poi-audio`, `generate-poi-data`, `manager-poi`) that duplicate parts of this pipeline server-side.

### Geofencing — two independent implementations

This is the part most likely to bite you: **the same logic exists three times and all must be kept in sync.**

- **Web/foreground**: `src/services/locationService.ts` (a 700-line singleton owning geolocation watch, the audio element graph, the TTS queue and quota checks) plus `src/lib/geofencing/*` (`SmartGeofenceManager`, `triggerManager`, `waypointTracker`, `transportDetector`, `routeEngine`, `audioDirector`).
- **Android/background**: `ItaintaBackgroundPoiService.kt`, a foreground Service with its own Room DB (`db/PoiEntity.kt`, `TriggerStateEntity.kt`), its own `SupabaseClient.kt`, its own Android `TextToSpeech`, `GeofenceManager` + `GeofenceBroadcastReceiver`, `BootReceiver` for restart-on-boot and `ServiceWatchdog` for keep-alive.
- **iOS/background**: `ios/App/App/*.swift` — `BackgroundPoiManager.swift` (CLLocationManager background updates + in-process trigger state machine, port of service+receiver), `SpeechQueue.swift` (AVSpeechSynthesizer teaser queue), `WipSupabaseClient.swift`, `PoiStore.swift` (UserDefaults/JSON instead of Room), `WipPackageDownloadManager.swift`, plus the two plugins `ItaintaBackgroundPoiPlugin.swift` and `WipBackgroundAudioPlugin.swift` registered in `MainViewController.swift`. Same plugin API, same events, same prefs keys as Android.

They are bridged by `ItaintaBackgroundPoiPlugin.kt` (Capacitor plugin `ItaintaBackgroundPoiPlugin`) and by `localStorage`: `App.tsx` writes `wip_active_subcategories`, `wip_audioguide_active` etc., and the native service reads them on next start. The Kotlin service also carries its own `CATEGORY_MAP` translating UI categories (`monumenti`, `musei`, `chiese`, …) to DB category values — **if you add a category to the web filter, add it to that map too, and to `PoiCategories.map` in `ios/App/App/PoiModels.swift`.**

Audio playback in the background goes through a second plugin, `WipBackgroundAudioPlugin`/`WipBackgroundAudioService` (`src/plugins/WipBackgroundAudio.ts`).

### Cross-component communication

Beyond props, components talk via `window` CustomEvents. Search for these names before renaming anything: `wip-open-chat`, `wip-smart-navigate`, `wip-poi-trigger`, `wip-itinerary-checkin`, `wip-settings-updated`, `wip-nav-instruction`, `pois-updated`, `focus-poi`, `audioguide-status`.

### Monetization — two overlapping systems

`src/lib/pricing.ts` is the **current** model: a credit wallet (`purchased_credits` + `earned_credits` on `user_profiles`, spent via the `consume_credits` Postgres RPC which drains `earned` first). Prices live in `PRICING_LIST`.

`src/lib/quotaManager.ts` is the **legacy** per-day free/premium quota system (`user_quotas`, `global_quotas`, bonus counters). It has not been removed and `locationService` still calls `checkUserQuota`/`incrementUserQuota`. When adding a paid feature, use `pricing.ts` and check whether the old path also gates it.

Top-ups arrive via the Stripe webhook (`/api/stripe/webhook`, registered **before** `express.json()` because it needs the raw body) and the RevenueCat webhook for Android IAP.

## Conventions worth knowing

- `src/lib/supabase.ts` hardcodes the project URL and an anon-key fallback, and silently swaps in a `localStorage`-backed **mock client** if they look like placeholders. If Supabase calls appear to succeed but nothing persists, you're on the mock.
- Admin access is partly hardcoded to the email `marmidicarrara@gmail.com` in `quotaManager.ts`.
- `@capacitor-community/background-geolocation` is aliased in `vite.config.ts` to a stub (`src/stubs/background-geolocation.ts`) — the real background work is the Kotlin service.
- `src/lib/i18n.ts` is a single 3200-line translation map (IT/EN/FR/ES/DE/RU/ZH). Voices per language/character are in `ttsService.azureVoiceName`.
- Much of `src/` uses `any` liberally and several files are `// @ts-nocheck`. `npm run lint` currently passing is the bar; don't take a clean run as proof the types are meaningful.

## Environment

Local config goes in `.env.local` / `.env` (all `.env*` are gitignored). The server reads unprefixed names first and falls back to `VITE_`-prefixed ones for most keys.

Required for anything to work: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`.
Feature-gated: `GROQ_API_KEY` (+`_2`/`_3` rotation), `DEEPSEEK_API_KEY`, `TOGETHER_API_KEY`, `GEMINI_API_KEY` (+`_2`/`_3`), `OPENAI_API_KEY`, `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`, `GOOGLE_TTS_API_KEY`, `ELEVENLABS_API_KEY`, `FOURSQUARE_API_KEY`, `TRIPADVISOR_API_KEY`, `VITE_MAPBOX_TOKEN`, `GEOAPIFY_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `UNSPLASH_ACCESS_KEY`, `TICKETMASTER_API_KEY`, `VIATOR_API_KEY`, `GYG_API_KEY`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`.

Routes degrade to an error response rather than crashing when a key is absent.
