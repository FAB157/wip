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
- **A card is generated ONCE, every route is cache-first** (26/09/2026, committente: «ciò che il primo utente vede
  resta, il secondo usa la cache — pin, descrizioni, audioguida, su tutto»). `/api/poi/enrich` (also `fast`, the
  mode PoiDetailSheet always uses) answers `cached:true` when the row has ≥ 60 chars of text in the requested
  language (the LONGEST of description_short / description_long / description_ai — many rows have text only in
  `description_ai`) and a photo or a fresh `enrich_foto_cercata_<id>`; `enrich-stream` hits cache on the longest of
  the three fields (> 80). «Searched, nothing» is remembered 14 days (`enrich_vuoto_v2_<id>`, also when the card is
  only the data line or < 60 chars). A data line NEVER overwrites existing text and an existing
  description_long/description_ai is never replaced. The audioguide takes the LONGEST saved text as material,
  never the first (a 155-char poi_details.summary used to hide a 1,049-char text → «no_material»). `force:true`
  (admin/scripts) regenerates.
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

#### When the guide fires — the rules of 03/10/2026 («come Google Maps / Mappe»)

Orders of the committente, all in force, identical on web, Android and iOS:

- **Radii are the user's, nothing else**: arrival 30 m on foot / 50 m by car, alert 150 / 300 m
  (`radiiForTransport`, `RaggiFiducia.calcola`, `PoiRadii.effettivi`). The calibrated DB radii
  (`geofence_radius`, `alert_radius`: 66% of rows had 80/200), category defaults and the gem bonus no
  longer widen anything — with them the guide fired 69–119 m from the arrival point on 60 routes of 60.
- **Measured from the ARRIVAL POINT** (arrival → entrance → address point → centroid), the same point
  the navigator targets.
- **In metres of ROAD, never straight line** («linea d'aria mai»). `src/lib/geofencing/distanzaStrada.ts`
  (ports: `RoadGraph.kt`, `RoadGraph` at the bottom of `RoadSnap.swift`) turns the polylines of
  `/api/roads/tile` into a graph: (GPS → nearest way) + shortest path + (way → arrival point).
  Junctions lost to the server's simplification are rebuilt (crossing segments, ends landing on another
  segment). ONE rule of use for every caller, `distanzaCheDecide` / `cheDecide`: road known → road
  metres; no known road within 120 m (tile not downloaded) → direct distance, the only exception;
  within 15 m of the point you have arrived anyway (guard against holes in the data).
  **On foot the network is foot ∪ car**: the pre-extracted «foot» tile holds only pedestrian classes.
  Tests: `scratch/collaudo-distanza-strada.mts` (synthetic, 18 checks),
  `collaudo-distanza-strada-vera.mts` (against OSRM on production tiles),
  `simula-trigger-strada.mts` (where it fires on 20 places).
- **The «extra» road tiles**: `generate_road_tiles.py` never extracted `service`, `cycleway`, `road`,
  `corridor`, `platform`, `bridleway` — Rome centre matched OSRM on 10 pairs of 20. They are ADDED as a
  third file per cell, `x{gx}_y{gy}_extra.json.gz` (`scripts/offline_routing/strade-extra-*`: Geofabrik
  extract → `osmium tags-filter` → 1° shards → tiles → slow upload that stops when `/api/health` fails),
  and `/api/roads/tile` merges them (all into `foot`, `service`/`road` also into `car`; the answer says
  `extra: true`). With them Rome centre: 24 of 25, none unreachable. Never a client heuristic for a
  missing link.
- **Islands**: a component of the network with less than 150 m of ways (a path inside a courtyard, an
  indoor corridor) is never snapped to (`STRADA_ISOLA_M` / `ISOLA_M` / `isolaM`) — the Pantheon's
  arrival point snapped to one and the alert came at 17 m instead of 150.
- **Roads are downloaded when a route is created, and offline** (committente: «le tiles devono essere
  scaricate quando si crea un percorso, con o senza audioguida, anche nelle funzioni offline»).
  `prescaricaStrade(points)` in `src/lib/roadSnap.ts` fetches every tile along the track (keys on the
  0.01° grid of the server cache, max 150 per call, 400 kept, 30 days fresh) into IndexedDB (idb-keyval,
  `wip-strade:<key>`) and hands the same keys to the native cache through the plugin method
  `prefetchRoads` (`RoadSnap.prescarica` in Kotlin and Swift, one file per key in `road_tiles/`).
  `refreshRoadTile` / `RoadSnap.refresh` fall back to the saved tile when the network fails. Called
  from: tour creation and resume (`tourService`), every route of the navigator (`setRoute`), the
  itinerary offline package (`pacchettoOffline`), offline map areas (`prescaricaStradeArea`). A new
  route type or offline function MUST call it.
- **With a route, the route decides**: tour stop arrival and «metres to the stop» use the metres left
  along the track plus the last metres from the road to the door (`tourService`: `metriStradaAllaTappa`
  + `codaTappa`); encounters, the navigator's places, the approach banner and the lists go through
  `metriDiStrada` / `metriDiStradaDaMostrare` (`src/lib/roadSnap.ts`).
- **The «30 m from the wall» rule only for places without a door** (squares, parks, bridges,
  viewpoints, beaches, archaeological areas…): `luogoSenzaPorta` / `Footprints.senzaPorta` /
  `PoiFootprints.senzaPorta`, same list in the three files. For buildings, churches and museums only
  the arrival point counts.
- **No prediction**: `PredictiveTrigger` no longer announces ahead (it returned FIRE up to 22 s before
  the passage); it still supplies `tCpa` to `hasPassed` and to the armed window.
- `/api/roads/tile` serves every grid cell touched by the box (it used to serve only the one
  containing the point: near a cell edge the network stopped there), clipped to radius + 800 m around
  the cache key instead of the whole 5.5 km cell.

#### Which place speaks, and what it costs — web engine, 04/10/2026

Found with the virtual test (Admin › Diagnostica › «Test virtuale», `src/lib/testVirtuale.ts`:
a fake phone walking inside the real web app) on Rome and Milan. Born on the web
(`foregroundTriggers.ts`) and **ported to Kotlin and Swift on 05/10/2026** (`object Arbitrato` in
`GeofenceManager.kt`, `enum Arbitrato` in `PoiModels.swift`: weight, score, bare name, duplicates,
«never over a guide», the longer of two road measures); the plaque rule followed on 08/10/2026
(`eTarga` / `targheConMonumentoVicino`). Web only by design: the safety net for important buildings
and the 3 s / 10 s pause after a guide (natives keep 20 s). The three must stay in sync.

