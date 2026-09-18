# NAVIGATORE A SCHERMO SPENTO — specifica unica (JS · Android · iOS)

Ordine del committente (18/09/2026): «il navigatore, sia nell'audioguida che nei
percorsi, deve funzionare anche a schermo spento. È fondamentale».

## Il problema
Le svolte ("fra 100 metri gira a destra", "sei arrivato") le calcola e le dice
il JS nella WebView (`useWalkingNavigation.ts` per la tappa singola,
`giroDriver.ts` + `tourService.ts` per giri/percorsi). A schermo spento la
WebView viene congelata: il navigatore tace. Il servizio nativo di background
invece resta vivo (foreground service Android / CLLocationManager iOS) e riceve
i fix GPS: oggi in navigazione fa solo da cruscotto muto.

## La soluzione: un "follower" nativo con passaggio di consegne a battito
- Il JS CONSEGNA al nativo il percorso già pronto (manovre con testo GIÀ
  tradotto + tracciato). Il nativo non traduce e non calcola percorsi.
- Finché il JS è vivo manda un BATTITO (heartbeat) e parla LUI (ha la regia
  audio completa). Se il battito manca da più di 12 s, PARLA IL NATIVO.
- Il nativo tiene SEMPRE il conto delle manovre (anche quando tace), così al
  passaggio di consegne non ripete né salta nulla.

## Contratto del plugin `ItaintaBackgroundPoiPlugin` (4 metodi nuovi)
1. `setNavRoute({ routeJson: string })` → `{ ok: boolean }`
   `routeJson` = JSON:
   ```
   {
     "id": "stringa",
     "passi": [ { "lat": 44.1, "lon": 10.1, "testo": "Gira a destra in Via Roma", "tipo": "depart" | "turn" | "arrive" } ],
     "indice": 0,                     // prossima manovra secondo il JS
     "linea": [[lat, lon], ...],      // tracciato decimato (≤ 400 punti), può essere []
     "modelloLontano": "Tra {m} metri, {i}",
     "fraseFuoriPercorso": "Sei fuori percorso. Apri l'app per ricalcolare.",
     "finale": true                   // true: l'ultimo passo 'arrive' chiude la navigazione
   }
   ```
   Sostituisce il percorso precedente e azzera lo stato del follower
   (idx = indice, minDist = +inf, insiemi "detti" vuoti, finito = false,
   fuori percorso azzerato). Il battito si considera FRESCO al momento della
   chiamata (lastHeartbeat = adesso). JSON non valido o `passi` vuoto → `{ok:false}`.
   Se serve, ALZA la frequenza dei fix del servizio (vedi sotto).
2. `clearNavRoute()` → void. Toglie il percorso; ripristina la frequenza dei fix.
3. `navHeartbeat({ indice: number, dettiVicino?: number[], dettiLontano?: number[] })` → void.
   lastHeartbeat = adesso; unisce gli insiemi; se `indice` > idx → idx = indice, minDist = +inf.
   Senza percorso attivo: no-op.
4. `getNavProgress()` → `{ attivo: boolean, id: string, indice: number, dettiVicino: number[], dettiLontano: number[], nativoAlComando: boolean, ultimoTestoVicino: string, ultimoTestoLontano: string }`
   `nativoAlComando` = il battito è scaduto. `ultimoTesto*` = il `testo` (passo) dell'ultima
   manovra che IL NATIVO ha detto a voce (vicino / lontano), "" se nessuna.

Lo stato vive in memoria (singleton/static condiviso fra plugin e servizio): se
il processo muore il percorso si perde, va bene così.

## Algoritmo del follower (IDENTICO su Kotlin e Swift)
Costanti:
`HEARTBEAT_STALE_MS=12000, NEAR_M=30, FAR_MIN_M=50, FAR_MAX_M=150, ARRIVE_M=25,
LEAVE_STOP_M=45, PASSED_MARGIN_M=15, MISSED_MARGIN_M=40, SKIP_NEXT_M=40,
MAX_ACC_M=60, OFFROUTE_M=70, OFFROUTE_MS=20000, BACK_ON_ROUTE_M=40, DEDUPE_MS=20000`

