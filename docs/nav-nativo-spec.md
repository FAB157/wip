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
`HEARTBEAT_STALE_MS=8000 (era 12000: vedi «Correzioni dalla REVISIONE» in fondo), NEAR_M=30, FAR_MIN_M=50, FAR_MAX_M=150, ARRIVE_M=25,
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

## REVISIONE 2 — verifica a schermo spento (21/09/2026) — PREVALE su tutto quanto sopra
Verifica a codice di 9 ispettori + verifica avversaria di ogni criticità
(43 segnalazioni, 26 confermate prima di questa revisione). Tutto additivo: JS
e nativo viaggiano nello stesso pacchetto (`capacitor.config` senza
`server.url`), un campo assente vale come prima. Identico su Kotlin e Swift.

### Contratto
1. `routeJson`, campi opzionali nuovi:
   - `"inPausa": false` — il follower nasce in pausa (percorso consegnato durante
     una pausa MANUALE del giro).
   - `"spegniCruscotto": true` — all'arrivo finale col nativo al comando il
     follower spegne il cruscotto SOLO se true. La tappa singola manda `false`
     quando c'è un giro/percorso in corso: il cruscotto dopo è del giro, e su
     iOS una Live Activity chiusa dal background non si riapre più.
   - `passi[].tappa` della tratta di RIENTRO dell'anello: il JS ci mette
     l'etichetta tradotta «Ritorno al punto di partenza» (prima era vuota e il
     cruscotto ripiegava sul nome di una tappa già visitata, con la sua foto).
2. `navHeartbeat({ indice, dettiVicino?, dettiLontano?, inPausa? })`: il battito
   PORTA la pausa del JS — `inPausa` assente = false. Sostituisce «il battito
   toglie la pausa». Motivo: in pausa manuale il percorso NON si ritira più (il
   follower vuoto non poteva obbedire a «Riprendi» dalla lock screen).
3. `getNavProgress()` restituisce anche `finito: boolean` e `terminato: boolean`.
   `terminato`: il follower è stato svuotato dal tasto «Termina» del cruscotto
   (`terminaDalBanner` = fotografia di `id`, `indice`, insiemi «davvero», poi
   `clear`); finché non arriva `setNavRoute`, `clearNavRoute` o il `load()` del
   plugin, `getNavProgress` restituisce la fotografia con `attivo:false,
   terminato:true`. Serve al «Termina» in ritardo seguito da «no»: il JS riprende
   prima il progresso fatto a schermo spento, poi riconsegna.
4. `speakText({ …, ttlMs? })`: `ttlMs > 0` = l'elemento di coda scade a
   adesso+ttl (stesso campo `scadenzaElapsedMs`/`scadenzaMs`). Il JS lo manda
   (20000) SOLO per le svolte del navigatore; teaser, arrivi e guide no.
5. Tasti del cruscotto (`navBannerAction`):
   - `pausa` = metti in pausa, `riprendi` = togli la pausa: azioni ESPLICITE e
     idempotenti, mai un'alternanza (Android `ACTION_NAV_RESUME`, iOS
     `WipNavAzione.riprendi`). L'interruttore invertiva lo stato del follower
     e non quello mostrato: durante la pausa AUTOMATICA di tourState (ferma da
     3 min, percorso NON ritirato) «Riprendi» metteva in pausa il follower.
   - `ts` (ms dal 1970, istante del TOCCO) su ENTRAMBE: su iOS l'intent lo
     scrive nell'App Group (`wipNavAzionePendenteTs`) e nella notifica. Senza,
     la regola dei 60 s di App.tsx non valeva mai su iOS.
   - `salta` e `ricalcola` il nativo non li sa fare: APRONO L'APP (Android:
     PendingIntent di Activity verso MainActivity, mai `startActivity` dal
     servizio — con target ≥ 31 è un trampolino bloccato; iOS: `Link
     itainta://nav/<azione>` anche su iOS 17) e arrivano al JS freschi.
   - `riascolta` anche su Android nella tappa singola ([Riascolta][Ricalcola]
     [Termina], come iOS). Se l'ha già detto il nativo (al comando), l'azione
     NON si inoltra al JS: sarebbe detta due volte.
   - `termina` = `terminaDalBanner()` (vedi 3).