- **A place with a source outweighs one without.** `pesa(poi)` = gem, or `source` from
  Wikipedia/Wikidata (+25 m in the arbitration). A place that does not weigh yields when one
  that does is approaching within 100 m of road (in front of the Pantheon a plaque used to
  speak, in Piazza Navona a bar).
- **Duplicates fall silent together**: same bare name (`nomeNudo`) within 150 m of the winner
  enters the cooldown with it (the Pantheon has ten visible rows).
- **The 90 s silence has two exceptions**: a place that weighs may speak as soon as the
  previous guide has STARTED and FINISHED (20 s minimum); and whoever was within the radius
  but got stopped (silence, compass gate) stays `inAttesa` and speaks standing still.
- **A snap is not trusted alone**: if the road snap moved the fix more than 5 m, the distance is
  also measured from the unsnapped point and the LONGER of the two decides.
- **Cost per fix** (measured: 73 ms and one long task per fix, CPU blocked 22% of the time →
  ~20 ms, 3%): no re-evaluation under 3 m / 4 s; the road search stops at alert radius + 80 m
  (it was 450/700 m); candidates over 500 m are skipped (not the doorless ones); footprints are
  requested in groups, at most every 10 s. Do not put per-candidate network or graph work back
  into the per-fix loop without measuring it with the test.
- **Turn bursts**: maneuvers less than 15 m apart are merged into one sentence («…, poi subito
  …») where the steps ARRIVE — `accorpaManovreVicine` (WIP Nav) and `accorpaPassiGrezzi`
  (tours, called in `tourService.chiediRotta`) in `osrmService.ts`; the native follower gets the
  already-merged list. Test: `scratch/collaudo-svolte-a-raffica.mts`.
- **The audioguide follows the SETUP, not the map chips (05/10/2026)**. Profilo › Categorie
  audioguida shows six switches (monumenti, musei, panorami, natura, chiese, consigli) and
  «Gemme: sempre attive» with a locked checkbox. But the same storage
  (`wip_active_subcategories`) is also written by the map chips (`MAP_FILTER_KEYS` in App.tsx,
  `gemme` included): hiding the gem pins silently muted their audioguides — the Trevi Fountain
  was mute and its empty duplicates spoke. Now `isCategoryAllowed`: a gem ALWAYS speaks (as on
  the natives, where only the `gemme:off` sentinel of navigator mode stops it — and there a gem
  now falls back to its own category, `CategoryMap.isActive` / `PoiCategories.isActive`); a
  setup key never touched takes ONE default, `PREDEFINITI_AUDIOGUIDA` (monumenti, musei, chiese
  on; panorami, natura, consigli off), read by the logic and by the setup through `sceltaSetup`
  — an absent `panorami` used to speak while its box looked empty. Test:
  `scratch/collaudo-categorie-setup.mts` (27 cases).
- **GeoControl distances are the user's, everywhere (05/10/2026)**. Four values, each with its
  own control in Profilo (`DISTANCE_CONFIG`: alert walk/car, arrival walk/car — until today one
  control wrote the SAME arrival for foot and car). Read through `radiiForTransport` by the
  web triggers, the navigator (places along the route AND the destination arrival, which used a
  fixed 30 m), the tour (`sogliaArrivo`: user radius for door/street points, no more +10/+25;
  only a bare centroid keeps the wide threshold or the tour would stall) and the native start
  parameters. Always compared with ROAD metres (`distanzaCheDecide`). The tour's short teaser
  (state IN_ARRIVO) follows the walking ALERT too (`sogliaAvviso`, 150 m by default — it was a
  fixed 80 m — never closer than arrival + 20 m). Not from GeoControl, by design: the
  encounters corridor. Test: `scratch/collaudo-distanze-geocontrol.mts` (37 cases).
- **Out of «Monumenti» for the audioguide** (committente 05/10/2026): library, theatre,
  opera_house, train_station, stadium — on the map and in the sheets, silent unless gems. Same
  list in `guideSettings.ts`, `CategoryMap.kt`, `PoiModels.swift`.