`onFix(lat, lon, accuracyM, nowMs)`:
```
se nessun percorso o finito → return
se accuracyM > MAX_ACC_M → return
jsVivo = (nowMs - lastHeartbeat) < HEARTBEAT_STALE_MS
out = null ; tipoOut = ""            // al massimo UNA frase per fix
ripeti al più passi.size volte:
  p = passi[idx]
  se p.tipo == "depart" && idx+1 < n: dettiVicino += idx ; dettiLontano += idx ; avanza(); continue
      // AGGIUNTA 18/09 sera: la partenza si salta SEMPRE (come tourService.aggiornaPasso):
      // tenerla come prossima manovra bloccava l'indice partendo lontani dal tracciato.
  d = metri(qui, p)
  se idx+1 < n: dn = metri(qui, passi[idx+1]); se dn < d && dn < SKIP_NEXT_M → avanza(); continue
  minDist = min(minDist, d)
  se p.tipo == "arrive":
      se d <= ARRIVE_M && idx ∉ dettiVicino: dettiVicino += idx ; se p.testo != "" → out = p.testo, tipoOut="vicino"
      se idx ∈ dettiVicino && idx == n-1 && finale → finito = true
      altrimenti se idx ∈ dettiVicino && d > LEAVE_STOP_M && idx+1 < n → avanza(); continue
      break
  se d <= NEAR_M && idx ∉ dettiVicino:
      dettiVicino += idx ; dettiLontano += idx ; se p.testo != "" → out = p.testo, tipoOut="vicino"
  altrimenti se idx ∈ dettiVicino && d > minDist + PASSED_MARGIN_M → avanza(); continue
  altrimenti se idx ∉ dettiVicino && minDist < 60 && d > minDist + MISSED_MARGIN_M → avanza(); continue
  altrimenti se p.tipo == "turn" && idx ∉ dettiLontano && FAR_MIN_M <= d <= FAR_MAX_M && p.testo != "":
      dettiLontano += idx
      out = modelloLontano con {m} = arrotonda(d/10)*10 (minimo 10) e {i} = p.testo con la PRIMA lettera minuscola ; tipoOut="lontano"
  break
avanza(): idx += 1 ; minDist = +inf   (mai oltre n-1)

FUORI PERCORSO — solo se !jsVivo, out == null e linea ha ≥ 2 punti:
  dl = distanza minima punto→polilinea (proiezione sui SEGMENTI, non sui vertici)
  se dl > OFFROUTE_M + accuracyM/2:
      se fuoriDa == 0 → fuoriDa = nowMs
      altrimenti se nowMs - fuoriDa > OFFROUTE_MS && !fuoriDetto → fuoriDetto = true ; out = fraseFuoriPercorso
  altrimenti se dl < BACK_ON_ROUTE_M → fuoriDa = 0 ; fuoriDetto = false

se out != null && !jsVivo && (out != ultimoDetto || nowMs - ultimoDettoTs > DEDUPE_MS):
    ultimoDetto = out ; ultimoDettoTs = nowMs
    se tipoOut=="vicino" → ultimoTestoVicino = p.testo ; se "lontano" → ultimoTestoLontano = p.testo
    PARLA(out)
```
NOTA: gli insiemi e l'indice si aggiornano SEMPRE, anche quando jsVivo (il
nativo tace ma tiene il conto): è quello che evita le ripetizioni al cambio.

