# WIP · World in Pocket — Architettura completa
### Documento di riferimento, scritto il 30/08/2026 (dopo la pubblicazione su Google Play e Apple App Store)

Questo documento spiega **come è fatta l'app dall'interno**: le funzionalità, come sono state costruite, con cosa, e quali servizi esterni usa ognuna. È pensato per essere leggibile senza aprire il codice, ma ogni sezione indica anche i file/rotte precisi per chi deve intervenire.

---

## 1. Cos'è WIP in una frase

WIP (nome tecnico `com.itaintasca.app`, nato come *Italia in Tasca*) è un'**audioguida che parla da sola**: mentre l'utente cammina o guida, l'app sa dove si trova, riconosce quando è vicino a un punto di interesse (POI) e fa partire una narrazione generata dall'intelligenza artificiale — senza che l'utente debba toccare nulla. Funziona anche a schermo spento e con l'app in background.

Non è solo un'audioguida: dentro c'è anche un navigatore pedonale/auto, un pianificatore di itinerari, un sistema di crediti per pagare i contenuti, una community di foto, una libreria di guide "premium" scritte da un'AI, e un pannello di amministrazione completo.

## 2. Le tre forme in cui l'app esiste

La stessa base di codice diventa tre prodotti diversi:

1. **Sito web / PWA** — `https://www.wip.guide`, funziona in qualsiasi browser, installabile come app (Progressive Web App, service worker per l'uso offline).
2. **App Android** — pubblicata su Google Play, un contenitore Capacitor attorno allo stesso sito, PIÙ uno strato nativo Kotlin che continua a funzionare quando il telefono ha spento lo schermo o ha chiuso l'app dalla lista dei recenti.
3. **App iOS** — pubblicata su App Store, stesso principio, strato nativo scritto in Swift.

**Perché due implementazioni native separate (non solo la webview)**: un telefono con lo schermo spento sospende JavaScript nel giro di pochi secondi. Un'audioguida che deve avvisare l'utente mentre cammina con il telefono in tasca non può dipendere da una pagina web viva — serve codice che il sistema operativo tratta come "vero", cioè un Servizio Android in primo piano o un aggiornamento di posizione in background su iOS. Per questo il **rilevamento geografico esiste letteralmente tre volte** (web, Android, iOS) e va tenuto sincronizzato a mano ogni volta che cambia.

## 3. Il server: un unico "cervello" condiviso

`server.ts` — un solo file Express da circa 24.000 righe — è il cuore di tutto. Gira in due modi:
- in sviluppo, come server locale (`npm run dev`, porta 3000);
- in produzione, come funzione serverless su **Vercel** (ogni chiamata `/api/...` attiva un'istanza della stessa funzione, che si spegne quando non serve).

**Perché un server e non chiamate dirette dal telefono ai vari servizi AI**: nessuna chiave di nessun fornitore esterno arriva mai al client. Se le chiavi Groq, Stripe, Azure ecc. finissero nell'app, chiunque potesse decompilare l'APK potrebbe rubarle e spendere a nostre spese. Il server fa da procuratore (proxy) per ~70 rotte diverse, spendendo lui le chiavi e restituendo solo il risultato.

Due pattern che attraversano tutto il file:
- **`callUniversalAi()`** — ogni richiesta a un modello di linguaggio passa da qui, mai da una chiamata diretta a un provider. Prova un motore, se fallisce (quota finita, 500, timeout) passa al successivo in coda, registra quanti token sono stati usati e quanto costa.
- **`getFromCache` / `saveToCache`** — quasi ogni contenuto costoso (testo di un'audioguida, un MP3, il risultato di una ricerca) viene generato UNA volta e poi servito dalla cache per sempre. La cache vive nella tabella Supabase `api_cache`; gli MP3 vanno in uno storage bucket (`audio_cache`).

## 4. Il database: Supabase (Postgres)

Tutto lo stato persistente vive su **Supabase**, un Postgres gestito con REST automatica (PostgREST), autenticazione utenti integrata, storage file e regole di sicurezza a livello di riga (RLS). Le tabelle principali:

- **`shared_pois`** — la tabella dei punti di interesse, oggi **8,5 milioni di righe** in tutto il mondo. Ha nove trigger che scattano a ogni scrittura (sincronizzano le coordinate geografiche PostGIS, assegnano i raggi di geofencing, proteggono le colonne di revisione editoriale, e uno — da tenere d'occhio — fa una chiamata HTTP sincrona di arricchimento quando un nuovo POI arriva già con Wikipedia/Wikidata).
- **`poi_details`** — testo e foto arricchiti (Wikipedia, Wikidata, Commons, Foursquare).
- **`poi_audioguides`** — il testo dell'audioguida vera e propria, con chiave `(poi_id, lingua, personaggio)`: la stessa audioguida non si rigenera mai due volte per la stessa combinazione.
- **`user_profiles`**, **`user_quotas`**, **`global_quotas`** — utenti, crediti, quote.
- **`api_usage_logs`** — quanto è costata ogni chiamata AI/TTS, per il controllo budget.
- **`system_errors`** — errori applicativi (letti dal pannello admin, e ora anche inoltrati a Sentry, vedi §14).
- **`api_cache`** — cache generica chiave/valore per tutto ciò che non merita una tabella propria (compreso lo stato del canarino di salute, §14).

Quattro **Edge Function** scritte in Deno (`supabase/functions/`) duplicano parte della pipeline di arricchimento lato Supabase, per i casi in cui serve reagire direttamente a un evento del database senza passare dal server Express.

## 5. Come nasce un POI (e come diventa un'audioguida)

1. **Scoperta**: `poiDiscovery.runOverpassDiscovery()` interroga OpenStreetMap (via Overpass, con mirror multipli perché il servizio pubblico è inaffidabile — vedi §12) per popolare automaticamente le zone non ancora coperte, marcando i nuovi POI `status='auto'`.
2. **Arricchimento**: quando un utente apre una scheda vuota, `enrichmentService.ensurePoiDetails()` chiama `/api/poi/enrich`, che va a cercare in ordine Wikipedia → Wikidata → Wikimedia Commons → Foursquare, e scrive il risultato in `poi_details`. Una volta arricchito, non si tocca più.
3. **Audioguida**: `audioguideService.getOrCreateAudioguideText()` chiede al server (`/api/regenerate`) un testo scritto da un modello AI (motore scelto da `callUniversalAi`), radicato sui fatti già raccolti — mai inventato dal nulla, per la regola "niente allucinazioni" (§8).
4. **Voce**: il testo passa al motore di sintesi vocale (§7) e il risultato MP3 finisce in cache: la stessa frase, con la stessa voce, non si sintetizza mai due volte.
5. **Manutenzione**: un cron Vercel notturno (`/api/poi/batch-enrich`, ogni notte alle 3) arricchisce in background i POI rimasti scoperti.

## 6. Il geofencing: come l'app "sa" che sei arrivato

Tre implementazioni indipendenti, stesso comportamento:

- **Web** (`src/services/locationService.ts` + `src/lib/geofencing/*`): un singleton che possiede il watch della posizione del browser, il grafo degli elementi audio e la coda vocale. Funziona solo mentre la scheda è aperta e visibile.
- **Android** (`ItaintaBackgroundPoiService.kt`): un **Foreground Service** — il tipo di processo Android che il sistema non uccide facilmente — con un proprio database locale (Room), il proprio client Supabase, il proprio motore Text-to-Speech di sistema, un `BootReceiver` che lo riavvia dopo un riavvio del telefono e un `ServiceWatchdog` che lo tiene vivo.
- **iOS** (`ios/App/App/*.swift`): `BackgroundPoiManager.swift` usa gli aggiornamenti di posizione in background di CoreLocation con una macchina a stati che replica la logica Android, `SpeechQueue.swift` gestisce la voce con AVSpeechSynthesizer.

La precisione del trigger è calcolata dal **perimetro reale del luogo** quando esiste (non un semplice cerchio attorno a un punto), poi dall'ingresso, poi dalla distanza dalla strada — a piedi il criterio più stretto vince, in auto la strada ha priorità perché a 50 km/h il perimetro esatto non conta.

Le tre implementazioni comunicano tramite `localStorage` (le impostazioni che l'utente sceglie sul web) e un ponte Capacitor (`ItaintaBackgroundPoiPlugin`), oltre a un secondo canale audio dedicato (`WipBackgroundAudioPlugin`) per far suonare l'MP3 anche quando la webview non gira.

## 7. La voce: sintesi vocale a tre livelli, mai muta

**Livello 1 — Azure Speech / Google TTS (qualità neurale)**: la voce "vera", quella usata nella grande maggioranza dei casi. `server.ts` prova prima Azure (fino a un tetto mensile di caratteri gratuiti), poi ripiega su Google.

**Livello 2 — voce di sistema nativa (fallback che non muore mai, aggiunto 29/08/2026)**: se Azure e Google non rispondono (rete assente, quota finita, errore), l'app non resta mai muta. Sull'app nativa, un motore *dentro il plugin* (non nella webview) parla da solo — `TextToSpeech` Android o `AVSpeechSynthesizer` iOS — anche a schermo spento e servizio in background attivo. È stato aggiunto perché prima, in quel caso, l'audioguida taceva senza dire nulla.

**Livello 3 — Web Speech del browser**: ultimo ripiego sul web puro, quando non c'è nemmeno il canale nativo.

Il personaggio della voce (Nicky, femminile, o Dante, maschile) è configurabile e coerente su tutti e tre i livelli, in sette lingue.

## 8. La catena AI: cinque motori, mai la stessa voce due volte inventata

Ogni generazione di testo (audioguida, itinerario, risposta in chat) passa da `callUniversalAi`, che prova i motori in quest'ordine (aggiornato 29/08/2026 dopo prove dal vivo):

**Groq → Gemini → Agnes → Together → Mistral**, con **DeepSeek** riservato solo alle richieste in cui l'utente aspetta in diretta (mai in coda di sfondo, per non far pagare a un utente in attesa la lentezza di un batch). **Cerebras è stato tolto dalla coda automatica** (il piano gratuito del fornitore è esaurito su tutte le chiavi disponibili) ma resta richiamabile a mano. Ogni motore ha più chiavi API in rotazione, e un motore che risponde "quota esaurita" va in pausa temporanea invece di essere ritentato a vuoto ogni volta.

**Regola anti-allucinazione**: nessun testo generato può inventare un luogo o un fatto. `verifyItineraryAntiHallucination` controlla che ogni tappa proposta in un itinerario esista davvero, prima di mostrarla. Stessa regola per le foto (§9): mai una foto presa "a tema" da uno stock, sempre e solo dal luogo vero (Wikipedia/Commons/Wikidata del soggetto specifico).

## 9. Foto: solo dal luogo vero

Regola non negoziabile, fissata dopo un incidente reale (una guida premium di La Spezia uscita con foto di un altro posto). Le foto arrivano SOLO da: l'articolo Wikipedia della città, Wikimedia Commons cercato per nome del monumento o per coordinate GPS, o le immagini Wikidata/sito ufficiale del POI stesso. Unsplash (foto stock generiche) è ammesso solo per illustrazioni dichiaratamente non specifiche, mai per un POI o una guida. **Nessuna foto è meglio di una foto sbagliata**: ogni componente grafico deve saper mostrare una scheda senza immagine.

## 10. Le "Gemme": i luoghi che meritano una deviazione

Un livello editoriale sopra i normali POI: le Gemme sono i luoghi scelti come attrazione principale di una zona — non solo monumenti, ma anche una spiaggia famosa, una strada del vino, un parco divertimenti, una località come le Cinque Terre. Regole assolute (sono sempre gemma, senza calcolo): siti UNESCO, "Borghi più belli d'Italia", luoghi con almeno un biglietto prenotabile su Viator/GetYourGuide/Tiqets. Per il resto, un punteggio calcolato sulle visualizzazioni Wikipedia (12 mesi, tre lingue), con soglie per zona (una cella geografica di 0,1° deve avere tra il 10% e un tetto massimo di gemme) e una deduplica per non avere due gemme identiche a 300 metri di distanza. Ogni gemma deve avere foto, testo e audioguida — mai una scheda vuota.

## 11. Itinerari, navigazione, Guida Premium

- **Itinerari generati al volo**: l'utente descrive cosa vuole (durata, interessi), l'AI compone un percorso di tappe reali, verificate contro l'allucinazione. Le tappe diventano automaticamente POI veri sulla mappa (`/api/poi/from-itinerary`), con foto, testo e audioguida disponibili come ogni altro luogo.
- **WIP Nav**: un navigatore pedonale/auto vero e proprio, costruito su OSRM (instradamento open source) con istruzioni vocali svolta-per-svolta, che si intreccia con l'audioguida (quando arriva una svolta importante, la voce del navigatore interrompe brevemente quella dell'audioguida, poi questa riprende).
- **Guida Premium ("Guida d'Autore")**: un prodotto pagato, un vero e proprio libro-audioguida generato dall'AI per un'intera destinazione multi-giorno, con capitoli, un audiolibro capitolo per capitolo, un'"Intervista impossibile" (dialogo a due voci tra la guida e un personaggio storico), esportabile come PDF stampabile o EPUB.

## 12. Fonti geografiche: perché così tante

- **OpenStreetMap / Overpass** — la fonte primaria per scoprire nuovi POI, ma i server pubblici Overpass sono inaffidabili in produzione (5 mirror diversi provati, spesso giù): mai una dipendenza a runtime, i dati vengono importati offline via **QLever** (un motore di query più stabile per Wikidata/OSM) e scritti nel database, non richiesti al volo.
- **Wikidata / Wikipedia / Wikimedia Commons** — testo, immagini, e collegamenti (per esempio l'ID RCDB delle montagne russe o l'ID del World Waterfall Database, usati come link invece di importare da quei siti, che non concedono licenza di scraping).
- **Nominatim** — geocodifica indirizzo→coordinate (limite 1 richiesta/secondo, rispettato).
- **CARTO** — le mattonelle (tile) della mappa di base (serve una chiave gratuita dal 26/08/2026, prima le richieste anonime funzionavano).
- **Mapbox / Geoapify** — geocodifica e instradamento alternativo.
- **OSRM** — instradamento pedonale/auto per il navigatore.

## 13. Monetizzazione: crediti, non abbonamenti a fasce

Il modello attuale è un **portafoglio di crediti** (`src/lib/pricing.ts`): l'utente compra crediti (Stripe sul web, RevenueCat/Google Play Billing su Android), li spende per ogni audioguida/funzione premium tramite la funzione Postgres `consume_credits` (che consuma prima i crediti "guadagnati" gratuitamente, poi quelli comprati). Esiste ancora, in parallelo, un vecchio sistema di quota giornaliera gratuita/premium (`quotaManager.ts`) non ancora rimosso — chi tocca funzioni a pagamento deve verificare entrambi i percorsi.

I rimborsi sono **sempre in crediti**, mai in denaro reale: una rettifica sul portafoglio È il rimborso, niente richieste di storno a Stripe o RevenueCat.

Ogni POI con un biglietto prenotabile su **Viator**, **GetYourGuide** o **Tiqets** porta un link con codice di affiliazione — la commissione su quelle vendite è un'altra fonte di ricavo, separata dai crediti.

## 14. Monitoraggio: come sappiamo se qualcosa si rompe (aggiunto 30/08/2026)

Prima di questa data, l'unico modo di scoprire un guasto era che un utente si lamentasse — è già successo un blackout di 13 ore causato da un bug silenzioso. Ora ci sono **quattro reti di sicurezza indipendenti**:

1. **Canarino interno** (`/api/canary/run`, ogni mattina alle 5): testa dal di dentro 17 servizi esterni (Groq, Stripe, Azure, Mapbox...), il budget mensile AI, e simula il geofencing su tracce GPS reali.
2. **Sentry**: cattura ogni errore applicativo **in tempo reale**, non una volta al giorno — email immediata. Il primo giorno di funzionamento ha già catturato un errore vero (un timeout del database, risolto lo stesso giorno).
3. **Checkly**: controlli esterni sintetici — un controllo ogni 5 minuti che il server risponda, un controllo ogni ora che la app si carichi davvero in un browser vero. Vede quello che il canarino interno non può vedere (un dominio giù, un certificato scaduto, un deploy rotto).
4. **UptimeRobot**: il controllo più semplice, "il sito risponde?", ogni 5 minuti.

A queste si aggiunge **PostHog**, non per gli errori ma per capire cosa fanno gli utenti: tre eventi scelti a mano (acquisto crediti, audioguida generata, utente che sbatte contro il tetto di quota) — deliberatamente NON ogni interazione, per non sforare il piano gratuito su un'app con milioni di punti sulla mappa.

Tutti e quattro i servizi hanno una card riassuntiva nel **pannello di amministrazione** (Diagnostica → Monitoraggio esterno), così non serve aprire quattro siti diversi per sapere come sta l'app.

## 15. Il pannello di amministrazione

Una sezione riservata (accesso per email autorizzata) con: il canarino di salute, il monitoraggio esterno, gli interruttori delle feature flag (spegnere una funzione guasta senza dover rifare un deploy), la gestione della community (approvazione foto), il registro degli errori di sistema, le statistiche di utilizzo, la revisione dei POI generati automaticamente.

## 16. Community e "Vision"

Gli utenti possono proporre foto di luoghi che l'app non conosce ancora (icona a fotocamera magenta sulla mappa). Ogni proposta passa da un'**approvazione della redazione** prima di diventare visibile agli altri — moderazione, non pubblicazione automatica. L'anonimato è totale: nessun nome utente associato pubblicamente al contributo.

## 17. Offline

L'app scarica in anticipo le mattonelle della mappa e gli MP3 delle audioguide di un pacchetto scelto dall'utente (una città, un itinerario), per continuare a funzionare senza rete — importante perché il roaming dati all'estero spesso manca o è a singhiozzo. Il testo offline è unico per scelta dell'utente (non si mischia con una versione online diversa a seconda della connessione).

## 18. Le tre app native: cosa contengono davvero

- **Android** (`android/app/src/main/java/com/itaintasca/app/`): oltre al servizio di geofencing (§6), gestisce le notifiche del cruscotto di navigazione (visibili anche a schermo spento), gli acquisti in-app tramite RevenueCat, un database Room locale per i pacchetti offline, e il plugin che fa da ponte con la webview.
- **iOS** (`ios/App/App/*.swift`): stessa API verso il JavaScript, stessi eventi, stesse chiavi di configurazione di Android — porta "gemella" scritta a mano, non generata automaticamente. La build di produzione avviene solo su CI (macOS runner GitHub Actions), non in locale.
- **Pubblicazione**: entrambe le app sono state inviate e accettate dai rispettivi store nell'ultima settimana di agosto 2026 (Google Play e Apple App Store).

## 19. Sicurezza e conformità

- Nessuna chiave di terze parti raggiunge mai il client (§3).
- Quattro pagine legali (privacy, termini, cancellazione account, supporto) pubblicate su wip.guide, richieste da entrambi gli store.
- Un incidente di sicurezza reale (28/08/2026): il repository GitHub era **pubblico** con la chiave di servizio Supabase (`service_role`, accesso completo al database) visibile nella cronologia — la chiave è stata ruotata.
- Le colonne di revisione editoriale dei POI (stato verificato, gemma, nascosto) sono protette da un trigger di database che un utente normale non può aggirare nemmeno con accesso diretto all'API.

## 20. Backup

Il codice sorgente, la cronologia Git, e la memoria di lavoro di questa AI vengono copiati su un disco esterno (`E:\0 BACKUP WIP AGOSTO26\`) con `robocopy` in modalità mirror (aggiorna, aggiunge, e rimuove ciò che non esiste più nella sorgente). Aggiornato il 30/08/2026 subito dopo la pubblicazione sui due store.

---

## Appendice — Elenco completo delle API e dei servizi esterni

*(Verificato leggendo direttamente `server.ts`: ogni chiave elencata è davvero usata da almeno una rotta.)*

### Intelligenza artificiale (testo)
| Servizio | Uso | Note |
|---|---|---|
| **Groq** | motore primario, quasi tutte le generazioni | 3 chiavi in rotazione, gratuito con tetto giornaliero |
| **Google Gemini** | secondo nella coda dal 29/08 | 9 chiavi in rotazione, gratuito |
| **Agnes AI** | terzo, più lento (5-18s) ma affidabile | 4 chiavi |
| **Together AI** | riserva | credito esaurito attualmente |
| **Mistral** | riserva | credito esaurito attualmente |
| **DeepSeek** | solo con l'utente in diretta, mai in coda di sfondo | a pagamento, saldo monitorato |
| **Cerebras** | fuori dalla coda automatica dal 29/08 | piano gratuito esaurito |
| **OpenAI (GPT)** | usato in alcune rotte specifiche (vision, editing immagini) | |
| **OpenRouter** | riserva per l'editing immagini admin | |
| **Omniroute** | motore self-hosted sul droplet, mai nel fallback automatico | |

### Voce (sintesi vocale)
| Servizio | Uso |
|---|---|
| **Azure Speech** | voce neurale primaria |
| **Google Text-to-Speech** | ripiego se Azure non risponde/quota finita |
| **ElevenLabs** | disponibile, uso limitato |
| **TextToSpeech di sistema (Android) / AVSpeechSynthesizer (iOS)** | ripiego che non muore mai, dentro il plugin nativo |

### Mappe e geografia
| Servizio | Uso |
|---|---|
| **CARTO** | mattonelle della mappa di base |
| **Mapbox** | geocodifica, mattonelle alternative |
| **Geoapify** | routing, geocodifica |
| **OpenStreetMap / Overpass** | dati grezzi dei POI (mai in runtime, solo import offline) |
| **Nominatim** | indirizzo → coordinate |
| **OSRM** | instradamento pedonale/auto per WIP Nav |
| **OpenRouteService (ORS)** | instradamento alternativo |
| **Google Maps** | link "apri in Google Maps", alcune chiamate lato client |

### Contenuti sui luoghi
| Servizio | Uso |
|---|---|
| **Wikipedia / Wikidata / Wikimedia Commons** | testo e foto, fonte primaria e obbligatoria |
| **Foursquare** | dati commerciali (orari, categorie) |
| **TripAdvisor** | recensioni e dati aggiuntivi |
| **Unsplash** | SOLO illustrazioni generiche, mai per un luogo reale |

### Eventi e biglietti
| Servizio | Uso |
|---|---|
| **Ticketmaster** | eventi/concerti |
| **Viator** | esperienze ed escursioni prenotabili, con affiliazione |
| **GetYourGuide (GYG)** | come sopra |
| **Tiqets** | biglietti museali, con affiliazione |

### Meteo e ambiente
| Servizio | Uso |
|---|---|
| **Open-Meteo** | meteo corrente, gratuito solo per uso non commerciale (verificato) |
| **OpenAQ** | qualità dell'aria |

### Pagamenti
| Servizio | Uso |
|---|---|
| **Stripe** | acquisti crediti sul web |
| **RevenueCat** | acquisti in-app Android/Google Play Billing |

### Monitoraggio e osservabilità (aggiunti 30/08/2026)
| Servizio | Uso |
|---|---|
| **Sentry** | errori applicativi in tempo reale |
| **Checkly** | controlli sintetici esterni (uptime + browser reale) |
| **UptimeRobot** | controllo di disponibilità di base |
| **PostHog** | analytics di prodotto (eventi scelti a mano) |

### Infrastruttura
| Servizio | Uso |
|---|---|
| **Supabase** | database Postgres, autenticazione, storage, edge function |
| **Vercel** | hosting del server/API, cron job, dominio wip.guide |
| **GitHub** | codice sorgente, CI per la build iOS |
| **Droplet (DigitalOcean)** | processi di semina/arricchimento dati fuori da Vercel, quando servono ore di elaborazione continua |

---

## Stack tecnologico, in breve

- **Frontend**: React 19, Vite, Tailwind CSS v4, Leaflet (mappa), TanStack Query.
- **Backend**: Node.js/Express (TypeScript, quasi tutto `@ts-nocheck` per velocità di sviluppo), bundlato con esbuild.
- **Database**: Postgres via Supabase, PostGIS per i dati geografici, RLS per la sicurezza a livello di riga.
- **App native**: Kotlin (Android), Swift (iOS), tramite Capacitor come ponte con il codice web.
- **Hosting**: Vercel (serverless), Supabase Cloud.
- **CI/CD**: GitHub Actions per la build iOS; deploy manuale (`vercel --prod`) per il resto.
- **Nessun framework di test automatico**: la verifica è `tsc --noEmit` (tipi) più prova manuale/in strada.