- **What the tests of 05/10/2026 added (Rome, Florence, New York — web engine)**:
  · *Never over a guide*: no place fires while a guide is playing or has been requested and has
    not started yet, and 20 s must pass after it ends (`ultimaVoceVistaTs`) — the 90 s used to
    count from the trigger, and a text that arrived 65 s late was talked over.
  · *Standing still counts*: the browser sends no fixes to someone who does not move, so the
    last fix is re-evaluated every 5 s while someone is `inAttesa` (`rivalutaDaFermi`) and when
    the list of places arrives (`rivalutaConNuoviLuoghi`); a place already within the radius at
    first sight enters `inAttesa` (opening the app in front of a monument used to be silent).
  · *Another engine's trigger* (navigator, destination arrival) carries its `nome` in
    `__wipLastPoiTrigger`: the same bare name stays silent for 10 minutes, and after it the full
    90 s apply (`ultimoEsternoTs`).
  · *The guide is prepared at the alert radius* on the web too: the nearest approaching place
    gets `getOrCreateAudioguideText(..., { incrementPlay: false })` (no charge, no play count,
    once per place, 3 per minute) — `poiApproaching` only ever came from the native service.
  · `getGeofencePois` halves the radius (down to 400 m) when the answer hits the 1,000-row cap.
  · Tour: at the END of the leg you have arrived, even if the door is farther than the radius
    from where the road stops (`tourService.aggiorna`) — Palazzo Vecchio, 36 m, kept the tour
    at stop 1.
  · WIP Nav: no pre-announcement within 8 s of the last phrase, none for a «continue straight».
  · *Who is speaking is read from the audio itself*: `getAudioState().isPlaying` and
    `wip-audio-state-change` do NOT tell when the sheet's guide plays. `ascoltaLeVoci` follows
    every media element that starts (`unaVoceSuona`, exposed as `window.__wipVoceInCorso` for
    WIP Nav and the destination arrival). After a guide: 10 s pause, 3 s if a place that weighs
    is waiting.
  · *Plaques stay silent near a monument* (committente 05/10/2026, Paris): `eTarga` (category,
    `plaque-…` id, name) + `monumentoVicino` (a non-plaque candidate within 100 m). Far from
    monuments a plaque speaks as before; a gem is never «just a plaque».
  · *Safety net for important buildings* (committente 05/10/2026, «rete sicurezza ok»): the
    «only the arrival point counts for buildings» rule stays, but ON FOOT a building that
    weighs (`pesa`: gem or with a source) also fires within 30 m of its WALL (`reteSicurezza`,
    same branch as the doorless places). Computed entrances are right about 4 times in 5 and a
    wrong one meant silence (Notre-Dame had its point on the north side). Not in the car, not
    for buildings without weight. Web only.
  · *A line is not a guide*: on an automatic trigger `PoiDetailSheet` does not read a text
    under 80 characters (the gem «Île de la Cité» spoke its 23-char short description).
  · *Encounters along a tour must be worth the voice* (06/10/2026, Madrid: in 300 m the tour
    announced «100 Montaditos» — a sandwich chain filed as a square —, «Madrid card», Plaza Mayor
    in Japanese, a cathedral of Oviedo and a stop just told): `tourService.candidatiLungoIlPercorso`
    keeps only places that weigh (gem / premium / wiki source), with a Latin-script name and not
    already a stop by name. Day 1 had 34 «Sulla tua strada», day 2 after the rule: 0.
  · *The itinerary stream must never go silent* (06/10/2026): after the last token the server
    runs hook-up + verification + fact reviewer (up to ~75 s) and the client closes a stream
    silent for 45 s (STREAM_TIMEOUT → error toast, form shown, POIs created from the PARTIAL
    plan). `itinerary-stream` now writes `{ping}` every 10 s in that phase, and PlanScreen turns
    stops into POIs only when `plannerMode === 'view'` and the plan has the server's `id`.
  · *Two hidden flags*: `status='hidden'` AND `is_hidden=true` both remove a row from
    `get_geofence_pois`. Before hiding a duplicate, check that the row you keep has
    `is_hidden` false (the Sainte-Chapelle disappeared for an hour that way).
  · *Public transport on long legs* (06/10/2026, committente «Punto 1 ok» + «Accetto proposta»):
    legs ≥ 1.5 km get a «🚇 Mezzi» button (Google Maps `travelmode=transit`, `src/lib/mezziPubblici.ts`)
    with its legend, in `ItineraryStop` (`legToNext.da/a`) and in the tour dashboard (`TourBanner`);
    and the server writes ONE line per long leg from **Transitous** (`mezziPerTratteLunghe`, after
    `ordinaTappePerStrada`, also in «Aggiungi giorno»): `tappa.mezzi_precedente` = «In alternativa coi
    mezzi: bus 728 da Cais Sodré, 7 fermate, scendi a Mosteiro Jerónimos (~16 min)», 7 languages
    (`fraseMezzi`), cache 7 days (`mezzi_v2_…`), never to meals, no answer → no line (never invented). Rendered
    as-is by the app, PrintView and `ItinerarioPdf` («Mezzi pubblici ·» label). Committente, same evening:
    «se più 1,5 km sempre consiglio mezzi su pdf e sempre tasto mezzi google» — NO convenience filter: the
    line is always written above 1.5 km; it picks the SHORTEST itinerary with fewest transfers (the first one
    was «bus 21, 13 stops, 54 min» in Antwerp when tram 7 + bus 17 took 45) and states three times — on board,
    door to door (Transitous counts the walk to the stop and the waits) and on foot (distance ×1.3 / 80 m/min)
    — so the reader decides. Lyon: 3 legs of 3 got a line; Antwerp: 1 (Middelheim, 4 km).
  · *Lyon test, 06/10/2026*: the tour's deviation recalculation (`tourService.ricalcola`) now passes
    `ordina: false` — it used to let the server re-sort the remaining stops by distance (dinner became
    stop 3 at 11:00). `candidatiLungoIlPercorso` also drops one-word generic names
    (`NOME_INCONTRO_GENERICO`: «Immeuble» ×5, «Maison»), city rows, names already announced in this
    tour (`nomiIncontrati`) and names contained in a stop's name («Musée des Beaux-Arts (Lione)»).
    `agganciaTappeAlDatabase` never links a `gtfs-` stop (not only in `rigoroso`). `/api/poi/from-itinerary`
    stores NO `description_ai`: the itinerary's `attivita` is DeepSeek prose from memory and, being the
    longest text, it became the audioguide's material (988 of 989 `source='itinerary'` rows still carry
    it — cleanup needs an order). `mapItineraryCategoryToMapCategory` sends experiences/VR/shopping/spa to
    `locali`. PlanScreen's post-itinerary enrich waits 75 s (full mode takes up to 52 s).
  · *Los Angeles test, 07/10/2026 (committente: «non deve mai succedere»)*:
    - **The reference point can be a homonym.** The client geocoder gave a «Los Angeles» in Texas: all
      11 stops were «⚠ a ~1987 km dalla destinazione», and the saved plan kept the labels. Now
      `/api/geocode` ranks place candidates by Nominatim importance (`geo_importanza_<md5>`) for
      `limit ≤ 2`; `verifyItineraryAntiHallucination` moves the reference to the stops' centroid when
      most stops are far from it but within 40 km of each other; a re-verification CLEARS a stale
      «⚠ Coordinate a ~» flag; `mergeVerificationMarks` copies cleared marks and `salvaMarchiVerifica`
      writes them back to `user_itineraries`. `resolveDestCoords` accepts a label that starts with the
      destination («Los Angeles, California»).
    - **A product is not a place.** «Tour privato in autobus di Hollywood» (tipo esperienze, 352,99 €)
      was stop 1 of the day, became a `monumenti` POI (`iti-…`) with the Wikipedia text of Hollywood, the
      photo of the sign and an audioguide, and the navigator «arrived» there. `NOME_PRODOTTO_NON_LUOGO`
      (poiRepository, same regex in `/api/poi/from-itinerary`): tour / biglietto / escursione / noleggio /
      crociera / hop-on hop-off… never become POIs (`tappaDiventaPoi(tipo, nome)`); `esperienz` (plural
      too) maps to `locali`. In the generator, Viator products above 120 € (60 € on a low budget) and
      transfers are only a «🎟 Per chi vuole spendere» suggestion, never a stop. Existing `iti-` product
      rows: `/root/iti-esperienze-conta.cjs [--write]` on Oracle (copy in
      `/root/citta/nascosti-iti-esperienze-2026-10-07.jsonl`).
    - **A `cine-` row whose name is CONTAINED in the AI's name is a more generic place, not the same
      one**: «Hollywood Walk of Fame» was linked to `cine-Q34006` «Hollywood» (the district) — name
      shortened AND coordinates moved 1 km. `agganciaTappeAlDatabase` skips the link entirely.
    - **Standing still must re-evaluate.** In front of the TCL Chinese Theatre (27 m, stopped) the compass
      gate said «rimandati: alle spalle» and no evaluation followed for 5 minutes: the browser sends no
      fixes at rest and `rivalutaDaFermi` ran only while `inAttesa` was non-empty (cleared by any
      stop/start of the engine — tab change, settings). Now it re-evaluates the last fix every 5 s
      regardless, `stopForegroundTriggers` keeps `ultimoFix`, a restart re-evaluates after 1.5 s, and an
      exception in `onLocationUpdate` is written to `__wipDiagTrigger` when the test is on. Every early
      exit of the engine is now a diagnosis too (`diagUscita`: feature flag, audioguide off, giro, navigator,
      accuracy, no candidates, «nessun luogo eleggibile (N caricati, M seguiti)»), and `__wipBattitoFermi`
      says when the standstill heartbeat last ran — verified at the TCL: evaluation every 5 s at rest.
    - **The virtual test follows the single-stop navigator too**: Itinerario › Naviga › WipNav is
      `useWalkingNavigation`, not `tourService`; `testVirtuale` listens to `wip-nav-route` and «Segui il
      giro» walks that route when there is no giro. Advancing to the next stop needs the Day Pass (by
      design): without it, walk by tapping the map.
    - Seen and left: a gem shopping mall (`wd-shop-Q8253778` Ovation Hollywood, `is_gem`) speaks like any
      gem; the «Gemma a 31 m dal percorso» banner of the navigator stayed on screen 1.3 km after the gem
      was passed; `savePlanToSupabase` still upserts stop POIs client-side with the anon key (RLS blocks
      it; the server route is the real path).