### Follower
- **Pausa**: in pausa `onFix` si comporta come col JS vivo — TACE MA TIENE IL
  CONTO (niente frasi, niente «davvero», niente `finito`, niente fuori
  percorso) e il ramo «lontano» non si segna. Il GPS torna a riposo
  (`haPercorsoAttivo`/`richiedeFixFitti` falsi in pausa) e il cruscotto non si
  ridisegna a ogni fix (solo il ridisegno immediato di un tasto).
- **Istruzione del cruscotto**: `idxJs` = passo che il JS stava mostrando
  (impostato da `setRoute` e da OGNI battito, azzerato da `clear`).
  `arrivoSuperato` = c'è un passo `arrive` in [idxJs, idx). Allora:
  `istruzione = testo del passo`, oppure quella del JS solo se `idx <= idxJs`,
  altrimenti vuota (mai una svolta di una tratta prima); il nome del JS si usa
  solo se `!arrivoSuperato`; `tappaCambiata = arrivoSuperato || nomi diversi`
  (niente foto, niente «prossima»); `indiceTappa` = quello del JS + gli arrivi
  superati (tetto `tappeTotali`). In pausa lo stato JS ricordato NON sostituisce
  l'istruzione con «In pausa» (Kotlin già così, Swift allineato).
- **Arrivo finale** (solo l'ultimo `arrive` con `finale`), oltre ai 25 m:
  NEI PARAGGI = entro 60 m ininterrottamente da 45 s (la regola 3 del JS);
  SFIORATO = `minDist < 60 && d > minDist + max(40, accuratezza)` → si conta
  senza dirlo. Senza, chi non entrava nei 25 m teneva il GPS al massimo e il
  cruscotto acceso fino all'apertura dell'app, e poi sentiva «fuori percorso».
- **Fuori percorso**: si ridice se si è ancora fuori dopo 60 s dall'ultima
  volta, al massimo 2 ripetizioni per uscita; `setRoute`/`clear` e il rientro
  (< 40 m) azzerano il conto.
- **Riascolta**: su un `arrive` non ancora raggiunto NON si dice «Sei arrivato».
  Il nativo ridice la manovra solo nella tappa singola (`modo` "singola"
  dell'ultimo stato JS): nel giro «Riascolta» per il JS è la guida della tappa.
- **Progressione sul tracciato** (la regola «salto per progressione» del JS):
  alla consegna si calcolano i metri progressivi dei vertici della linea e di
  ogni passo proiettato su di essa (NaN oltre 50 m). A ogni fix, se chi cammina
  è sulla linea (≤ 25 m + accuratezza/2) e la PRIMA corrispondenza, cercata da
  300 m prima del passo corrente fino a 2 km dopo, è oltre il passo di più di
  40 m, i passi alle spalle (progressivo + 25 m < utente) si contano in silenzio.
  Mai oltre un `arrive` finché si è entro 45 m (la visita), mai oltre l'ultimo
  passo. La prima corrispondenza e non la più vicina: su un anello e su un
  «andata e ritorno» per la stessa strada vince quella più indietro. Serve
  dopo una pausa (GPS a riposo: in pausa il conto è debole) e dopo i buchi di fix.
- **«Tra N metri» CONTATO ≠ DETTO**: il preavviso si dice anche se contato in
  silenzio, se col nativo al comando nessuno l'ha detto davvero.
- **Nei paraggi** vale solo ininterrotto: un buco di fix > 15 s azzera i 45 s.
  E solo vicini anche LUNGO IL TRACCIATO (≤ 60 m dalla meta, prima
  corrispondenza da 300 m prima dell'arrivo, entro 60 m dalla linea), come la
  tappa singola del JS: una via sul retro dell'isolato non è «nei paraggi».
  Senza tracciato utile (arrivo a più di 50 m dalla linea) vale la linea d'aria.
- **Salta**: lasciando una tappa GIÀ RAGGIUNTA (`arrive` con idx in
  `dettiVicino`) la regola «il passo dopo è più vicino ed entro 40 m» confronta
  col PRIMO passo dopo `idx` che non sia `depart`: la svolta a pochi metri dalla
  porta si dice prima di farla, non 45 m dopo. Su un arrivo non ancora
  raggiunto resta `idx+1`: se la tratta dopo riparte per la stessa strada, la
  sua prima svolta è l'angolo appena girato per arrivare e si salterebbe la tappa.
- **«Tra N metri» solo in avvicinamento**: per lo STESSO passo si tiene una
  distanza di riferimento, che si sposta solo a scatti di ≥ 3 m (in giù o in
  su); il preavviso parte solo se `d < riferimento - 3`. Chi riparte da una
  tappa nel verso sbagliato non sente più «Tra 80 metri, gira a sinistra»
  mentre se ne allontana. (A scatti e non «il fix precedente»: a piedi con un
  fix ogni 2 s si fanno ~2,8 m e il confronto non scattava quasi mai.)
- **`metriDopo`** (campo opzionale del passo, metri LUNGO IL PERCORSO fino al
  passo seguente, da `step.distance`): se c'è, `resto`/`restoTappa` lo usano al
  posto della linea d'aria fra i due passi — metri, ETA e avanzamento del
  cruscotto giusti anche sui percorsi tortuosi.
- **Fuori percorso**: il battito del JS azzera il conto del nativo (col JS vivo
  è compito suo). Con `"fuoriSoloDopoAggancio": true` nel routeJson (partenza
  da un indirizzo lontano) il fuori percorso tace finché non si arriva entro
  60 m dalla linea.
- **Fotografia di «Termina»**: lo stato di quel momento, `finito` compreso.
- **Fix vecchi**: oltre 15 s non vanno al follower (Android e iOS). Il JS
  scarta la raffica di fix arretrati consegnata al disgelo della pagina.
- **Ridisegno di un tasto**: con l'ultimo fix BUONO visto dal follower.
  `updateNavBanner(attivo:false)` fa dimenticare l'ultimo stato JS (anche iOS).
- **iOS, orologio**: `CLOCK_MONOTONIC` (conta anche il sonno, come
  `elapsedRealtime`), non `systemUptime`.
- **Pagina ricreata**: Android, `load()` del plugin spegne anche il cruscotto
  (se il servizio è vivo) e dimentica l'ultimo stato JS. iOS: un ricaricamento
  della WebView dopo la morte del processo WebContent NON richiama `load()`: il
  JS (`navNativo`) alla prima visibilità della pagina svuota un percorso nativo
  che non ha consegnato lui.

### JS
- Pausa MANUALE: il percorso resta al follower (`inPausa`), la firma non cambia
  con la pausa; `impostaPausaNativa` manda subito un battito.
- Il CRUSCOTTO ha un proprietario come il percorso: la tappa singola finché è
  attiva (tasti compresi); il giro lo riprende quando lei lascia.
- Il servizio nativo acceso per il navigatore ha due proprietari (`tappa`,
  `giro`): si spegne solo quando lasciano entrambi, e all'arrivo della tappa
  singola solo dopo che la coda ha finito di dire «Sei arrivato».
- Al risveglio le azioni del cruscotto si applicano DOPO il riallineamento.
- `finito` dal nativo: la tappa singola chiude senza ridire l'arrivo, il giro
  chiude l'ultima tappa o il rientro (`concludiRientro`, e il rientro concluso
  non si riapre al fix dopo).
- `nativoAlComando()` (navNativo): c'è un proprietario, non in muto, e il
  battito manca da ≥ 8 s (vale ancora 3 s dopo il battito che chiude il buco:
  al risveglio l'azione in coda può arrivare dopo). Su iOS un «riascolta» del
  cruscotto già detto dal follower non si ripete nel JS; su Android non arriva
  proprio al JS.
- Fonti di riserva ORS/Geoapify (solo passi `continue`): se nessun passo è
  `arrive`, l'ULTIMO passo consegnato al nativo diventa `arrive`, con la frase
  d'arrivo già usata dal JS. Indici invariati.
- Percorso orfano (iOS, WebView ricaricata): la pulizia parte alla prima
  visibilità della pagina, non prima di 2,5 s dal caricamento (prima che App
  ascolti e che il giro sia ripristinato).
- Tappa singola finita con un giro in corso: niente `attivo:false`, il
  cruscotto passa al giro, e il proprietario `tappa` del servizio si rilascia
  dopo 3 s (il giro intanto si iscrive: dal background Android 12+ il servizio
  spento non si riaccende).

### La svolta sopra la guida MP3 (21/09/2026, ordine «risolvi tutte»)
Coda nativa (Android `GeofenceBroadcastReceiver`, iOS `SpeechQueue`), identica
sulle due piattaforme. Una frase `kind:"nav"` CON scadenza che arriva mentre
la coda suona l'MP3 di una guida: l'MP3 va in pausa (posizione salvata), la
frase si dice col TTS di sistema, poi l'MP3 riprende dal punto esatto. Altre
frasi nav valide arrivate intanto si dicono di seguito, prima della ripresa.
Se l'utente aveva messo in pausa l'MP3, la svolta si dice e l'MP3 resta in
pausa; Pausa/Play toccati durante la frase valgono a frase finita. Mai sopra
una telefonata o una perdita di focus. Teaser, guide lette dal TTS (il TTS non
sa riprendere da metà) e item senza scadenza: invariati, aspettano il turno.
È lo stesso trattamento che a schermo acceso riceve già la guida del JS
(AUD-01). Dopo un'interruzione, una frase del navigatore scaduta non si
riprende.

### Limiti noti (aggiunti)
- Una guida lunga letta dal TTS (senza MP3) tiene ancora in coda le svolte,
  che scadono dopo 20 s.
- Dopo l'arrivo della tappa singola a schermo spento, con un giro in corso, il
  giro resta muto fino al risveglio (canale nativo unico, riconsegna dal JS).
- Salta/Ricalcola dal cruscotto aprono l'app (sblocco): su Android il `ts` è
  l'istante in cui MainActivity riceve l'intent, non quello del tocco.

## REVISIONE 3 — batteria (23/09/2026) — PREVALE su «Frequenza dei fix» qui sopra
Ordine del committente «risolvi tutto» sull'audit batteria dell'audioguida.
Vincolo fisso: la logica dell'audioguida dei POI (quando scatta, cosa dice,
teaser, ordine incipit→AI) NON cambia; il ritmo del GPS si abbassa solo dove
non può ritardare un trigger, e torna quello di prima al primo movimento. Il
codice dei trigger e del follower non cambia. Valori IDENTICI su Kotlin e Swift.

### R-FERMO — percorso attivo, utente fermo (normativa per il follower)
- **Condizione d'ingresso**: percorso di navigazione attivo (`haPercorsoAttivo`
  / `richiedeFixFitti`), nessun POI in rotta che abbia armato il GPS, e nelle
  ultime **120 s** lo spostamento dal punto di ancoraggio è **< 20 m** e la
  velocità del fix corrente è **< 0,5 m/s**.
- **Ancora**: il primo fix della sosta. Ogni fix oltre 20 m dall'ancora, o con
  velocità > 0,8 m/s, mette l'ancora lì e la sosta riparte da zero; si entra
  quando l'ancora ha almeno 120 s E il fix corrente è < 0,5 m/s. Il tempo è
  quello del fix (Android `elapsedRealtimeNanos`, monotono; iOS l'istante di
  consegna, che senza lotti coincide). Un fix senza velocità dichiarata (iOS:
  `speed < 0`) vale velocità 0 (l'uscita la dà comunque lo spostamento).
- **«Armato» vince**: Android = il predittore ha armato per un POI (`isArmed`);
  iOS = il tier sarebbe armato (POI attivo entro `alertRad×3+150`, radar non
  ancora interrogato). In entrambi i casi il profilo «fermo» non si applica.
- **Profilo «fermo»**: Android `PRIORITY_BALANCED_POWER_ACCURACY`, intervallo
  **10 s** (min 10 s, nessun lotto); iOS `desiredAccuracy =
  kCLLocationAccuracyNearestTenMeters`, `distanceFilter = 10`.
- **Uscita, SUBITO**: al primo fix a **> 20 m** dall'ancora o con velocità
  **> 0,8 m/s** si torna al profilo di navigazione (Android HIGH_ACCURACY 2 s a
  piedi / 1 s in auto; iOS BestForNavigation, filtro 5 m). Isteresi voluta fra
  0,5 e 0,8 m/s: dentro quella fascia si resta nel profilo in cui si è.
- **Follower invariato**: riceve ogni fix come prima (uno ogni ~10 s da fermi),
  conta le manovre e le dice con le stesse regole; il gate dei fix vecchi
  (15 s) resta. Se un POI arma il GPS, vince la richiesta armata (come prima);
  quando disarma si torna al profilo deciso da R-FERMO.
- **Rete in più, facoltativa per piattaforma, solo per USCIRE prima**: se il
  riconoscimento dell'attività (Android Activity Recognition, iOS
  CoreMotion/MotionActivityGate) segnala camminata/corsa/bici/auto, le ancore si
  azzerano e il profilo di navigazione torna subito, senza aspettare il fix
  (che nel profilo «fermo» può arrivare dopo 10 s). Non fa MAI entrare in sosta.
  Android: `ActivityMonitor.onMovimento` → `ripartenzaDalSensore`.
- Costo atteso in cambio: alla ripartenza il navigatore resta al ritmo lento
  per 10–20 s al massimo (i primi 15–25 m), meno se l'attività la segnala prima.
- Android: `ItaintaBackgroundPoiService.aggiornaSoste` / `applyLocationRate` /
  `syncNavRate`, ancora in `service/AncoraFermo.kt`. iOS:
  `BackgroundPoiManager.aggiornaFermoNav` / `applyLocationTier` (chiave
  `navfermo-…`); ancore azzerate da `azzeraRiposiDaFermo` a ogni consegna,
  ritiro, pausa o ripresa del percorso e all'avvio. iOS non usa la rete
  dell'attività (facoltativa).

### R-SOSTA — fermi fra luoghi già raccontati (servizio POI)
Vale anche con un percorso attivo: lì toglie solo l'«armato», il profilo resta
quello da navigatore e R-FERMO decide se abbassarlo (uguale sulle due
piattaforme).
Nello stato ARMATO, se TUTTI i POI candidati che armano (finestra di attenzione
o raggio di armamento) sono già stati raccontati (Android `ARRIVED_FIRED`, iOS
lo stato equivalente «arrivedFired/done») e da **180 s** lo spostamento
dall'ancora è **< 25 m**, si passa al profilo di RIPOSO esistente (Android
BALANCED 20 s con lotti a piedi; iOS il tier economico). Al primo fix a
**> 25 m** dall'ancora si torna alla valutazione normale, che ri-arma se serve.
Mai se nel raggio c'è un POI non ancora raccontato. La valutazione dei trigger
continua su ogni fix, solo più radi. Stessa rete facoltativa dell'attività.

