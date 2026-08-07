# Checklist criticità — Modalità Itinerari (test approfondito del 2026-08-05)

Test eseguito su: flusso completo richiesta → generazione → tappe → tappe-che-diventano-POI → podcast → guida d'autore → stampa/PDF → offline. Fonti: analisi statica di `PlanScreen.tsx` (4870 righe), `server.ts` (6466 righe), componenti `itinerary/*`, `PremiumGuideModal`, `PrintView`, `premiumGuideService`, più **test live sugli endpoint di produzione**.

## Esito dei test live (produzione, itainta.vercel.app)

| Endpoint | Esito | Tempo | Note |
|---|---|---|---|
| `POST /api/groq/candidates` (tinder) | ✅ OK | 17,9s | 15 candidati validi su "Lucca" |
| `POST /api/groq/itinerary-stream` (generazione) | ✅ OK | 34s | 1 giorno, 6 tappe con coordinate e budget, JSON valido (primo chunk a 7s). ⚠️ Con `interests` stringa invece di array → 500 `(interests \|\| []).join is not a function` (input non normalizzato). ⚠️ Qualità: per "Lucca" propone "Pranzo a Barga" e "Casa Museo Pascoli" (~35-40 km fuori destinazione) — nessun vincolo geografico nel prompt |
| `POST /api/generate-daily-podcast` | ✅ OK | 10,3s | 2.112 caratteri, persona "Uip" corretta |
| `POST /api/tts/smart` | ✅ OK | 1,2s | MP3 24KB, cache attiva |
| `POST /api/foursquare` | ✅ OK | ~1s | Migrato a nuovo Places API (fix del 2026-08-05) |
| `GET /api/trip/*` (TripAdvisor) | ❌ | — | TripAdvisor blocca gli IP datacenter Vercel a prescindere dalla chiave (v. sotto) |

---

## 🔴 BLOCCANTI (perdita di denaro, sicurezza, funzionalità rotte)

1. **Bundle audio offline gratis e senza conferma** — `OfflineAudioBundleModal.tsx:171`
   `requestConfirmation(totalCost, 'offline_bundle', async () => {...})`: la callback viene passata come terzo parametro `currentBalance` (un numero). React la esegue come updater → il download parte **senza conferma utente**, **senza addebito crediti** (`consumeCredits` mai chiamato) e in StrictMode **parte due volte**. Perdita di ricavo diretta.

2. **`language` ignorato nella generazione itinerari** — `server.ts:1730`
   L'endpoint di produzione `/api/groq/itinerary-stream` non destruttura `language`: **tutti gli itinerari escono in italiano** per utenti EN/FR/ES/RU/ZH/DE. Idem per la guida premium (`language` accettato e mai usato nei prompt, enrichment hardcodato su it.wikipedia) e per il podcast (solo IT/EN gestiti: FR/ES/RU/ZH/DE → podcast in italiano; `DE` manca proprio dalla `langMap` client `PlanScreen.tsx:1816`).

3. **8 campi del form senza alcun effetto** — `server.ts:1730/1750`
   `budget, viaggiatori, ritmo, guida, mese, includeEvents, includeTours, radius` vengono inviati dal client ma **mai inseriti nel prompt**. L'intera sezione "Opzioni avanzate" del form e i checkbox Eventi/Tour sono decorativi.

4. **Nessun timeout sullo streaming di generazione** — `PlanScreen.tsx:39/55` + `server.ts:468`
   Il `clearTimeout` è nel `finally` del fetch iniziale: appena arrivano gli header il timeout è disinnescato e il loop di lettura non ha né timeout né bottone di annullamento → se DeepSeek si blocca a metà stream, **stallo infinito con crediti già scalati**. Lato server `_streamDeepSeekNative` non ha timeout axios → lambda occupata fino a 300s. (Il caso felice funziona: 34s misurati; il rischio è sul caso di guasto, che oggi non ha alcuna rete di protezione.)