- **Data, not code**: 2,021 Wikidata places had been marked `needs_revision` by mass jobs of
  14 and 26/09 (the good rows of Pantheon, Piazza Navona, Duomo di Milano) and were therefore
  out of map and audioguide (`get_geofence_pois` excludes that status); restored on 04/10, old
  status in `/root/citta/ripristino-needs-revision-2026-10-04.jsonl` on Oracle. A job that marks
  rows `needs_revision` silences them: never on a place's best row without a visible twin.

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

## Never save what the model said ABOUT the task — only the task's result (04/10/2026)

Standing rule of the committente («che non succeda più — fai regola»), set after reading the cards of the
Carrara pilot: the Dante audioguide of Castello Aghinolfi was «Devo fare una narrazione in italiano… Devo
rispettare le regole…», the Nicky one of Castello Malaspina was the prompt copied back, 259 of the 31,000
audioguides of the Italian cultural places in production began with «<think>Let me analyze the material…», and
552 descriptions were the model's refusal («Non essendo disponibili informazioni specifiche, non posso fornire
dettagli precisi…»). DeepSeek through Gonka sometimes returns its plan instead of the text.

- **Three detectors, module level in `server.ts`** (next to `fotoDArchivio`): `ragionamentoDelModello` (think
  tags, the prompt's own headings, «Devo…», «Let me…»), `rifiutoDelModello`, `narrazioneSenzaPensiero` (strips a
  closed `<think>…</think>` block: what follows is the real answer).
- **The single save points refuse them**: `salvaAudioguidaInCache` (the ONLY place a narration enters
  `poi_audioguides`) and the save block of `/api/poi/enrich`. `regenerateAudioguideText` asks once more and then
  returns empty — the caller answers `non_generata`, nothing is stored.
- **Existing ones are redone, not trusted**: with `ricontrolla: true` the routes treat a saved text that is
  reasoning/refusal as `fonte_sospetta` (discarded even if nothing better is found), like every source ending
  in `_internal` or starting `agnes_free` (the model wrote from memory).
- **«Descrizione deve essere descrizione»**: the audioguide's speech is never copied into `description_long`
  (both PATCHes off); a detailed description that is speech (`dettagliataParlata`) is redone. An audioguide MAY
  open with «Benvenuti».
- **A story is never cut** («non deve mai troncare una storia», same day). «Le lunghezze possono essere allungate
  per finire la storia — sempre!»: the lengths in the prompts are a guide, never a cap (`STORIA_INTERA` in
  `regenerateAudioguideText`: tell the story up to the LAST fact of the material; if choosing, drop minor details
  of an era, never the final eras). No code cuts or shortens a narration because it is long. A narration or a detailed description
  that does not end with a closed sentence (`narrazioneCompleta`) was truncated by the model: it is not stored
  (`non_generata`) and an existing one is redone (`testo_troncato`). `accorciaBreve` shortens the SHORT description
  by whole sentences only. Known and open: the source material is still capped by characters in several places
  (a quote at the cap arrives cut) — cut material at a sentence boundary when you touch those caps.
- **Only what passes every rule reaches production.** The offline pipeline writes place by place:
  `riscrivi.mjs` («CANCELLO») skips any place with a refusal/reasoning text, a spoken description, a stock photo,
  a memory source, a truncated text or a raw-material audioguide, and lists it with the reason.
- **Few facts, if real: write less, but write** (05/10/2026, committente: «anche se ci sono pochi fatti, se reali,
  scrivere meno ma scrivere — imposta regola; sia descrizioni che audioguida»). A short card with ONE true fact is a
  card: `/api/poi/enrich` no longer drops a new text because «it has fewer than two details» (only zero concrete
  facts, or a leftover formula, drops it), and when the reviewer contests more than a third it keeps the part the
  material supports (`revisore.esito = 'accorciata'`, ≥ 150 chars, closed sentences) instead of discarding the whole
  card. The audioguide already speaks from 100 chars of real material. What still yields nothing: no source at all
  (only the data line), a refusal, the model's reasoning.
- **A forbidden formula is removed even inside a sentence with a fact** (same day: Carrara went to production with 28
  descriptions and 27 narrations still saying «punto di riferimento»): `togliFrasiVuote(..., severa = true)` at both
  save points, one formula is enough for `frasi_fatte` in `motivoRipassoScheda`, `*`/`#`/`~` are stripped from cards
  and narrations, and the gate of `riscrivi.mjs` stops formulas, symbols, prose without a source, a detailed card
  without the short one.