`PARLA(testo)`: la STESSA strada interna che usa già il metodo del plugin
`speakText` con `kind:"nav"` a servizio acceso (coda TTS del servizio, fuoco
audio da navigatore, ducking dell'audioguida). NON creare un secondo motore TTS.

## Correzioni dalla REVISIONE indipendente (18/09/2026 notte) — valgono su ENTRAMBE e PREVALGONO sul blocco dell'algoritmo qui sopra
- `HEARTBEAT_STALE_MS = 8000` (non 12000): fra il congelamento della pagina e
  la scadenza del battito le svolte non le dice nessuno; il JS batte ogni 2-4 s.
- **Tappa sfiorata**: nel ramo `arrive`, se `idx ∉ dettiVicino`, `idx+1 < n`,
  `minDist < 60` e `d > minDist + MISSED_MARGIN_M` → `dettiVicino += idx; avanza(); continue`.
  La guida parte dal geofence a 30-50 m: chi ascolta da lì e riparte non entra
  mai nei 25 m, e l'indice restava sull'arrivo per tutto il resto del giro.
- **Il battito toglie la pausa**: in `heartbeat`, `inPausa = false` e firma del
  cruscotto azzerata. In pausa il JS ritira il percorso e non batte: se batte
  non è in pausa. Una pausa presa a schermo spento può non arrivargli mai
  (App.tsx scarta le azioni del cruscotto più vecchie di 60 s).
- **Svolta superata**: `d > minDist + max(PASSED_MARGIN_M, accuratezza)`.
- **Doppione** = stessa frase PER LA STESSA manovra (chiave `idx|frase`): due
  svolte diverse con lo stesso testo vanno dette entrambe.
- **Foto**: se la tappa calcolata è diversa da quella dell'ultimo stato JS, il
  cruscotto si ridisegna SENZA foto e senza «prossima» (sono della tappa di
  prima: nessuna foto è meglio della foto sbagliata).
- **Pagina ricreata**: al `load()` del plugin il follower si svuota
  (`clear` + cadenza GPS normale): il JS nuovo non sa di aver consegnato un
  percorso e non lo ritirerebbe mai. Il giro si riconsegna da solo al primo fix.
  NON allo smontaggio: se la pagina muore a schermo spento la guida continua.
- **CONTATO ≠ DETTO** (la correzione più importante). `dettiVicino/dettiLontano`
  sono la CONTABILITÀ: si riempiono anche quando il nativo tace (JS vivo) e
  servono solo ad avanzare. `dettiVicinoDavvero/dettiLontanoDavvero` dicono
  cosa è stato detto davvero: riferito dal battito del JS, o pronunciato dal
  nativo. Regole: si parla se `idx ∉ contabilità` OPPURE `!jsVivo && idx ∉
  davvero` (una svolta contata in silenzio negli 8 s dopo il congelamento la
  dice il nativo appena prende il comando, se è ancora entro la soglia);
  `getNavProgress` restituisce SOLO i `davvero` (la contabilità muta, tornata
  al JS, gli faceva saltare un annuncio a schermo acceso); l'arrivo finale
  mette `finito` solo col nativo al comando (col JS vivo chiude lui).
- **Un canale, un proprietario** (JS, `navNativo`): `'tappa'` e `'giro'`. La
  tappa singola vince finché è attiva; ognuno batte e ritira solo il proprio
  percorso. Il giro riconsegna da solo quando la tappa lascia.
- **Riallineamento solo dopo un vero congelamento**: l'evento
  `wip-nav-nativo-progresso` parte solo se il buco di battito è ≥ 8 s, non a
  ogni focus. La tappa singola adotta solo i «detti» (l'indice no: si rimette
  in pari per progressione lungo il tracciato); il giro chiude le tappe che il
  nativo ha superato (`completaTappa`) e allinea il passo
  (`allineaPassoDaNativo`), e confronta per INDICE, non per testo.
- **«Sei arrivato a X» nel giro**: il follower lo dice solo per le tappe senza
  guida o a cuffie spente; a cuffie accese lo dice già il geofence («Sei
  arrivato a X. <teaser>») e si sentiva due volte.
- **App.tsx**: «pausa» dal cruscotto NON si scarta dopo 60 s (il nativo ha già
  obbedito, e pausa/riprendi si disfano). «Termina» in ritardo (> 60 s) con un
  giro/percorso in corso NON si esegue alla cieca: è distruttivo e un percorso
  su misura è PAGATO — si chiede conferma a pagina visibile (`pc_termina_conferma`
  per il percorso, `tour_termina` + «?» per il giro); al «no» il JS riconsegna
  il percorso al follower, che nel frattempo l'aveva svuotato. Nella
  navigazione a tappa singola un «termina» in ritardo si scarta. «Salta» e
  «ricalcola» in ritardo si scartano sempre. Un «termina» fresco (< 60 s)
  vale subito, senza domande.
- **Limiti noti, accettati**: le regole «mancata» e «salta» del nativo sono a
  linea d'aria (su strade parallele possono sbagliare: al risveglio il JS
  corregge); una frase scaduta dietro un TTS lungo è persa; in muto a schermo
  spento anche il cruscotto resta fermo.