5. **IDOR su `/api/optimize-itinerary`** — `server.ts:5385, 5404-5407`
   `userId` dal body, controllo di proprietà saltato se assente: chiunque con un `itineraryId` può leggere e **far riscrivere/persistere** l'itinerario di un altro utente. Nessuna verifica del token.

6. **`/api/premium-guide/pdf-url` senza autenticazione** — `server.ts:5363-5374`
   PATCH con service-role key su `itinerary_guides` guidato da body arbitrario: si può sovrascrivere il PDF di qualunque guida con un URL malevolo.

7. **Quota Guida Premium disattivata + paywall solo client** — `server.ts:5756-5762`
   Il `return res.status(403)` è commentato ("Bypassing quota limit for testing"). I crediti sono scalati **nel browser**: una cURL diretta genera guide (N chiamate DeepSeek + fetch immagini) gratis. Stesso schema su `/api/generate-daily-podcast` (8k token, zero controlli, zero rateLimiter) e `/api/optimize-itinerary` (agent loop 5 iterazioni).

8. **Chiavi API hardcoded nel sorgente** — `server.ts:3334, 3351, 3368, 3385, 5784, 5785, 6091`
   TripAdvisor (5 occorrenze), Foursquare, Ticketmaster in chiaro nel repo come fallback di `process.env`.

9. **"Ricarica crediti" rotto nel tab Plan** — `PlanScreen.tsx:4856-4859`
   Il pulsante del modale crediti fa `alert("Shop crediti non ancora collegato in questa schermata!")`. L'utente che vuole pagare non può.

10. **`enrichSequentially` rilanciato a ogni modifica di tappa** — `PlanScreen.tsx:2197-2212`
    Ogni spostamento/aggiunta/cancellazione di una tappa rilancia (non-awaited) il loop di enrichment su TUTTI i POI del piano: 5 modifiche su 20 tappe = ~100 chiamate concorrenti a `/api/poi/enrich`.

11. **Quota fail-open e anonimi collassati sull'utente admin** — `server.ts:544-546, 636-639`
    Senza auth valida `checkAndIncrementQuota` assegna l'ID admin hardcoded; qualsiasi errore Supabase → `{allowed: true}`.

## 🟠 ALTE

12. **Doppio schema di ID per i POI da itinerario + collisioni cross-città** — `PlanScreen.tsx:757` vs `:2167`
    Lo stesso luogo viene upsertato in `shared_pois` sia come `iti-<slug>` sia come `id_tappa`/`ai_<lat>_<lon>`, con categorie diverse → duplicati non deterministici. Lo slug ASCII fa collidere "Duomo" di Milano e Firenze sullo stesso `iti-duomo`.

13. **Tappa→POI: upsert non awaited + scheda senza immagine** — `PlanScreen.tsx:2512-2533`
    La scheda POI può aprirsi prima che l'upsert atterri (404 alla prima apertura); `image_url:''` sempre vuoto.

14. **Cache itinerari: l'endpoint di produzione non ce l'ha** — `server.ts:1728-1818`
    `/api/groq/itinerary-stream` non legge né scrive `api_cache` (la cache esiste solo sulla route legacy non più chiamata). Ogni generazione è un costo pieno. In più la chiave cache legacy non include budget/ritmo/tour → collisioni; e `getFromCache` non ha TTL.

15. **Contabilità quota/crediti divergente** — `server.ts:1811` + `PlanScreen.tsx:1522`
    La quota server è scalata anche quando lo stream fallisce (il client intanto rimborsa i crediti); sulla route legacy invece non è mai scalata (condizione su engine sbagliata, `:1706`).

16. **Rigenerazione con destinazione sbagliata** — `PlanScreen.tsx:1034` e `:2109`
    "Rigenera" passa il **titolo** dell'itinerario come destinazione (senza lat/lon); "da preferiti" passa `destination: "Tappe Selezionate"` → contesto geografico e prompt incoerenti.