- **The «comune» rule: a card written from web pages must NAME the place's town** (07/10/2026, committente: «esatto,
  con la nomina del comune o città o zona siamo coperti»). In the Carrara batches 96 web-sourced cards of 317 were
  about a HOMONYM elsewhere («Cappella» in Minucciano described as the Sistine Chapel, «Chiesa di San Bartolomeo» of
  Carrara as San Bartolomeo all'Isola in Rome, «La Forbice» of Massa as a pizzeria in Velletri) and went to production:
  true, well-written text about another place — no fact-checker catches it. Cause: the «official site» found by
  search (`sitoUfficialeViaRicerca`) only had to name the place twice, never the town. Now, three layers: (1)
  `materialeWebPerPoi` — no town, no site search; a site found by search counts only if the page names the town (a
  site DECLARED on the row is still trusted); (2) `/api/poi/enrich` — a new text built from web material that does not
  name the town (`ancoraLuogo`: town, else region) is not saved (`diag.fuoriPosto`), and `regoleMaterialeWeb` tells the
  model to return empty if the material is about the same name in another town; (3) the gate of `riscrivi.mjs` — a
  `fonti_web` card without a declared source that does not name the row's town never reaches Supabase. A region alone
  is too wide when the town is known. Measure before every write: `/root/locale/fuori-posto.sh`. Open: Wikipedia pages
  that mention the place but are not ABOUT it (Monte Belgia written from the English article «No Cav»).
- **The «tema» rule: a card must describe THE PLACE** (07/10/2026, committente: «scrivi regola»). The town rule stops
  the homonym elsewhere; what is left is the page of the RIGHT town that talks about something else: «Bocca di Magra»
  (a river) described as a hotel nearby, the monument «La donna nella Resistenza» turned into an essay on women in the
  Resistance, the Mazzini monument into Mazzini's biography, Monte Belgia written from an article on the No Cav
  movement. `schedaParlaDelLuogo` (server.ts, above `revisoreTestoLuogo`): one question to a light engine (Gemini lite,
  then Groq/Gonka) — does the card describe what the place is, where, how it is made, who made it, what it holds? —
  asked in background whenever the source was NOT declared on the row (found on the web, by name or by coordinates);
  `fuori_tema` → not saved (`diag.fuoriTema`), `non_eseguito` is written down, never a silent pass. A monument to a
  person may say who the person was, but must also describe the monument. The same sentence is in
  `regoleMaterialeWeb` and in the short-card prompt.
- **Secondary places get a SHORT card from Mistral, and a second lane** (07/10/2026, committente: «si può usare per i
  POI secondari con scheda corta?», «vai con la seconda corsia»): in background, a place with < 1,500 chars of material
  and no Wikipedia article of its own gets a 3–6 sentence card from `mistral-code-latest` (free tier, 125 req/min;
  measured on ten real places: 10/10, no year outside the source, 10% copy like Gonka, 3 s) — `MISTRAL_SCRIVE_SECONDARI`;
  Gonka keeps the places with their own article. `ministral-8b` embellishes and breaks the format: not used.
- A new generation path that stores model output MUST pass it through these detectors. The offline pipeline
  repeats them in SQL as a last gate before writing to Supabase (`/root/locale/riscrivi.mjs`, «GUARDIA»), and
  `verifica-regole.mjs` counts them: zero is the only acceptable number.

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
- **Photos, copies, source: measured (25/09/2026, Santo Stefano di Bologna: 0 photos on 13
  stops, 3 stops ≥ 60% copied from Wikipedia, the EN guide of another «Santo Stefano» built on
  the Genoa article).** The photo phase is `fotoPerTappeGuida`: every Wikimedia call is retried
  once after 2 s, and a guide still without photos because of an ERROR (not missing material)
  is saved with `fotoDaRifare` — never as final. Churches also read Wikidata P361 («part of»).
  Copying is MEASURED, not just forbidden: `antiCopiaTappe` (pgSovrapposizione, 8-word windows,
  each field separately) sends stops ≥ `SOGLIA_COPIA_PCT` (60) through the reviewer's rewrite;
  outcome in `guide.qualita.copia`. The «own words» rule is ONE constant, `REGOLA_PAROLE_TUE`.
  Without GPS, a venue article must lie within 2 km of the venue or name its city; disambiguation
  pages never count. Old guides: `scratch/ripara-guide-musei.mjs` (route `/api/museums/ripara-guida`,
  script-only); test: `scratch/collaudo-copia-guide-musei.mjs`.
- **Empty stops: ONE function, source by QID first (25/09/2026, collaudo of 7 guides: Louvre 35/40
  stops empty — the Venus de Milo was «Opera (-140) n. inventario LL 299.» —, British 35/40 with
  the literal placeholder «... (200+ words) ...», Duomo di Milano 16/16, Uffizi 9/40).**
  `riempiTappeVuote` (server.ts, above `cercaMaterialeWeb`) fills every stop for which `tappaVuota`
  is true (< 60 chars or a placeholder): first the Wikipedia article OF THE WORK through its
  Wikidata QID (`voceOperaDaQid`, tier A), then the open web. Used by `venue-guide` (4 stops live,
  40 when seeding) and by `ripara-guida` mode `vuoti`, which also removes works that Wikidata places
  in ANOTHER museum > 20 km away (`operaAltroveSecondoWikidata`: the Louvre had Titian's «Sacred and
  Profane Love», which is at the Borghese). The library's anti-regression score counts stops with
  real text. The client never shows or reads a placeholder (`spiegazioneVera`, MuseumVisitSheet).
- **The artwork card must be about THAT work, in THAT language.** The Wikipedia title must contain
  every proper word of the work's name (`titoloDellOpera`: «Candelabro Trivulzio» used to take
  «Palazzo Trivulzio»), the city is not a word of the museum's name, and `linguaProbabile` checks
  the output, the translation and the cache (an EN card in Italian is redone). Offline test of the
  rules: `scratch/collaudo-regole-guide-museo.mjs`.