### R-BUSSOLA — gate di direzione
La bussola si spegne appena il gate di direzione ha deciso per il candidato
corrente (esito diverso da RIMANDA), o dopo **120 s** senza candidati; si
riaccende alla richiesta successiva del gate. Per non spostare i tempi della
guida, se nella stessa finestra armata la bussola era già stata chiesta e resta
un candidato non raccontato (non tappa d'itinerario), si riaccende un fix prima
(pre-riscaldamento), così all'arrivo seguente la lettura c'è come col sensore
sempre acceso; la PRIMA accensione di una finestra armata resta della sola
richiesta del gate. Un riposo per R-SOSTA non chiude la finestra armata.
«Candidato» = uno dei 5 più vicini valutati dal motore dei trigger, non tappa,
non `ARRIVED_FIRED`/`arrivedFired`, esclusi quelli per cui il gate ha appena
deciso in questo fix. La finestra armata si chiude quando il GPS torna davvero
a riposo (non per sosta).
Android: `BearingGate.decisa / preRiscalda / spegniSeInattiva / disattiva`.
iOS: `BearingGate.valuta` (spegne dopo la decisione se nessun altro rinvio è in
sospeso) / `preRiscalda` / `spegniBussolaSeInattiva` / `chiudiFinestra`,
chiamate da `evaluateTriggers` e `aggiornaProssimitaEDistanze`.