17. **Realtime che sovrascrive modifiche locali** — `PlanScreen.tsx:921-925`
    Il piano dal canale realtime Supabase sovrascrive `generatedPlan` senza confronto di versione → le modifiche locali possono essere annullate dal rimbalzo.

18. **Eventi nav/check-in morti** — `App.tsx:169/377`, `useWalkingNavigation.ts:112`
    `wip-smart-navigate` mai dispatchato (RoutePoisModal irraggiungibile); `wip-nav-arrived` dispatchato ma senza listener (l'arrivo a una tappa non fa scattare l'audio); `wip-itinerary-checkin` riceve `poiId` e lo ignora.

19. **Podcast: modale crediti mostra sempre "0 crediti"** — `PlanScreen.tsx:1743` (manca il balance nella chiamata); doppia voce su Stop→Play rapido (`:1689`, timer mai cancellati); nessun `speechSynthesis.cancel()` allo smontaggio (il podcast continua cambiando tab); cache podcast per titolo (collisioni e riascolti sbagliati dopo rigenerazione).

20. **PDF guida generato due volte per download** — `premiumGuideService.ts:292-293`; nome file fisso `WIP_Guida_Premium.pdf` per tutte le guide; "condividi" condivide l'URL dell'app, non della guida.

21. **Doppio click = doppio addebito** — `PlanScreen.tsx:1393/1587/1989/2067` (finestra prima di `setLoading(true)`), `:4258` (Rigenera senza disabled), `PremiumGuideModal.tsx:426` (podcast guida).

22. **Bottone GPS del Form C rotto** — `PlanScreen.tsx:3123-3130`
    Scrive `"GPS: lat, lon"` come destinazione senza settare le coordinate → la geocodifica fallisce e il flusso si blocca.

23. **`fetchCurrentPlan` mai chiamata** — `PlanScreen.tsx:1240`: nessun ripristino automatico dell'ultimo itinerario.

24. **Rischio timeout 300s su premium guide** — `server.ts:5740+`
    Enrichment 4 API × tutte le tappe in `Promise.all` illimitato (120 richieste simultanee per 5 giorni), generazioni per-giorno in parallelo, poi **loop immagini sequenziale** (~7s/POI): una guida da 4-5 giorni può sforare quasi sempre.

25. **Errori che tornano HTTP 200** — `streamUniversalAi` chiude con 200 anche a fallimento totale (`server.ts:336-346`) e il client inghiotte l'errore (`premiumGuideService.ts:221-224` catch vuoto); `/api/fsq/*` inoltrano errori Foursquare come 200; enrichment premium fallito → guida generata "a memoria" ma il prompt dichiara i dati come verificati (allucinazioni presentate come fatti).

## 🟡 MEDIE