- **Distances: `getHaversineDistance` is METRES, `haversineDistance` (server.ts ~20867) is KILOMETRES.**
  Until 26/09/2026 `fotoOperaPerTitolo` compared the km value with `> 3000` as if metres, so a photo
  found by title passed from anywhere within 3,000 km (the chapels of the Sacro Monte di Varese on a
  basilica in Bologna); the museum-map lookup by name and the «experiences near» distance had the same
  bug. Use `getHaversineDistance` for any threshold in metres.
- **A photo found by title must PROVE it is here** (P625 ≤ 3 km, or P195/P276 = the venue or an entity
  ≤ 3 km): a person («San Pietro» → Rubens) or a subject («Madonna del latte» → Memling) declares no
  place and used to pass. Last check on every artwork photo, whatever the phase:
  `fotoContraddiceTappa` (another famous artist, another big museum, the author's portrait, a
  panorama). `opereDaWikidata` drops events and people (the state funeral of Berlusconi was a «work»
  of the Duomo).
- **The library never gets worse, even at night.** `salvaInLibreriaMusei` does NOT overwrite when the
  existing guide cannot be read (the 02:00 seeding with `rigenera` on droplet 104 replaced the British
  Museum EN — 40 stops, 40 photos — with 12 stops and 0 photos because the read timed out), nor with a
  `fotoDaRifare` guide that has fewer photos than the old one.
- **Verification of 06/10/2026 (library: 3,139 IT + 3,114 EN guides; live tests on British Museum, Duomo di
  Milano, Museo del Marmo, San Pietro in Ciel d'Oro, Luni, Prado).**
  · *Photos with Wikimedia's tracking inside the file name* (`Marmoteca.JPG%3Futm_source%3D…?width=800` → 404):
    7,724 URLs in 1,955 guides and 1,576 cache rows. `fotoCommons` now decodes FIRST and strips `?utm_…`; the
    client's `fotoCommonsStandard` strips it too; rows repaired (copy in
    `/root/citta/copia-museum-guides-foto-utm-2026-10-06.jsonl` on Oracle).
  · *Wrong language in short texts*: `linguaProbabile` needs 60 words, so a 20–90-word stop text or a one-line
    curiosity was never checked — 7,145 ITALIAN stops inside 725 ENGLISH guides (British Museum EN: 31 texts and
    36 curiosities of 40). `linguaTestoCorto` (≥ 3 spy words, 2× the runner-up) now guards `riempiTappeVuote`
    and `daRiscrivere`; the prompt states the language as a hard rule. EXISTING rows are not repaired: run
    `scratch/ripara-guide-musei.mjs --lingua=EN --modi=vuoti` on order (background pool, at night).
  · **THE USER'S LANGUAGE, ALWAYS** (committente 06/10/2026 sera: «le lingue esatte dell'user sempre»). Three
    causes found and closed: (1) the per-work prompt of `venue-guide` («opera per opera») never named the output
    language — it does now, and a wrong-language answer is dropped; (2) `traduciGuidaMuseo` translated title and
    text but NOT `curiosita` (every translated guide kept the source-language curiosities) and fell back to the
    source text on an empty line — it now translates triples and an untranslated line stays EMPTY; (3) fallback
    strings were hard-coded Italian («Osservala da vicino: misura…», «Attualmente non esposta», «fra le più note
    della collezione») — now per-language data labels or nothing. Last gate: `soloLinguaGiusta` strips from every
    served guide (cache, library, fresh translation) any intro/consiglio/perche/curiosita detected in another
    language. Repair of what exists: `ripara-guida` mode `lingua` TRANSLATES (10 texts per call; British Museum
    EN: 80 of 80 in 134 s). POI cards: `traduciCampiPoi` and the `/api/poi/enrich` cache check read the language
    from the TEXT (`linguaTestoCorto`), the `description_lang` label is only the fallback (the MAAT of Lisbon
    showed English to an Italian user). Still as before: a GUEST gets the original, never a translation.
    Mass job on Oracle: `/root/musei-riparazione-massa.cjs` (state `/root/citta/musei-riparazione-stato.json`,
    log `.log.jsonl`, output `.out`; resumable; stops when `/api/health` fails twice) — phase 1 `lingua` on 656
    guides, phase 2 `vuoti,collezione` on 149 collection-list guides (up to 4 passes each).
  · *Collection lists instead of guides*: 141 IT guides with ≥ 15 stops are ≥ 70% `soloCollezione` (Prado 38/40,
    Vaticani 37/50, Rijksmuseum 35/40, Ermitage, Capodimonte, Borghese, Capitolini…) and therefore FREE by
    `guidaGratuita`. `ripara-guida` mode `collezione` (with `vuoti`) promotes a collection-only work to a real
    stop when the Wikipedia article OF THE WORK (QID) gives material — never from the open web.
  · *Vision engines*: audio description, label and room-sign reading tried only `gemini-3.5-flash` (daily quota
    gone → `no_description` in 3 s); they now also try `gemini-3.5-flash-lite` (quota is per model).
  · *PDF*: `generaPdfMuseo` fetched all stop photos at once at 1600 px (British Museum: 60 works, ONE photo in
    18 pages); now 4 at a time, 960 px, one retry.
  · *Search*: Wikipedia suggestions made only of generic words («British», «Museum») or disambiguation pages are
    dropped. *Radar AR* (`AROverlay`): asks 150 rows, gems always pass, wider category list, no plaques, no city
    rows, no itinerary activities, one row per bare name.
  · Known and open: 214 IT stops end mid-sentence; 510 curiosities are the filler «Osservala da vicino: misura…»;
    63 venue names appear twice; `official_site` missing on 754 IT guides (British Museum → no hours, no
    exhibitions); `/api/museums/exhibitions` returned 0 for every venue tried; web «Scarica tutto» cannot fetch
    Commons photos (CORS); an owned Visita is matched by `venueKey`, not by name.
