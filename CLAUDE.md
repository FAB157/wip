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

No third-party key ever reaches the client. `server.ts` fronts ~70 routes over: Groq / DeepSeek / Together / Gemini / OpenAI (LLM), Azure Speech + AWS Polly + ElevenLabs + Google TTS (TTS, in that fallback order — see `synthesizeSpeech`), Foursquare, TripAdvisor, Mapbox, Geoapify, Overpass, Wikipedia/Wikidata, Ticketmaster/Viator/GetYourGuide, Stripe and RevenueCat.

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

#### On-the-fly enrichment of a POI card — the rules (19/09/2026)

What the user actually opens: the **pin popup** (`PoiPopupContent` → `/api/poi/details`, then `/api/poi/enrich-stream`) and the **sheet** (`PoiDetailSheet` → `/api/poi/details`, then `/api/poi/enrich` + the stream). Measured that day: 77% of the POIs around Forte dei Marmi had neither text nor photo (almost all `source='overture'`), and the pipeline had fired 105 times in 7 days. Decisions of the committente, all in force:

- **No credit gate on the card.** The 5-credit «Arricchimento Dettagli (AI)» confirmation and charge are gone: a place's text and photo are free. The audioguide keeps its own gate.
- **Guests get the cache, never a generation** («ospiti no»): `/api/poi/details` and the STEP 0 cache hit stay public; everything after it sits behind `cancelloGenerazione`, which is called **before** the source lookup, not after.
- **No source → no text, and no LLM call either.** The text was already forced empty (rule of 24/08); now the model is not even called, the outcome is remembered for 14 days (`enrich_vuoto_<id>` in `api_cache`), and a photo that *was* found is saved immediately — not after the stream.
- **Overture commercial POIs: data only, no prose** (`eCommercialeOverture`: `source='overture'` or id `ov-…`, and a commercial category — beach clubs, restaurants, hotels, shops, chargers). No Wikipedia, no official-site-as-source, no LLM: the server answers `solo_dati: true` and the client shows the data line (street · city; phone, site and hours already have their buttons). The only lookup allowed is the street-level photo. Museums, churches, monuments, parks and galleries are **not** commercial, even when the row comes from Overture.
- **`nomeCombacia` no longer accepts one shared word.** That rule matched «Bagno Versilia – *Forte* dei Marmi» with «*Forte* Lorenese» and gave a wine bar the photo of a fountain. Now: Wikipedia's parenthetical disambiguator and the caller's `toponimi` (the POI's city, plus the settlement articles of the same geosearch, `toponimiDaPagine`) do not count, and **every** proper word of the shorter name must be in the other. The city name proves nothing. A Wikidata hit by *name* must also have coordinates (P625) within 2 km. `scratch/collaudo-nome-combacia.mjs` runs the real cases against the code extracted from `server.ts` — run it after touching the function.
- A saved `wikidata` QID or `wikipedia_url` on the row is the exact source and is used first, by both routes (`cercaMaterialeReale` used to ignore them). So is the article title saved at import in `technical_data.wikipedia_raw` (`wikipediaDaDatiTecnici`, 21/09/2026).
- **Every card as complete as possible, never invented (committente 21/09/2026: «devono essere tutti più completi possibili»; «le schede solo dei POI culturali, il resto la schedina»).** When articles, official site and web give nothing:
  · `materialeDaiDati` reads **Wikidata** (saved QID, or found by name with coordinates ≤ 1.5 km): type, style, architect, heritage designation, material, part of, year, height, visitors, and the P18 photo. With ≥ 3 facts they become the model's material (short card, rule «only these data, no coordinates, no added adjectives»); with fewer, `schedaDaiDati` composes the card from the data alone, no model.
  · `rigaDatiLuogo` = the data line (type · street · city · cuisine) from `ETICHETTE_TIPO_LUOGO` (all real categories, IT/EN). A place of UNKNOWN type (`poi_type='isolated'`) gets no type word: the import category is often wrong (the statue «Stégosaure» was filed as a museum).
  · **Commercial (Overture): still no prose, but the data line is saved as `description_short`** («e i commerciali aggiungi riga»), and the photo is first the `og:image` of their official site, then street level. Everything written this way carries `enrichment_source='dati_strutturati'`.
  · The «already searched, empty» memo key is now `enrich_vuoto_v2_…`, so places marked empty before 21/09 are re-evaluated once with the new sources.
  · **Photos only when the file names the place**: `fotoDelLuogo` no longer accepts «the nearest file within 60 m» (it gave Oxygen Park, London, the photo of Morpeth Mansions). Street level (Mapillary) is now also tried when a text exists but the photo does not.
  · **Map layers** (gusto, sentieri, ciclabili, shopping, lusso, neve, spiagge) open a static bubble: `arricchisciFumetto` (MapArea) asks `/api/poi/enrich` in `fast` mode (no model) on popup open and appends short text + photo. Points that are not in `shared_pois` (neve, spiagge) send `salva:false`: no row is created (they must not appear as places), the answer is cached 30 days in `api_cache` (`schedina_…`).
  · **Pre-enrichment** of a zone before users arrive: `node scripts/prearricchisci-zona.mjs <lat> <lon> [km] [--limite=N] [--prova]` — calls the production route with `x-script-secret`, i.e. as `background-script`: rotating pool only, never the dedicated keys, never direct DeepSeek. It never starts by itself.
- **Wider sources, never Groq "from memory"** («aggiungi le fonti»). Until 22–24/08 Groq wrote every card from its weights and photos were picked by name: everything looked filled and a good part was invented — that is why it was turned off, and it does not come back. When Wikipedia/Wikivoyage give nothing, `materialeWebPerPoi` adds the place's **official site** (`contact_website`, or `sitoUfficialeViaRicerca`) and the **open web** through the same `cercaMaterialeWeb` the museum guides use (SearXNG): a page counts only if it names the place (≥ 2 proper words) **and the city** — the city plays the role the museum plays there; no city, no search. Tier A = reliable sources, tier B = blogs marked «NON VERIFICATA»; tier B alone is not enough to say a fact, so it yields no text. Every prompt that receives this material must append `regoleMaterialeWeb` (never copy sentences, length follows the facts, tier B only if confirmed). Web text is **never** shown or saved raw: `/api/poi/enrich` skips the web in `fast` mode (there the extract becomes `description_short` as is) and never falls back to the raw extract when it came from the web. 14 s cap, in parallel with the photo search. Never for commercial POIs. `scratch/collaudo-materiale-web-poi.mjs` tests the glue logic with stubbed network.

### Geofencing — two independent implementations

This is the part most likely to bite you: **the same logic exists three times and all must be kept in sync.**

- **Web/foreground**: `src/services/locationService.ts` (a singleton owning geolocation watch, the audio element graph, the TTS queue and quota checks) plus `src/lib/geofencing/foregroundTriggers.ts` (the actual web trigger engine; `telemetry`, `gpsReplay`, `footprints`, `bearingGate`, `predittore` support it). The names `SmartGeofenceManager`, `triggerManager`, `waypointTracker`, `transportDetector`, `routeEngine` survive only in old comments — those files no longer exist (verified 18/09/2026); `audioDirector` lives in `src/lib/tour/`.
- **Android/background**: `ItaintaBackgroundPoiService.kt`, a foreground Service with its own Room DB (`db/PoiEntity.kt`, `TriggerStateEntity.kt`), its own `SupabaseClient.kt`, its own Android `TextToSpeech`, `GeofenceManager` + `GeofenceBroadcastReceiver`, `BootReceiver` for restart-on-boot and `ServiceWatchdog` for keep-alive.
- **iOS/background**: `ios/App/App/*.swift` — `BackgroundPoiManager.swift` (CLLocationManager background updates + in-process trigger state machine, port of service+receiver), `SpeechQueue.swift` (AVSpeechSynthesizer teaser queue), `WipSupabaseClient.swift`, `PoiStore.swift` (UserDefaults/JSON instead of Room), `WipPackageDownloadManager.swift`, plus the two plugins `ItaintaBackgroundPoiPlugin.swift` and `WipBackgroundAudioPlugin.swift` registered in `MainViewController.swift`. Same plugin API, same events, same prefs keys as Android.

They are bridged by `ItaintaBackgroundPoiPlugin.kt` (Capacitor plugin `ItaintaBackgroundPoiPlugin`) and by `localStorage`: `App.tsx` writes `wip_active_subcategories`, `wip_audioguide_active` etc., and the native service reads them on next start. The Kotlin service also carries its own `CATEGORY_MAP` translating UI categories (`monumenti`, `musei`, `chiese`, …) to DB category values — **if you add a category to the web filter, add it to that map too, and to `PoiCategories.map` in `ios/App/App/PoiModels.swift`.**

Audio playback in the background goes through a second plugin, `WipBackgroundAudioPlugin`/`WipBackgroundAudioService` (`src/plugins/WipBackgroundAudio.ts`).

### Turn-by-turn with the screen off — the native "follower" (18/09/2026)

Set after the committente's order: «il navigatore, sia nell'audioguida che nei percorsi, deve funzionare anche a schermo spento. È fondamentale». Turn-by-turn is computed and spoken by JS (`src/hooks/useWalkingNavigation.ts` for a single stop, `src/lib/tour/giroDriver.ts` + `src/services/tourService.ts` for tours/percorsi) — and the WebView is frozen when the screen is off, so the navigator went silent while the native geofencing audioguide kept talking.

- JS does **not** get ported: it hands the native service a ready route (maneuvers with **already translated** text + decimated polyline) through `src/lib/nav/navNativo.ts` — the only module allowed to call the four plugin methods `setNavRoute` / `clearNavRoute` / `navHeartbeat` / `getNavProgress`.
- Hand-over is by **heartbeat**: while the page is alive it sends a heartbeat on every fix (and every 4 s) and speaks itself, with its full audio direction; if the heartbeat is older than 8 s the native `NavFollower` speaks (`android/.../service/NavFollower.kt`; class `NavFollower` at the bottom of `ios/App/App/BackgroundPoiManager.swift` — no new Swift files, the pbxproj is hand-edited). The follower **always** keeps count of maneuvers, even while silent, so nothing is repeated or skipped at the switch.
- It speaks through the **same** native TTS queue as `speakText` kind `"nav"` — never a second TTS engine. Nav phrases expire after 20 s in the queue (`scadenzaElapsedMs` / `scadenzaMs`, additive fields: `null` = never, teasers and guides unchanged).
- While a route is active the native service raises its GPS rate on its own (in "navigator mode" it would otherwise idle at 20 s / 80 m).
- The contract and the algorithm live in `docs/nav-nativo-spec.md` and must stay **identical** on Kotlin and Swift: change one, change the other and the spec. The native side cannot recalculate a route (the server routes, JS phrases): off-route with the screen off is only *announced*.
- The single native route slot is shared by both JS navigators: each one retires only the route it published.
- A **stale «Termina»** from the lock-screen dashboard (delivered > 60 s late, page was frozen) never closes a tour blindly — a percorso su misura is *paid*: `App.tsx` asks for confirmation once the page is visible; on "no" `navNativo` re-delivers the route to the follower. Only «pausa» is applied late without questions.

**The same rule applies to audio: whatever must play with the screen off has to be handed to the NATIVE side up front.** `tourService.prescarica` stores texts + MP3s in the WebView's IndexedDB, which the native service cannot read; at its end it calls the plugin method `prefetchGuides` (`prescaricaGuideNativo` → Android `AudioPrefetchManager.prefetchMolti`, iOS `BackgroundPoiManager.prescaricaGuide`) so the same stops land in the native file cache too, one at a time, 1.5 s apart. That bulk path sends **`soloCache: true`** to both `/api/poi/audioguide` and `/api/tts/smart`: the server answers 204 instead of generating text or synthesizing voice, so a prefetch of N stops never costs AI, TTS or daily quota — what is missing is produced on arrival, behind the usual gate. Native clients never send `charge`; keep it that way. The flag defaults to false everywhere else (arrival and on-approach prefetch stay get-or-create).

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

## Photos and text must be REAL and about the subject

Non-negotiable, set after a Premium Guide of La Spezia shipped with photos of
places that were not La Spezia (22/08/2026).

- **Photos come from the PLACE, never from a keyword.** The only accepted
  sources are the ones that tie an image to a location: the city's Wikipedia
  article, Wikimedia Commons searched by **name of the monument** or by
  **coordinates** (`generator=geosearch`), and `contact_website`/Wikidata
  images of the POI itself.
- **Unsplash is not a photo source for content.** It is a stock-photography
  archive: a query like `"<city> city landmark"` returns beautiful pictures of
  somewhere else. It stays only where an illustration is admittedly generic
  (never a POI, a guide or an itinerary), and it must never be a fallback for
  a real place.
- **Third-party editorial sources (travel blogs, social media, tourism
  guides) are admitted, but never auto-published** (17/09/2026, committente:
  «possiamo prendere sia social, blog, guide, ma lasciamole come da
  verificare e alla fine le verifico io di persona e accetto»). Two
  different guarantees are at stake: a place's own official site or
  Wikipedia carries an implicit or known-CC license on its own photo — a
  blog or social post almost never does, on top of the usual wrong-place
  risk. So the tier split is: official site / Wikipedia → straight into
  `shared_pois.image_url` (see `scripts/foto-gemme-sito-ufficiale.mjs`);
  everything else → `foto_pois_da_verificare` (`stato='da_verificare'`,
  migration `20260917080000_foto_pois_da_verificare.sql`), invisible in the
  app until a human approves that exact row. Never write a third-party URL
  into `image_url` directly, no matter how good the name match looks.
- **Whoever hides a duplicate inherits its content first** (19/09/2026,
  committente: «avevo molte più foto giuste… evita che risucceda»). Mass jobs
  of 10–14/09 hid ~55,000 rows of `shared_pois` that carried a photo, without
  passing it to the row left visible — and for ~25% of them (≈14,000 real
  places) there was no visible row at all. Never hide or blank rows in bulk
  without (a) a record of the previous values and (b) inheritance onto the
  surviving row. The safety net: trigger `trg_doppione_nascosto_in_coda`
  (migration `20260919200000_doppioni_da_ereditare.sql`) notes every hidden
  row that had a photo or text in `doppioni_da_ereditare`; after any job that
  hides rows run `scratch/foto-dal-doppione-mondo.mjs --coda --tutti --write`,
  then the same with `--testi`. It does **not** copy blindly: a duplicate's
  photo was picked by coordinates and measured wrong 1 time in 4 (a castle
  with a church, a street in Naples, a cemetery, a bus), so a photo moves only
  if its **file name names the place** (`scratch/lib-foto-coerente.mjs`,
  test `scratch/collaudo-foto-coerente.mjs`), and a «text» that is an import
  label (`[Wikipedia Import] en:…`) or WIP filler is not a text. Twins with a
  *different* name within 40 m are not the same place often enough to trust
  (0–1 right out of 5 in the sample): don't match them.
- **Coordinates can be NaN.** 215 visible `unesco-…` rows have `lat`/`lon` =
  NaN (`location` = `POINT(NaN NaN)`): their bounding box «contains» every
  point on Earth, so any spatial join must add
  `lat <> 'NaN'::float8 AND lon <> 'NaN'::float8`.
- **No photo is better than the wrong photo.** Every renderer must survive a
  missing image. A place shown with someone else's picture is a printed lie,
  and it is worse than a blank space.
- The same rule governs text: a stop that does not exist, or exists in another
  city, blocks the itinerary — see `verifyItineraryAntiHallucination`, run by
  both the on-the-fly generator and the library pipeline.
- **A name from OUR database beats the model's, but only if it came from a
  source.** Measured 11/09/2026 on 106 confirmed hallucinated stops: the
  "esiste? e dove?" double question (below) only catches 20% — a real place
  named but put in the wrong city. The other 80% are a distorted or invented
  name **inside the right city** ("Basilica di San Nicola Pellegrini" instead
  of "Basilica di San Nicola", "Trg od Brasna" instead of "Trg od Oružja") —
  no atlas prompt catches those because the city answer is already correct.
  `agganciaTappeAlDatabase` (`server.ts`) now overwrites `titolo_tappa` with
  the DB name whenever a stop matches a `shared_pois` row well enough to link
  (`poi_id` set) but the AI's wording diverges (word-overlap jaccard < 0.7) —
  previously this rewrite only ran for meal stops. The DB row must come from
  a **source**, never from a user: rows with `category='community'` or an id
  starting `vision-` are excluded from the match — a community pin winning
  on proximity to a name is the same failure as the 210-photo incident of
  07/09/2026 (a script that wrote wrong photos by matching "closest file").

## Audioguide text: every sentence about THIS place, never filler

Fundamental rule, set 10/09/2026 after the Museo del Marmo di Carrara guide
came out generic in all three voices (Nicky, Dante, duet).

- **Every sentence must reference the POI or a concrete element of it** taken
  from the source material — a work, a room, a date, a material, a person, an
  architectural detail, a measurement. A sentence that would fit any other
  museum/monument/place ("a place rich in history", "an unforgettable
  experience", "worth a visit", "a unique atmosphere") is forbidden, not
  merely discouraged. No ceremonial openings or closings.
- **Minimum length 30-40 s of speech (≥ 80-100 words)**, more when the
  material allows. Length is earned with more facts from the material,
  never with padding. If there is nothing specific to say, use another fact —
  never a filler sentence.
- The rule lives in ONE place per pipeline and is injected into every
  character/register prompt: `REGOLA_SPECIFICITA` in
  `regenerateAudioguideText` (`server.ts`, covers Nicky, Dante, duet, breve,
  bambini and "Chiedi di più") and the matching block in
  `supabase/functions/manager-poi/index.ts` (audio_script_short/long). When
  adding a new voice, register or generation path, inject it there — don't
  paste a copy.
- Cached guides in `poi_audioguides` predate the rule: they only change when
  purged and regenerated.

## Museum guides: no empty stop, gaps are filled from the open web

Standing rule, set 19/09/2026 by the committente («può prendere il sito del
museo, un blog ecc. e riempire… deve essere una regola per le guide
future») after the Duomo di Milano guide came out with 4 stops without text
and «Opera (1500).» as the explanation of the stained-glass windows, and the
per-work button answered «nessuna fonte».

- **A stop never ships empty or with filler.** A `perche` under 60 characters
  («Opera (1500).», nothing) is a gap. Gaps are filled by
  **`cercaMaterialeWeb`** (`server.ts`, next to `testoDalSitoUfficiale`): the
  ONLY place that goes to the open web for a guide. It searches SearXNG (the
  droplet, free — never a paid search API), downloads the pages and returns
  the passage that names the work. Used by `/api/museums/artwork-guide` (when
  the direct sources are under 1,500 chars) and by the venue-guide generation
  (`venue_guide`, a post-pass over the stops with a gap: at most 4 on demand,
  12 when seeding). A new generation path MUST call it, not rewrite it.
- **Two tiers of source.** A = reliable (Wikipedia/Wikivoyage/Treccani/
  Europeana/Beni Culturali/UNESCO/Britannica, `.gov`/`.edu`, the museum's own
  site) — used as facts. B = blogs and third-party sites — marked «NON
  VERIFICATA» in the material, and the prompt says: take only what another
  section confirms or what describes what is visible; dates, names,
  attributions, measures and anecdotes found ONLY there are not said. A page
  counts only if it names the work (≥ 2 significant words) AND the museum.
- **Never copy.** Third-party text is copyrighted: facts are rewritten in our
  own words, the prompt forbids reusing phrases. The pages used are kept in
  the payload (`fontiWeb`: url, host, tier) so a guide can say where it comes
  from. No sales/social/UGC sites (Tripadvisor, Viator, Instagram…).
- **Still no invention.** If the web gives < 400 chars of material the stop
  stays as it is: the client never reads filler and never shows «nessuna
  fonte» (see `MuseumVisitSheet.handleOpera`: it falls back to the stop's own
  text, or composes name/author/year/room).
- Search the work with the title the user READS (`nomeAlt`, Italian) and the
  title of the source (`nomeFonte`, often English with the museum in front):
  Wikipedia's title match is ≥ 0.6, and only the Italian title finds
  «Vetrate del Duomo di Milano».

## Premium Guide: truth before length (20/09/2026)

Set after the Greve in Chianti guide of 05–13/09: of 61 dates written, 2 (3%)
were in the Wikipedia article of the place, and Podere Le Fornaci — a goat-cheese
farm — was described as a winery with three wines, an Etruscan tunnel and Jewish
refugees hidden from the Nazis. Cause: the prompt IMPOSED 450–600 words, 4–5
"mandatory" curiosities and an "insider tip known only to residents", even where
the material was two lines: the model fills from memory. Same rule as the
audioguide and the museum guides: **a minimum length applies only if the material
supports it; sources are searched first, the text is shortened only after.**

- `pgPreparaMateriale` (server.ts, above `/api/premium-guide/generate`) finds the
  material of every stop and classifies it: **ricco** (>1,500 chars: full text,
  description 300–450 words), **medio** (300–1,500: 110–220), **scarso** (<300: a
  40–70-word neutral card, no curiosities/insider/dishes, an honest "few verified
  facts" line). Order of sources: exact Wikipedia title of the name and of its
  parts («Castello Sforzesco e Parco Sempione» → «Castello Sforzesco»; the text
  must name the city) → `cercaMaterialeReale` (Wikidata QID / saved link /
  coordinates, official site, open web with tiers). **Never a geosearch article
  of another TYPE of place** (`pgTipiCoerenti`: «Duomo di Milano» used to land on
  «Piazza del Duomo»). Restaurants/bars/shops: no open web.
- The model sees only `materiale_verificato`, never the itinerary's own
  `attivita` (another AI's text) — `pgVistaModello`. Rules live in ONE text,
  `pgRegolePrompt()`, shared by the full guide and by `pgGenerateSingleDay`
  (free regeneration of a day): do not paste a copy.
- Transport: only from the Wikivoyage «Come arrivare/Come spostarsi» sections
  (`pgSezioniViaggio`); never say that a station, line or car park exists if it is
  not in the material.
- Post-filter, not just a prompt (`pgApplicaFiltro`, `pgFiltraTesto`): removes
  SENTENCES whose years, centuries, figures with units or high-risk legends
  (Leonardo, secret passages, awards, WWII…) are not in the material; length caps
  per level. The material's text is by other authors: rule 11 forbids copying, and
  `pgRiscriviCopiati` rewrites any description with ≥60% identical 8-word runs
  (measured before the rule: Museo civico del marmo 99%, Galleria 95%; after: ≤30%
  in most places). `content.qualita` and `poi.copia_pct/livello_materiale/fonte_url`
  record what happened.
- Measure with `scratch/genera-guide-prova.mjs` (local server, 20 credits/guide),
  `collaudo-guida-file.mjs` (levels, dates found in the source, copy %),
  `mostra-fonti-file.mjs` (which article each stop used) and
  `collaudo-filtro-guida.mjs` (the filter alone, no credits).

## Reference documents: the base of every guide, museum guide and itinerary (20/09/2026)

The committente approved three documents as THE reference («guide premium va bene così»,
«guide museo come questa», «itinerario perfetto anche pdf») and ordered that the rules that
made them are the base of everything generated from now on. Do not lower them; a new path
or a fix is measured against these files (kept by the committente on the desktop, folder
«marketing wip»):

| Product | Reference | Rules that made it |
|---|---|---|
| Premium Guide | `WIP - Greve in Chianti (nuove regole).pdf`, `WIP - Carrara (nuove regole).pdf` | «Premium Guide: truth before length» + the photo rules below + the print rules |
| Museum guide | `WIP - Duomo di Milano (PROVA nuova impaginazione).pdf` | «Museum guides: no empty stop» + «Audioguide text: every sentence about THIS place» + the print rules |
| Itinerary | the itinerary pipeline of 19/09/2026 and its PDF (`ItinerarioPdf`) | its prompt rules + the two fixed rules «giorni pieni» and «doppioni mai» (next section); any other change to `/api/groq/itinerary-stream` needs an explicit order |

**Photos in every guide (Premium and museum), all mandatory:**
- Only monuments, museums, viewpoints/panoramas and cultural places. **Never restaurants,
  bars, shops, markets** — whatever the source (database, official site, Wikipedia, Commons).
  Allow-list, not block-list: if the stop type is not cultural, no photo.
- The **cover is a photo of the CITY** (lead image of the city's Wikipedia article), never a
  logo, flag, SVG or the photo of the first place that happens to have one. No city photo →
  the cover goes without.
- A photo is used only if the place is really the subject: the article is that place, or the
  file name names it (`nomeCombacia`). Never «the first file within 250 m». Scans of books and
  newspapers (`page1-…djvu.jpg`, Internet Archive) are not photos of a place.
- Every request to Wikimedia carries `WIKI_UA`: with axios' default user-agent they answer
  403 and the photo phase silently found nothing (Milano, Parigi, Londra, 20/09/2026).
- Layout: whole, small, horizontal above the text, vertical beside it; only the cover is
  full-page (see «Print rules»).

**Text, in every document:** real facts from a source, level by material (rich / medium /
poor), never filler, never copied, checked by a second engine (next section). Characters
the PDF font has no glyph for are reduced to their base letter (`pulisci`, `ō`→`o`):
«Ōban» used to print as «BAM».

Regression: `python scratch/verifica-grafica-pdf.py <file.pdf>` must pass on every PDF before
it is handed over. On the reference files it flags Carrara p.2 (one glyph, fixed for future
runs by `pulisci`) and the Duomo PROVA (no page numbers: it came from a test script;
`generaPdfMuseo` numbers pages from page 2).

## Every generated document is checked by a SECOND engine and by measurement (20/09/2026)

Standing rule of the committente («DeepSeek produce, Groq o altro deve correggere e
verificare sia il contenuto che la grafica»):

- **Content: the writer never checks itself.** DeepSeek writes; a different engine
  (`excludeEngines: ['deepseek']`) re-reads each place against its material, marks the facts
  the material does not support and rewrites only those fields. Premium Guide:
  `pgRevisore` (server.ts, right after `pgRiscriviCopiati`); museum guides: the reviewer +
  rewrite in `venue_guide`; itineraries: `/api/itinerary/verify`. The outcome is written down
  (`content.qualita.revisore`: controllati / corretti / esito) — a reviewer that did not run
  says `non_eseguito`, it never passes silently. A new generation path MUST have one.
- **Which engine reviews (measured 20/09/2026).** `chiamaRevisore` (server.ts): first
  **`gemini-3.6-flash`** (other family than DeepSeek, careful, five keys with quota), then the
  normal fallback (Groq…) with no forced model; Agnes is out (minutes per long prompt).
  Gemini's quota is **per model**: the code's old default `gemini-3.5-flash-lite` was out of
  quota on 4 keys of 5, `gemini-2.5-flash` no longer exists (404). **Two models = two quotas
  (decided 20/09/2026):** `gemini-3.6-flash` ONLY for the reviewers and the final fallback (which
  tries `3.6-flash`, then `3.5-flash`); `gemini-3.5-flash-lite` (free tier: 500 requests/day per
  project) stays the general model for teasers, enrichment, vision… so the reviewer never takes
  calls from them. A guide review is ~10 requests (5–10k tokens each). The
  Groq keys are FOUR SEPARATE ACCOUNTS (committente; confirmed 20/09: one key at 199,445 of
  its 200,000 tokens/day while the others answered), so four daily limits; `tentaConRotazione`
  already tries the others when one is out and pauses the engine only when all are.
  `pgRevisore` sends the reviewer the SAME
  material the writer had (up to 7,000 chars — with 2,500 it «could not find» true facts and
  cut Tower Bridge from 485 to 214 words), 2 places per call, up to 6 calls in parallel, 75 s
  cap; Londra 3 days: 17/17 places checked, 5 corrected, text +3%, guide in 132 s (serial it was
  3/17 and 238 s). The podcast has the same reviewer (`/api/generate-daily-podcast`).
- **Dedicated keys, never in the rotating pool (committente 20/09/2026).** Five Groq and five
  Gemini accounts: each kind of work has keys of its own, so a background job can never eat
  the quota of a user who is waiting or of a reviewer.
  · **Gemini dedicated** = reviewers of itineraries, podcast, Premium Guide, museum guide:
    env `GEMINI_API_KEY_VERIFICA` (more: `…_VERIFICA_2`, `…_ONTHEFLY`, `…_ONTHEFLY_2`…), read into
    `geminiDedicate`, used through the `revisore: true` option of `callUniversalAi` (dedicated
    first, the pool only if they fail). The rotating pool is `GEMINI_API_KEY`, `_1`…`_8` only.
  · **Groq dedicated** = on-the-fly enrichment (photos and descriptions of pins and sheets) AND
    the audioguide: env `GROQ_API_KEY_ONTHEFLY` first, then `GROQ_API_KEY_ONTHEFLY_2`, `_3`… as
    fallbacks IN ORDER (`groqOnTheFlyClients`; then the pool), `groqOnTheFly` option, only with
    a real user waiting. The pool (`GROQ_API_KEY`, `_2`…) is what seeding and background scripts use.
  · Start with ONE dedicated key per kind; if it is not enough add another account (rename
    the env var as above) — nothing else to change. Gemini model: `gemini-3.5-flash`.
- **Graphics: measured, never eyeballed.** Every PDF goes through
  `python scratch/verifica-grafica-pdf.py <file.pdf>` before it is handed over: overlaps,
  near-empty pages, distorted or full-page photos (only the cover), photos off the page,
  missing page number / `wip.guide`. Exit code 1 = do not deliver.
- **Itinerary fixed rules (`/api/groq/itinerary-stream`).** Everything the prompt lists under
  «REGOLE STRUTTURA GIORNATA», «REGOLE LUNGHEZZA TESTI», «REGOLE INFO VIAGGIO» (lengths, tips,
  budget, the four sections…) plus the two rules the committente ordered back on 20/09/2026,
  after removing them the same day as a test («riinserisci queste 2 regole … mettile come
  regole fisse insieme a tutte le altre»):
  - **GIORNI PIENI** — prompt point 7, enforced by `riempiGiorniVuoti`: a day under three
    quarters of the median stops count, or missing because a block failed, is asked again
    (same prompt, places already used to avoid, 3 tries); trailing days that stay empty are
    dropped (`incompleto` + refund cover them).
  - **DOPPIONI MAI** — prompt point 8, enforced by `togliDoppioni`: one place appears once in
    the whole itinerary (key = `poi_id`, else the name words; hotels/returns excepted). It runs
    again after `agganciaTappeAlDatabase`, because the block dedupe compares the AI's names and
    the hook-up is what makes «place du Louvre» and «Musée du Louvre» one place (Parigi 20/09).
  - **DEEPSEEK CHOOSES WITHOUT SEEING OUR DATABASE** (committente 20/09/2026: «è sempre stato
    così la logica: deve cercare la miglior soluzione senza vedere il nostro database; le tappe
    che non ci sono nel database diventeranno poi nuovi POI»; prompt point 9). The prompt gets
    NO list of `shared_pois` or `locali_pois` (`ragInstruction = ""`, dining context off):
    DeepSeek picks the best places and restaurants from its own knowledge (guides, Michelin…).
    AFTER, `agganciaTappeAlDatabase` links each stop to the POI that already exists (name,
    coordinates, sheet) and the stops that are not in the database become new POIs
    (`PlanScreen` → `/api/poi/from-itinerary`, `source='itinerary'`, id `iti-…`, excluded from
    matches and from the sources). The list used to be ordered only by `is_gem`, so DeepSeek
    "preferred" small OSM buildings to the British Museum (Londra 5 days, 20/09). The hook-up
    never matches charging stations or car parks (`ocm-`, «Supercharger», «Q-Park»: the Tower of
    London was linked to a Tesla charger). Measured on Londra 3 days: British Museum, National
    Gallery, Tate Modern, V&A… and 13 rich / 4 medium / 0 poor places in the guide (before:
    8 / 3 / 26).
  - Known and left: new POIs are created by the CLIENT when the app opens the plan (an
    itinerary generated in the background queue creates them only once opened), with the
    AI's own coordinates, unverified — a Photon check by name is the next step, not done.
  - Nothing else in the itinerary pipeline changes without an explicit order.

## Print rules (itinerary PDF and Premium Guide)

Learned from the two PDFs of 22/08/2026. Check these before touching
`PrintView.tsx`, `PremiumGuideRenderer.tsx` or the print CSS.

- **Measure the page in `mm`, never in `px`.** A4 minus margins is ~272 mm of
  printable height; a container fixed at `850px` overflows and produces a
  trailing near-empty page. That was the itinerary's empty last page.
- **The title opens the page.** No eyebrow, no logo band above it: the top of
  the first sheet is the most valuable line of the document. `@page` top
  margin stays small (6 mm).
- **A printed PDF must say where it comes from**: `wip.guide` in the header.
  It ends up in the hands of people who do not have the app.
- **Printing means printing THE DOCUMENT, not the page.** `printScoped` hides
  the *other* printable documents; the rules in `index.css` hide the
  application itself (`visibility: hidden` on `body`, visible again only on
  the requested container). Without it the modal, the map behind and the tab
  bar end up in the PDF.
- **The file name comes from `document.title` on the browser-print fallback**,
  not from the `filename` we pass. Set it before printing and restore it
  after, or every guide is saved with the same name.
- Cover titles must scale with length: a fixed size eats half the first page
  when the title is long.
- **A photo is shown WHOLE and stays small; only the cover is full-page**
  (20/09/2026, Duomo di Milano guide: 15 photos out of 17 are vertical —
  statues, stained glass, portals — and the old `width:100% + maxHeight:62mm +
  objectFit:cover` band cut every one of them). Rule, in `src/lib/pdf/base.tsx`
  (`FotoIntera`, `riquadroFoto`): horizontal → above the text, reduced and
  centred (max 120×66 mm); vertical or square → vertical, **text beside it**
  (max 62×72 mm). The sizes come from `scaricaFoto` (`generaPdf.ts`), which
  also downsizes anything over 1600 px. Same rule in `MuseumGuidaPdf` and
  `GuidaPremiumPdf`. Check with `scratch/collaudo-pdf-museo.tsx`.
- **The react-pdf cover must not measure exactly one page.** With
  `height:'100%'` on the photo and on the title layer the engine put the photo
  on page 1 and the title alone on page 2; `wrap={false}` on the `Page` gives
  a blank page instead. Explicit sizes one point under A4 (595.28 × 840).
- **Never make a whole card unbreakable (`wrap={false}` on the artwork/POI
  block).** Found in production on the Duomo di Milano guide (20/09/2026): with
  real texts (2,000–4,000 chars) the card did not fit the space left, jumped to
  the next page and left half a page blank, and when taller than a page the
  engine squashed it (title over subtitle, a grey box in mid-paragraph). Only
  what is small stays together — header + photo (+ the sentences that fit
  beside a vertical photo) — via `FotoConTesto` in `base.tsx`; the rest of the
  text is a normal paragraph. The room band goes INSIDE that unit (a separate
  element was left alone at the bottom of a page; `minPresenceAhead` is ignored
  by this react-pdf version — do not rely on it). Test with **long** texts:
  `scratch/collaudo-pdf-museo.tsx` (env `COLLAUDO_LUNGHEZZE`) and
  `collaudo-pdf-guida.tsx`, then measure page fill / overlaps on the result.
  Known residue: a card whose photo block does not fit goes to the next page
  (gaps up to ~1/3 page, rarely more).
- **A museum guide always comes out of `generaPdfMuseo`.** The browser-print
  fallback (`MuseumPrintView`) is a plain list with no photos and blank
  trailing pages: `generaPdfMuseo` retries without the stop photos, then with
  no images at all, before anyone falls back to it.

## One archive, three entrances (20/09/2026)

`DownloadsScreen` is THE archive: five folders always visible (Itinerari,
Mappe, Audioguide, Guide Premium, Guide Musei), every row in the same form —
tap opens, the buttons underneath do the rest (Naviga · Racconto · PDF ·
Elimina). It is the same component in Profilo › «I miei download», Piano ›
«I miei itinerari» (`cartellaIniziale`) and Piano › Offline: do not build a
second list of saved itineraries or guides anywhere. Opening goes through the
`wip-apri-download` event (App.tsx → `wip-apri-itinerario-offline` /
`wip-apri-guida-premium` in PlanScreen, which read the offline copy first and
the account row otherwise). Printed PDFs are kept in `src/lib/pdfArchivio.ts`
(idb-keyval, 25 max) through the third argument of `saveBlobAsFile` and show
up in the folder of their document. The «ready» push/email names the exact
place (`testiPronta` in `server.ts`), and the tap lands in that folder.

`fetchCurrentPlan` (PlanScreen) restores the last plan **once, at mount**, and
never over a plan someone already opened (`pianoApertoRef`): it used to sit in
an effect keyed on `generatedPlan?.id`, so every itinerary opened was replaced
by the last modified one («si apre sempre Savona»).

## Environment

Local config goes in `.env.local` / `.env` (all `.env*` are gitignored). The server reads unprefixed names first and falls back to `VITE_`-prefixed ones for most keys.

Required for anything to work: `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`.
Feature-gated: `GROQ_API_KEY` (+`_2`/`_3` rotation), `DEEPSEEK_API_KEY`, `GONKAROUTER_API_KEY_ITINERARI` / `GONKAROUTER_API_KEY_MUSEI` (GonkaRouter, OpenAI-compatible relay at `api.gonkarouter.io/v1` — two SEPARATE accounts/keys, one per pool, never shared; the direct DeepSeek channel stays on-the-fly-only, but `deepseek-ai/DeepSeek-V4-Flash-0731` routed through Gonka is allowed in `background-script` jobs too, capped per pool by `GONKA_SEMINA_LIMIT_USD_ITINERARI` / `GONKA_SEMINA_LIMIT_USD_MUSEI` — default 20 each, matching each account's free signup credit; a caller must pass `options.gonkaPool` ('itinerari' | 'musei') or the engine is skipped; added 16/09/2026), `TOGETHER_API_KEY`, `GEMINI_API_KEY` (+`_2`/`_3`), `OPENAI_API_KEY`, `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/`AWS_REGION` (Polly TTS, added 12/09/2026 — falls through to the next engine when absent), `GOOGLE_TTS_API_KEY`, `ELEVENLABS_API_KEY` (+`ELEVENLABS_VOICE_ID_NICKY`/`_DANTE` to override the default preset voices), `FOURSQUARE_API_KEY`, `TRIPADVISOR_API_KEY`, `VITE_MAPBOX_TOKEN`, `VITE_CARTO_API_KEY` (basemap tiles — CARTO stopped serving anonymous requests 26/08/2026, free key from carto.com/basemaps/apikey/, 5M req/month, commercial use allowed), `GEOAPIFY_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`, `UNSPLASH_ACCESS_KEY`, `TICKETMASTER_API_KEY`, `VIATOR_API_KEY`, `GYG_API_KEY`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `SENTRY_DSN`/`VITE_SENTRY_DSN` (error tracking, added 30/08/2026), `POSTHOG_API_KEY` (product analytics, added 30/08/2026) — see "Monitoring" below.

Read-only keys for the admin "Diagnostica" → Monitoraggio esterno panel (`/api/admin/monitoring-status`), separate from the write keys above and each optional independently: `CHECKLY_API_KEY`/`CHECKLY_ACCOUNT_ID` (same values used locally for `npx checkly deploy`, also needed server-side here), `SENTRY_AUTH_TOKEN`/`SENTRY_ORG_SLUG`, `UPTIMEROBOT_API_KEY`, `POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID`.

Ricerca web nella lingua locale per la scheda Eventi (`/api/events/portali`, 07/09/2026): il fornitore si sceglie dalla chiave presente, `BRAVE_SEARCH_API_KEY` (Brave Search API) oppure `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX` (Google Programmable Search su tutto il web). Senza chiave la ricerca è spenta e restano i portali del registro `src/data/fontiEventi.ts`. Cache 7 giorni per query, tetto di 40 città «fredde» al giorno.

Ricerca web per i MUSEI (sale e piante, `/api/admin/museums/web-search`, 12/09/2026 sera): passa da SearXNG auto-ospitato sul droplet 104 (`SEARXNG_URL` + `SEARXNG_TOKEN`, header `X-Searx-Token`), gratis e senza crediti; la rotta lo sceglie da sola quando la variabile esiste, con ripiego su `BRAVE_SEARCH_API_KEY_MUSEI` e poi sul fornitore degli Eventi. Brave resta agli Eventi.

Affiliazioni Klook e Trip.com (07/09/2026) sono costanti in `klookCities.ts` (`KLOOK_AID`, `KLOOK_ADS`: un widget per città creato nel pannello affiliati) e `eventiFeed.ts` (`TRIPCOM_ALLIANCE_ID`, `TRIPCOM_SID`); non sono chiavi segrete.

Routes degrade to an error response rather than crashing when a key is absent.

## Monitoring (added 30/08/2026)

Three independent layers, none required for the app to run:

- **Internal canary** (`server.ts`, `/api/canary/run`, Vercel cron `0 5 * * *`) — tests 17 external services (Groq, Stripe, Azure, DeepSeek, Gemini, Mapbox...) plus AI monthly budget and a geofencing replay simulation. Snapshot + 30-run history in `api_cache` (`canary_last`/`canary_history`), read by the admin "Diagnostica" tab. On a check that turns red for the first time, it now also calls `logSystemError('critical', ...)`, which forwards to Sentry if configured (below) — before this it was only visible by opening the admin panel.
- **Sentry** (`SENTRY_DSN` server, `VITE_SENTRY_DSN` client) — real-time error capture, not just once a day. Both funnels through the *existing* single points (`logSystemError` server-side, `errorLogger.ts` client-side, which already dedupe/rate-limit) rather than Sentry's own automatic global handlers, to avoid double-counting on the free plan (5,000 errors/month). `tracesSampleRate: 0` everywhere — performance tracing isn't the point here. No session replay wired up on purpose: the map shows live GPS position, recording sessions there needs per-screen masking first.
- **Checkly** (`checkly.config.ts`, `__checks__/`) — external synthetic checks from outside Vercel: an API check on `/api/health` every 5 min, a Playwright browser check on the homepage every hour. Catches what the internal canary can't (DNS, cert, Vercel down, a broken deploy). Needs `npx checkly login` once (interactive, only the account owner can do it) then `npx checkly deploy`; `npm run checkly:test` runs the checks locally without publishing.
- **UptimeRobot** — external, no code: a monitor on `https://www.wip.guide` set up directly in its dashboard, not part of this repo.
- **PostHog** (`POSTHOG_API_KEY`, server-side only, `eu.posthog.com`) — product analytics, a real gap: before this the app had zero visibility into user behavior beyond `api_usage_logs` (AI/TTS *cost*, not product events). `capturaEvento()` in `server.ts` wraps `posthog-node`; deliberately NOT autocapture (an app with millions of POIs would blow through the 1M events/month free tier in days tracking every view) — three events picked by hand at the money-adjacent chokepoints: `credits_purchased` (in `creditPurchase`, the single function both Stripe's and RevenueCat's webhooks call), `audioguide_generated` (`/api/tts/smart`, cache-miss only — a cache-hit is a replay, not a product signal; the `preloadOnly` background-prefetch branch is excluded, it's not user intent), `quota_exceeded` (same route, the 429 branch — the actual funnel friction). No session replay, no autocapture, starting deliberately small.

`/api/health` (new, public, rate-limited) is the cheap endpoint for external monitors: one lightweight Supabase select, no paid API calls — unlike the canary, it's safe to hit every few minutes.