26. Fallback Gemini di `callUniversalAi` è codice morto (SDK sbagliato, `server.ts:199-212`) e ignorerebbe `strictEngine`.
27. `parseSafeJSON` può consegnare itinerari amputati che passano i controlli (`server.ts:1146-1182` + gate solo su `giorni.length>0`); il conguaglio client non gestisce giorni con `tappe:[]`.
28. Prompt injection: `specialRequests`, `pois`, `destination`, itinerario intero nel system prompt, senza sanitizzazione né limiti di lunghezza (body fino a 50MB) — su `/api/optimize-itinerary` l'esito finisce in DB.
29. `/api/groq/radius-alternatives`: ReferenceError latente su `quota` mai dichiarata (`server.ts:1897`).
30. `/api/groq/trivia`: `JSON.parse` nudo → 500 dopo aver pagato la generazione (`server.ts:2049`).
31. `/api/groq/enrich_poi` e `/api/guide-intro` chiamano Gemini direttamente bypassando `callUniversalAi` (niente fallback/telemetria).
32. `/api/poi/audioguide/stream` fa una chiamata HTTP a sé stesso basata sull'header Host (doppia lambda, header controllato dal client) e sintetizza il placeholder "Benvenuto a X!" se il testo manca.
33. TTS secondari (`/api/tts/azure|google|elevenlabs`): senza cache, quota, timeout; SSML non escapato (`&` o `<` nel testo → 400 Azure); `voiceName` non escapato nemmeno in `/api/tts/smart`.
34. Telemetria costi falsata: `featureContext` di itinerary-stream e premium-guide-stream loggato come "streaming_enrichment" senza userId; `/api/regenerate` logga engine e token fissi falsi; `success:true` hardcodato.
35. Due istanze Leaflet sempre montate (PlanMap + quella nascosta dentro PrintView, `PlanScreen.tsx:4303`).
36. Spostare una tappa conserva l'orario dello slot senza ricalcolo tempi/spostamenti (`:2384`).
37. Tappe Viator con `coordinate {0,0}` → invisibili sulla mappa (`:825`).
38. URL Google Maps di navigazione: origine duplicata nei waypoint e nessun rispetto del limite di 10 (`:1384`).
39. `shared_itinerary_cache` scritta con due schemi di id: ogni cache-hit genera una riga spazzatura (`:1509` vs `:2256`).
40. ID offline derivato dal titolo → due itinerari con lo stesso titolo si sovrascrivono in IndexedDB (`:2347`); ripristino da offline non riassegna `plan.id` (podcast/salvataggi degradati).
41. Autocomplete destinazioni senza AbortController (risposte fuori ordine) e uscita silenziosa se manca `VITE_MAPBOX_TOKEN` (`:1177-1207`).
42. `giorni` non clampato al max (30 giorni = 300 crediti e output comunque troncato, `:2891`); raggio `NaN` possibile (`:3217`).
43. Mutazione diretta dello stato React (`plan.id = crypto.randomUUID()`, `:2151`).
44. `PremiumGuideModal`: `itinerary.city` inesistente (sempre "questa città"), 4 state + interval mai renderizzati, import quota mai usati.
45. `generatePremiumGuideStream` + endpoint `/generate-stream`: interamente morti; per di più il bug di firma logga i loro costi senza contesto.
46. `afterprint` non garantito su Safari iOS/WebView → titolo documento e classe di stampa mai ripristinati (`:4288`).
47. ~40 stringhe hardcoded in italiano (alert, mesi, label form avanzato, legenda mappa, PrintView quasi tutto, sezione Offline); refuso RU "dней"; `zone_da_evitare` mai stampato nel PDF.
48. CORS: `Access-Control-Allow-Origin: *` + `Allow-Credentials: true` su tutte le `/api/*` (`vercel.json:8`) — combinazione invalida, sintomo di API aperte a chiunque.
49. `rateLimiter` in-memory inefficace su Vercel (reset a ogni cold start) e comunque assente sulle route più costose.
50. Stato/prop/scritture morte: `planLoadingPhrases`, `resetCounter`, `onRemovePoi`, `idbSet('wip_last_plan')`, ramo podcast "Intero Itinerario", route duplicata `GET /api/wiki/pois`.

## Nota TripAdvisor (contesto)
La chiave funziona (200 dal test locale) ma TripAdvisor **rifiuta le richieste dagli IP datacenter Vercel** qualunque sia la configurazione della chiave (testato: dominio, 0.0.0.0/0, con/senza Referer/Origin/UA). Non risolvibile da codice; opzioni: micro-proxy su VPS con IP fisso, o rinunciare al fallback TripAdvisor (l'app funziona con Foursquare+OSM+DB).

## Ordine d'intervento consigliato
1. Sicurezza/ricavi: #1 (bundle gratis), #5-#7 (IDOR, pdf-url, quota premium), #8 (chiavi nel sorgente), #9 (ricarica rotta).
2. Esperienza: #2-#4 (lingua, campi ignorati, timeout streaming), #16 (destinazioni sbagliate), #19 (podcast).
3. Costi/robustezza: #10, #14, #24, #25.
4. Pulizia: resto delle medie/basse.