- **JS**: al risveglio, se il nativo non ha più il percorso ma il JS naviga
  ancora, lo riconsegna (`navNativo.alRitorno`). Il battito a TIMER vale solo a
  pagina visibile: da nascosta la pagina batte solo dai fix veri.

## Regole aggiunte in corso d'opera (18/09/2026 sera) — valgono su ENTRAMBE
- **Scadenza 20 s** delle frasi del navigatore in coda. La coda vocale è
  sequenziale e senza prelazione: un «gira a destra» uscito dietro a una guida
  di quattro minuti è un'indicazione SBAGLIATA. Campo additivo sull'elemento
  di coda (`scadenzaElapsedMs` Android / `scadenzaMs` iOS): `null` = non scade
  mai, cioè teaser, arrivi, guide e `speakText` restano com'erano.
- **Tasti del cruscotto a schermo spento** (notifica Android / Live Activity
  iOS): il JS è congelato e li vedrà solo al risveglio, quindi il follower
  obbedisce da solo — `pausa` alterna `inPausa` (in pausa `onFix` non fa nulla),
  `termina` = `clear()`, `riascolta` ridice `passi[idx].testo` solo se il
  nativo è al comando. `setRoute` e `clear` azzerano la pausa. Col JS vivo è
  innocuo: in pausa il JS ritira il percorso e alla ripresa lo riconsegna.
- **Muto**: lo gestisce il JS (`navNativo.allineaMuto`): in muto il percorso si
  TOGLIE dal nativo e si riconsegna quando il muto finisce. Il nativo non
  conosce il muto e non deve conoscerlo.
- **Fix finti**: i fix da posizione simulata sono scartati PRIMA del follower
  (gate esistente su entrambe): con un'app di mock il follower non parla.
  Il collaudo va fatto camminando davvero.

## IL CRUSCOTTO A SCHERMO SPENTO (18/09/2026 notte, committente: «anche il monitor, il banner deve funzionare sul display spento»)
Il cruscotto (notifica del foreground service su Android, Live Activity su
iOS) lo aggiorna il JS con `updateNavBanner`: a schermo spento restava fermo
all'ultimo stato. Quando il nativo è al comando lo aggiorna il follower.

Campi in più per passo (tutti opzionali, "" se assenti):
`"tappa"` (nome della meta della tratta a cui il passo appartiene),
`"manovraTipo"`, `"manovraVerso"` (tipo e verso OSRM grezzi → la freccia).

Alla consegna (`setRoute`) si precalcola `resto[i]` = somma delle distanze
haversine fra passi consecutivi da `i` alla fine, e `restoTappa[i]` = la stessa
somma fermandosi al primo passo `arrive` con indice ≥ i.