- **Experiences and tickets of THIS museum**: the product TITLE must carry the museum's proper words
  (city words don't count; «british» used to let in Westminster Abbey); links go through `/api/out`
  with `u=` (with `url=` it answered 400). A Visita bought for the museum opens experiences and
  «altre opere» like the pass; the Pass base discount on a Visita is used ONCE per pass
  (`scontoPassBaseLibero`).

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
    `GEMINI_REVISORE_DAL_POOL="4"` (06/10/2026, committente «togli una chiave dai processi Gemini e aggiungila al
    revisore») moves the listed pool suffixes to the dedicated set without touching the secret: Vercel env vars are
    *sensitive*, `vercel env pull` returns them empty, so a key cannot be copied to a new name from here. Production
    now: pool `_1`…`_3`, reviewers `VERIFICA` + `_4`. `chiamaRevisore` tries `gemini-3.6-flash` then `gemini-3.5-flash`
    on them and logs WHY it falls back (06/10: VERIFICA's 3.5-flash was 429, 3.6 was 503).
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
  - **CONTROLLI COMPLETI ANCHE SU «AGGIUNGI GIORNO»** (committente 25/09/2026): `/api/itinerary/extend`
    runs the same checks as the generator on the new day — `agganciaTappeAlDatabase`, «doppioni mai»
    (`togliDoppioniItinerario` with `soloGiorni`: stops are removed only from the new day), one more try
    if it drops under the minimum, `verifyItineraryAntiHallucination`, fact reviewer. The doppioni key is
    `chiaveNomeTappa`: when a name has no significant words («Trattoria da Me») the whole normalized name
    is the key (it used to pass unchecked); purely generic names («Pranzo») have no key. A stop without
    `poi_id` and without a web signature is `poco_noto`, never `verificata` on the AI's word alone.
  - **REVISORE DEI FATTI DEL TESTO** (committente 25/09/2026, collaudo Bologna: «Pietà di Michelangelo» in
    San Petronio, Lucio Dalla «visse e morì» in via d'Azeglio): `revisoreFattiItinerario` — a second engine
    via `chiamaRevisore` (never DeepSeek, never Gonka) reads each stop's `attivita`/`consiglio_guida` and
    flags sentences with false or unverifiable facts; they are REMOVED, never rewritten. Runs in the
    generator (45 s cap) and in «Aggiungi giorno» (40 s). The outcome is recorded in
    `qualita.revisore_fatti` (`ok` / `parziale` / `non_eseguito`, controllate, frasi_tolte). Offline test:
    `scratch/collaudo-revisore-fatti.mjs`.
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

Ricerca web per i MUSEI (sale e piante, `/api/admin/museums/web-search`, 12/09/2026 sera): passa da SearXNG auto-ospitato (`SEARXNG_URL` + `SEARXNG_TOKEN`, header `X-Searx-Token`), gratis e senza crediti; la rotta lo sceglie da sola quando la variabile esiste, con ripiego su `BRAVE_SEARCH_API_KEY_MUSEI` e poi sul fornitore degli Eventi. Brave resta agli Eventi. **Dal 22/09/2026 l'istanza di produzione è sul droplet 201 (`https://201-79-2-241.nip.io`, 512 MB, dedicata al traffico in diretta)**; quella del 104 resta per i job di sfondo che girano lì (foto-gemme, foto-poi). In `eventiFeed.ricercaWeb` c'è un interruttore: dopo 3 fallimenti di rete/timeout/5xx di fila SearXNG non viene chiamato per 3 minuti (nessuno aspetta un droplet spento); schede dei luoghi e guide passano `senzaRiserva` e NON ripiegano mai su Brave (regola del committente: mai un motore a pagamento per quelle).

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

## Museum guides: ONE master in Italian, then 6 translations in the library (06/10/2026)

Order of the committente: «fare bene la guida museo in italiano e, quando perfetta, tradurla nelle altre 6
lingue e lasciarla in libreria»; «tradurre tutto, anche curiosità — e usare foto».

- **Route `/api/museums/traduci-guida`** (script-only, `x-script-secret`; body `{venueKey, da:'IT', a:'FR'}`, one
  target language per call). The master must be READY or the route answers `non_pronta` with the reason: no more
  than 1 text (or 5%) in another language, ≥ 3 real stops, ≥ 80% of them with text, intro ≥ 60 chars.
- **It works in instalments**: 4 stops per AI call, what fits in ~150 s, the partial saved in `api_cache`
  (`traduci_parz:<venueKey>:<LANG>`, valid for THAT master version) → answer `in_corso`; the next call resumes.
  `traduzione_fallita` with `perche` = free engines at their per-minute limit: wait ~75 s and call again.
- **A translation enters the library only if complete**: ≥ 90% of the explanations, ≥ 90% of the curiosities,
  ALL the photos of the master, right script for RU/ZH, `soloLinguaGiusta`. It records `translatedFrom` and
  `maestraDel` (the master's `updated_at`): when the master changes, the copy is redone; same version → `gia_fatta`.
  An existing NON-translated guide richer than the master is kept (`tenuta_piu_ricca`).
- **Engines in background**: same shape as the `lingua` repair (free pool first, Gonka pool `musei` last, 6,000
  tokens). With Gonka FIRST and 7,500 tokens the pilot failed 8 chunks of 8; the `musei` Gonka account answered
  402 (credit finished) on 06/10.
- Runner on Oracle: `/root/musei-maestra-traduzioni.cjs [--solo=venueKey] [--limite=N] [--lingue=EN,FR]`
  (paid guides first, state in `/root/citta/musei-traduzioni-stato.json`). Pilot: British Museum IT→FR, 60 stops,
  60/60 explanations, 58/59 curiosities, 56/56 photos. NOT launched in mass: it shares the free engines with the
  repair job and needs the committente's go.
- `dove` («Sala 4») is deliberately not translated.

## Events section and «Mostre in corso» — what the check of 06/10/2026 found

- **Exhibitions of a museum** (`/api/museums/exhibitions`, cache key `v4`): a home page answering 403 to robots
  (British Museum, Prado) used to end the route at once. Now the home failing stops nothing, the site ROOT is read
  when the saved site is a deep page, and the usual addresses are tried (`/mostre`, `/exhibitions`,
  `/exhibitions-events`, `/exposiciones`, `/ausstellungen`…). An empty answer is remembered only if the site let
  itself be read. Still empty by nature: sites that block every page (Prado) and sites with no exhibitions index (Uffizi).
- **London is London**: `cittaInTreNomi` returned the borough («City of Westminster») → portals 0 events, Trip.com
  Disneyland California, web search a golf club. Inside Greater London the city is London.
- **Events of another province out**: Virgilio's «carrara/eventi» listed 13 events of 19 in Parma, Florence, Reggio
  Emilia. When the venue declares «…, Comune (XX)» the event stays only if the comune is the city or the province
  code is the city's (learned from the events that name the city).
- **Exhibition venue name**: among rows sharing a site, the one with a Latin-script name wins (the National Gallery
  row was «国家美术馆»). **Permanent collections**: bars and restaurants filed as museums are dropped by name
  (`RE_LOCALE_NON_MUSEO`: «Camparino in Galleria», «Cracco in Galleria», «Rooftop Duomo»).
- Open: `/api/mostre/permanenti` sometimes 503 on a cold call (DB read); the Milan cell of `/api/mostre` cached empty.
  (Both closed the same evening: see the next section.)

## Events section — verification of 06/10/2026 (committente: «deve funzionare in tutte le città, per tutti gli affiliati»)

Measured with `scratchpad/prova-eventi-mondo.mjs` (13 routes × 10 cities: Milano, Roma, Carrara, London, Paris, Barcelona,
Berlin, New York, Tokyo, Lisboa) and live in Chrome (Carrara: 52 cards — Viator 20, Trip.com 6, GYG 2, Klook, Virgilio,
portals, markets; «Collezioni permanenti» 18 museums). The map chip «Eventi» opens the same screen (`case 'eventi'` in App.tsx).

- **The city name was the root cause of most defects.** `cittaInTreNomi` (eventiFeed.ts) returned the reverse result's own
  name at zoom 10, often a QUARTER: Lisbon → «Arroios», Tokyo → «Suginami», New York → «Manhattan», London → «City of
  Westminster». Trip.com answered Vila Real for «Arroios», portals 0 events, Klook no city. Now the city is `address.city`
  (town/village…), with three fixed cases (Greater London → London, `ISO3166-2-lvl4 = JP-13` → Tokyo, NYC boroughs → New
  York), and when the result is not the city a second Nominatim search gives the translated names. Cache prefix `citta4_`
  (6,030 `citta3_` rows removed, copy in `/root/citta/copia-api-cache-eventi-2026-10-06.jsonl` on Oracle).
- **Trip.com** keeps only cards whose URL names the city (the `attraction/<city>` segment, any of en/local/user names) —
  cache `tripcom_v2_`. **Klook**: no city in the list → affiliate SEARCH link, never nothing. **Viator**: name unknown to
  Viator → nearest destination by coordinates (`destinazioneViatorVicina`, `/partner/destinations`, ≤ 60 km, cities
  before regions): Carrara used to get «Aeroporto di Gold Coast» (Carrara, Australia) from the free-text fallback;
  transfers and taxis go to the bottom of the Events list. **Ticketmaster**: «Abbonamento A/B/C» dropped. **Stagionali**:
  the Viator free-text search («vendemmia Carrara» gave Corfù, Alba and Porto) now carries `productFiltering.destination`
  from `destinazioneViatorPer` (name, else nearest by coordinates); Carrara → «Cinque Terre uniche e classiche». Cache `v3`.
- **GetYourGuide has NO API** (committente): the key never existed on Vercel; `fetchGygExperiencesScraped` read DuckDuckGo
  HTML, which stopped answering servers, and cleaned titles with Agnes (minutes; the client closes at 12 s) — so the
  tab showed only the search link everywhere. Now: SearXNG (droplet 201) with three query forms, Brave reserve (allowed
  for Events) when fewer than 3 activity links, titles cleaned by rules, only activities of THIS city (the city's
  `-l<id>` segment in the URL or the city in the title; Lisbon used to show Evora), foreign scripts out. Diagnostics:
  POST with `diag: true`.
- **Portals / Virgilio**: events of another province out (`eventiDellaProvincia`: «…, Comune (XX)» must be the city or
  its province code — Virgilio's «carrara/eventi» listed Parma, Firenze, Reggio Emilia, 13 of 19); online events
  (`OnlineEventAttendanceMode`, `VirtualLocation`) out of every city page.
- **Collezioni permanenti answered 503 in London, Paris, Milan, New York**: EXPLAIN showed the general GIST index
  returning 14,266 rows within 3 km to keep 1,019 museums (6.4 s). Partial GIST index on museums only
  (`idx_shared_pois_geog_musei`, migration `20261006220000`, built CONCURRENTLY from the pooler): London 3 s, Paris 7 s,
  NY 2 s. Rings 3/7/15… km, 200 rows, a failed wider ring keeps the museums already read. Statues/plaques filed as
  museums («Charles I», «Lion», a 20-word inscription in Paris) are dropped by name (≥ 8 words, or no museum word and no
  site/photo/text); bars and restaurants «in Galleria» too.
- **Exhibitions from the web** (committente: «mostre sempre aggiornate con la ricerca SearXNG del droplet dedicato»):
  `/api/mostre` adds `mostreDalWeb` — «<city> mostre <month year>» in the local language on SearXNG (`senzaRiserva`), 4
  pages, JSON-LD first then text extraction, every item through `validaEventi` (title in the page, city named nearby,
  future date), 24 s cap, `fonte: 'web'`, `dal_web` in the answer, `?diag=1` for the counters. New York: 7 from the web
  (none from museum sites); Genova 3; Milano 0 (the text extraction did not finish in time).
- **Caches are the trap when testing**: partner caches are `partner_<src>` content types (not `<src>`), `gyg_scrape_v2_`,
  `web_<provider>_…` 7 days, `mostre_<cell>` 12 h incl. EMPTY cells. A Vercel deploy prints its URL before the build
  ends (~1 min): test only when `vercel ls --prod` says Ready, or the old function answers.
- **07/10/2026**: (a) a late answer of a previous city overwrote the list — the first search ran on the phone's position
  before the active trip was read, then the trip moved the centre to Antwerp and the 40-second portals answer for
  Carrara landed after it. `fetchGenRef` in EventsScreen: every search has a generation, every loader drops an answer
  of an older one. (b) Markets abroad: Overpass rarely answers from Vercel, so when it gives nothing `/api/events/local`
  reads `shared_pois` (`marketplace`, `mercati`, `market_hall`, small box, no ORDER BY): Paris 144, London 252, NY 307
  rows. (c) Web exhibitions cap 40 s. (d) Library dedupe radius 120 → 300 m, same city (itinerary-born guides sit
  150–250 m from the venue); the 70 «duplicate» venue names are mostly different venues with the same name.
- Still open: Tiqets products appear only within the chosen radius (Carrara 10 km → none, by design); portals still let
  through a few events of other cities abroad (Tokyo page lists Osaka, London a Japanese meetup); Prado's site blocks
  every page; Ticketmaster has no affiliate code yet (Impact application «in revisione» since 07/10, site verified by
  the `impact-site-verification` meta tag in index.html).