Il nativo RICORDA l'ultimo stato del cruscotto ricevuto dal JS (tutti i campi
di `updateNavBanner`: già oggi li riceve). A ogni fix, DOPO la logica delle
svolte, se `!jsVivo`, percorso attivo e non `finito`:
```
d            = metri(qui, passi[idx])
rimTappa     = d + restoTappa[idx]
rimTotale    = d + resto[idx]
nomeTappa    = passi[k].tappa del primo 'arrive' con k ≥ idx, se non vuoto; altrimenti quello dell'ultimo stato JS
istruzione   = passi[idx].testo se non vuoto; altrimenti quella dell'ultimo stato JS
passo/min    = ultimoJs.minutiRimanenti / ultimoJs.metriRimanenti se entrambi > 0, altrimenti 1/75 (a piedi)
minuti       = rimTotale * passo/min ; eta = ora locale (adesso + minuti) in "HH:mm"
progresso    = clamp(1 - rimTotale / ultimoJs.metriTotali, 0, 1) se metriTotali > 1, altrimenti -1
dist(x)      = x < 1000 → "<x arrotondato a 10> m" ; altrimenti "<x/1000 con 1 decimale> km"
titolo       = nomeTappa + " · " + dist(rimTappa)            (senza " · " se nomeTappa è vuoto)
corpo        = istruzione + " · " + dist(d) + "\n~" + eta
```
e si ridisegna il cruscotto per la STESSA strada interna di `updateNavBanner`
(stessi campi: nomeTappa, metriAllaTappa=rimTappa, istruzione, metriAllaSvolta=d,
metriRimanenti=rimTotale, eta, minutiRimanenti, progresso, manovraTipo/Verso dal
passo, inPausa del follower; indiceTappa/tappeTotali/foto/modo/metriTotali/
nomeProssima restano quelli dell'ultimo stato JS). Non più di un ridisegno ogni
3 s, e solo se cambia la firma `nomeTappa|istruzione|scatto(d)|round(rimTotale/100)|inPausa`
con `scatto(d)` = d<100 ? round(d/10) : 100+round(d/50) (la stessa del JS).
- Tasto `pausa` a schermo spento: un ridisegno subito con `inPausa` aggiornato.
- Arrivo finale (`finito`) detto dal nativo o tasto `termina`: il cruscotto si
  SPEGNE (come `updateNavBanner` con `attivo:false`).
- Col JS vivo il follower NON tocca il cruscotto.

## Frequenza dei fix mentre c'è un percorso attivo
Il follower ha bisogno di un fix ogni ~2 s / ~5 m, anche in "modalità
navigatore" (servizio avviato con `categories=['gemme:off']`, nessun POI).
- Android: se la LocationRequest del servizio è più lenta, mentre il percorso è
  attivo va ri-richiesta con PRIORITY_HIGH_ACCURACY, intervallo ≤ 2000 ms,
  minDistance ≤ 5 m; a `clearNavRoute` si torna ai valori di prima.
- iOS: `desiredAccuracy = kCLLocationAccuracyBestForNavigation`,
  `distanceFilter = 5`, `startUpdatingLocation()` garantito (non solo significant
  changes / regioni); a `clearNavRoute` si ripristina.
Il fix va passato al follower nel punto in cui il servizio riceve già le posizioni.

## Vincoli
- Thread-safety: plugin e callback GPS girano su thread diversi → sincronizzare.
- Niente nuove dipendenze. Commenti in italiano, stile del file.
- iOS: NON creare file Swift nuovi (il pbxproj si tocca a mano ed è fragile):
  mettere la classe del follower IN FONDO a un file già nel target
  (`BackgroundPoiManager.swift`). I metodi nuovi del plugin vanno dichiarati
  anche nell'elenco `pluginMethods` (CAPBridgedPlugin) se il plugin lo usa.
- Android: un file nuovo `NavFollower.kt` nel package del servizio va bene.
- Non cambiare il comportamento delle audioguide/teaser esistenti.
