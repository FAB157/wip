/**
 * NAVIGATORE A SCHERMO SPENTO — il ponte fra i navigatori JS e il servizio
 * nativo (18/09/2026, committente: «il navigatore, sia nell'audioguida che nei
 * percorsi, deve funzionare anche a schermo spento. È fondamentale»).
 *
 * IL PROBLEMA. Le svolte le calcolano e le dicono `useWalkingNavigation` (tappa
 * singola) e `giroDriver`/`tourService` (giri e percorsi): codice che gira
 * nella WebView. A schermo spento la WebView viene congelata — lo dice anche
 * `locationService` — e il navigatore taceva, mentre le audioguide a
 * geofencing, che vivono nel servizio nativo, continuavano a parlare.
 *
 * LA SOLUZIONE. Non si riscrive il navigatore in Kotlin e Swift: gli si
 * consegna il percorso GIÀ pronto (manovre col testo già tradotto + tracciato)
 * e il nativo — che i fix GPS li riceve anche a schermo spento — fa solo il
 * «follower»: tiene il conto delle manovre e le dice con la voce di sistema.
 * Il passaggio di consegne è a BATTITO: finché questa pagina è viva manda un
 * battito e parla lei, con tutta la sua regia audio (ducking, coda,
 * attraversamenti); se il battito manca da 8 s parla il nativo. Così non
 * conta sapere SE e QUANDO il sistema congela la WebView (cambia fra Android e
 * iOS e fra una versione e l'altra): conta solo che qualcuno stia parlando.
 *
 * Contratto e algoritmo: `docs/nav-nativo-spec.md` (identico su
 * `NavFollower.kt` e sulla classe `NavFollower` in `BackgroundPoiManager.swift`).
 *
 * Sul web e sulle build native più vecchie del JS ogni funzione qui è un
 * no-op silenzioso: il navigatore in-app resta quello di sempre.
 */
import { Capacitor } from '@capacitor/core';
import { ItaintaBackgroundPoi } from '../../plugins/ItaintaBackgroundPoi';
import { locationService } from '../../services/locationService';

export type TipoPassoNav = 'depart' | 'turn' | 'arrive';
export interface PassoNav {
  lat: number; lon: number; testo: string; tipo: TipoPassoNav;
  /**
   * Per il CRUSCOTTO a schermo spento (notifica Android / Live Activity iOS):
   * a pagina congelata lo ridisegna il follower, e gli servono il nome della
   * meta della tratta e la manovra OSRM grezza (la freccia). Opzionali.
   */
  tappa?: string; manovraTipo?: string; manovraVerso?: string;
  /**
   * (22/09/2026, additivo) Metri LUNGO il percorso da questo passo al
   * seguente. Il follower li usa per metri alla meta, ETA e avanzamento del
   * cruscotto; assente = linea d'aria fra i passi, come prima.
   */
  metriDopo?: number;
}

/**
 * UN CANALE, DUE NAVIGATORI, UN PROPRIETARIO (dalla revisione del 18/09). Il
 * nativo tiene UN percorso solo; «Naviga» verso una tappa e il giro possono
 * essere accesi insieme, e senza un proprietario il giro batteva i SUOI indici
 * sul percorso della tappa singola (svolte saltate), e ognuno poteva ritirare
 * il percorso dell'altro. Regola: la 'tappa' vince finché è attiva; il giro
 * riconsegna da solo al primo fix dopo che la tappa ha lasciato.
 */
export type CanaleNav = 'tappa' | 'giro';

/** "Tra {m} metri, {i}" — stessi segnaposto di useWalkingNavigation. */
const MODELLO_LONTANO: Record<string, string> = {
  it: 'Tra {m} metri, {i}',
  en: 'In {m} meters, {i}',
  fr: 'Dans {m} mètres, {i}',
  es: 'En {m} metros, {i}',
  de: 'In {m} Metern, {i}',
  ru: 'Через {m} метров {i}',
  zh: '{m}米后{i}',
};

/**
 * A schermo spento il nativo NON può ricalcolare (il percorso lo fa il server,
 * le frasi le compone il JS): dice una volta sola che si è fuori strada. Alla
 * riapertura dell'app il ricalcolo automatico del JS riparte da solo.
 */
const FUORI_PERCORSO: Record<string, string> = {
  it: 'Sei fuori percorso. Apri l\'app per ricalcolare.',
  en: 'You are off route. Open the app to recalculate.',
  fr: 'Vous êtes hors itinéraire. Ouvrez l\'application pour recalculer.',
  es: 'Te has salido de la ruta. Abre la app para recalcular.',
  de: 'Du bist von der Route abgekommen. Öffne die App, um neu zu berechnen.',
  ru: 'Вы сошли с маршрута. Откройте приложение, чтобы пересчитать.',
  zh: '您已偏离路线。请打开应用重新规划。',
};

const MAX_PUNTI_LINEA = 400;
const BATTITO_MIN_MS = 2000;       // non più di un battito ogni 2 s dai fix
const BATTITO_TIMER_MS = 4000;     // e uno ogni 4 s dal timer, anche da fermi
const BUCO_RIALLINEA_MS = 8000;    // = HEARTBEAT_STALE_MS del nativo: oltre, ha parlato lui
const FIX_RECENTE_MS = 20000;      // il timer batte solo se un fix vero è arrivato da poco

let proprietario: CanaleNav | null = null;
let idCorrente = '';
let firmaCorrente = '';
let passiCorrenti: PassoNav[] = [];
let ultimoJson: Record<string, any> | null = null;
let sospesoPerMuto = false;
let ultimoIndice = 0;
let dettiVicinoJs: number[] = [];
let dettiLontanoJs: number[] = [];
let ultimoBattitoTs = 0;
let ultimoBattitoDaFixTs = 0;
let timerBattito: ReturnType<typeof setInterval> | null = null;
let ascoltoRipresa = false;
/**
 * UN SOLO RIALLINEAMENTO IN VOLO, CONDIVISO (21/09/2026, verifica a schermo
 * spento). Prima era un flag: chi arrivava col riallineamento già partito
 * non poteva aspettarne l'esito. Ora è una promessa: il battito e
 * `riallineaSeScongelato` (le azioni del cruscotto al risveglio) aspettano
 * la STESSA, e un'azione in coda si applica solo dopo che il progresso fatto
 * dal follower a schermo spento è tornato qui.
 */
let promessaRiallineamento: Promise<void> | null = null;
/** Quando è finito l'ultimo riallineamento: è un «contatto» col nativo come un battito. */
let riallineatoTs = 0;
/**
 * Quando un battito ha trovato il nativo al comando da ≥ 8 s, cioè la
 * fine dell'ultimo buco: al risveglio l'azione del
 * cruscotto in coda può arrivare DOPO il primo battito, che il buco l'ha già
 * chiuso — vedi `nativoAlComando`.
 */
let fineBucoTs = 0;
const FINESTRA_RISVEGLIO_MS = 3000;
/**
 * LA PAUSA VIAGGIA COL PERCORSO (21/09/2026, REVISIONE 2 della spec). In
 * pausa MANUALE il giro non ritira più il percorso: resta al follower, in
 * pausa (tace ma tiene il conto), e «Riprendi» dalla lock screen trova
 * qualcosa da riprendere — prima il follower era vuoto e taceva fino
 * all'apertura dell'app. La pausa va in OGNI battito e in OGNI consegna.
 */
let pausaCorrente = false;
/**
 * IL CRUSCOTTO HA UN PROPRIETARIO come il percorso (21/09/2026). Notifica
 * e Live Activity sono UNA: con il giro e «Naviga» verso un POI accesi
 * insieme si sovrascrivevano, e ogni tasto (anche «Termina») finiva al giro.
 * La tappa singola lo tiene finché è attiva, tasti compresi; il giro lo
 * riprende quando lei lascia (evento 'wip-cruscotto-tappa-libero'). È un
 * flag SEPARATO dal proprietario del percorso: quello è null sul web, sulle
 * build vecchie o dopo un rifiuto del nativo, e il cruscotto c'è lo stesso.
 */
let cruscottoTappa = false;
/** Build nativa più vecchia del JS: i metodi non esistono, si smette di provare. */
let nativoSenzaMetodi = false;

function disponibile(): boolean {
  return !nativoSenzaMetodi && typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

/**
 * Douglas–Peucker in METRI su una polilinea [lat, lon]: tiene i punti che
 * servono perché nessun punto tolto disti più di `tolM` dalla linea che resta
 * (distanza dal SEGMENTO, non dalla retta: un percorso che torna sui suoi
 * passi non si appiattisce). Primo e ultimo punto sempre. Proiezione
 * equirettangolare locale sulla latitudine media: su un percorso a piedi
 * l'errore è trascurabile. Iterativa: niente ricorsione su migliaia di punti.
 */
function semplificaDP(pts: [number, number][], tolM: number): [number, number][] {
  const n = pts.length;
  if (n <= 2) return pts.slice();
  const M_GRADO = 111_320;
  const latMedia = (pts.reduce((s, p) => s + p[0], 0) / n) * Math.PI / 180;
  const kx = Math.cos(latMedia) * M_GRADO;
  const xs = pts.map(p => p[1] * kx);
  const ys = pts.map(p => p[0] * M_GRADO);
  const tieni = new Uint8Array(n);
  tieni[0] = 1; tieni[n - 1] = 1;
  const tol2 = tolM * tolM;
  const pila: number[] = [0, n - 1];
  while (pila.length > 0) {
    const b = pila.pop()!;
    const a = pila.pop()!;
    if (b - a < 2) continue;
    const ax = xs[a], ay = ys[a];
    const dx = xs[b] - ax, dy = ys[b] - ay;
    const len2 = dx * dx + dy * dy;
    let peggiore = -1, dMax2 = -1;
    for (let i = a + 1; i < b; i++) {
      let t = len2 === 0 ? 0 : ((xs[i] - ax) * dx + (ys[i] - ay) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - xs[i], ey = ay + t * dy - ys[i];
      const d2 = ex * ex + ey * ey;
      if (d2 > dMax2) { dMax2 = d2; peggiore = i; }
    }
    if (peggiore > 0 && dMax2 > tol2) {
      tieni[peggiore] = 1;
      pila.push(a, peggiore, peggiore, b);
    }
  }
  return pts.filter((_, i) => tieni[i] === 1);
}

/**
 * SFOLTIRE IL TRACCIATO SENZA TAGLIARE GLI ANGOLI (22/09/2026). Il follower
 * usa la linea per il «fuori percorso», per la progressione e per
 * l'aggancio. Prima si teneva un vertice ogni N per indice: in un tratto rado
 * il vertice d'angolo cadeva fra gli scartati, la corda passava a 100 m
 * dall'angolo, e a schermo spento il nativo diceva «Sei fuori percorso» a chi
 * camminava esattamente sulla linea. Ora Douglas–Peucker in metri: 5 m, poi
 * 10 e 20 se i punti restano troppi; il campionamento per indice resta solo
 * come ultima difesa. Sotto MAX_PUNTI_LINEA la linea passa com'è, come prima.
 */
function decima(linea: [number, number][]): [number, number][] {
  const pulita = (linea || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pulita.length <= MAX_PUNTI_LINEA) return pulita;
  let semplice = pulita;
  for (const tolM of [5, 10, 20]) {
    semplice = semplificaDP(pulita, tolM);
    if (semplice.length <= MAX_PUNTI_LINEA) return semplice;
  }
  const passo = Math.ceil(semplice.length / MAX_PUNTI_LINEA);
  const out = semplice.filter((_, i) => i % passo === 0);
  const ultimo = semplice[semplice.length - 1];
  if (out[out.length - 1] !== ultimo) out.push(ultimo);
  return out;
}

function inMuto(): boolean {
  try { return locationService.getIsGuideMuted() === true; } catch { return false; }
}

/**
 * Consegna al nativo `ultimoJson`, dal punto in cui si è. La risposta conta:
 * `ok:false` = il nativo l'ha rifiutato (e ha tolto anche quello di prima).
 * L'`id` protegge dalle risposte in ritardo di una consegna ormai superata.
 */
function consegna(inPausaForzata: boolean = false): void {
  if (!ultimoJson) return;
  const id = String(ultimoJson.id || '');
  // La pausa di ADESSO, non quella della prima consegna: una riconsegna dopo
  // il muto o dopo un «Termina»+«no» deve trovare il follower nello stato giusto.
  const routeJson = JSON.stringify({ ...ultimoJson, indice: ultimoIndice, inPausa: pausaCorrente || inPausaForzata });
  ItaintaBackgroundPoi.setNavRoute({ routeJson })
    .then((r) => { if (r?.ok === false && id === idCorrente) { proprietario = null; firmaCorrente = ''; } })
    .catch((e: any) => {
      // «not implemented» = app nativa più vecchia di questo JS: si rinuncia
      // per tutta la sessione invece di fallire a ogni fix.
      if (/not implemented|unimplemented/i.test(String(e?.message || e))) nativoSenzaMetodi = true;
      if (id === idCorrente) { proprietario = null; firmaCorrente = ''; }
    });
}

/**
 * IL MUTO VALE ANCHE A SCHERMO SPENTO. `speakInstruction` tace quando la guida
 * è in muto; il follower nativo non lo sa, e a pagina congelata avrebbe
 * parlato lo stesso. In muto il percorso si TOGLIE dal nativo (resta qui, in
 * `ultimoJson`) e si riconsegna quando il muto finisce. Si controlla a ogni
 * battito. Limite accettato: in muto, a schermo spento, anche il cruscotto
 * resta fermo (il nativo senza percorso non ha niente da ridisegnare).
 */
function allineaMuto(): void {
  if (!proprietario || !ultimoJson) return;
  const muto = inMuto();
  if (muto && !sospesoPerMuto) {
    sospesoPerMuto = true;
    ItaintaBackgroundPoi.clearNavRoute().catch(() => { /* best-effort */ });
  } else if (!muto && sospesoPerMuto) {
    sospesoPerMuto = false;
    consegna();
  }
}

/**
 * DOPO UN VERO CONGELAMENTO si chiede al nativo che cosa ha detto, e lo si
 * passa ai navigatori: senza, da svegli ripeterebbero l'ultima svolta.
 *
 * SOLO dopo un buco di battito ≥ 8 s (dalla revisione): la prima versione lo
 * faceva a ogni `focus`/`visibilitychange`, anche a schermo sempre acceso, e
 * riversava nel JS lo stato del nativo senza motivo — bastava a far saltare un
 * annuncio in-app. Senza buco il JS è sempre stato al comando: niente da
 * allineare.
 */
async function riallineaDalNativo(): Promise<void> {
  if (!proprietario || !disponibile() || sospesoPerMuto) return;
  const canale = proprietario;
  const id = idCorrente;
  try {
    const p = await ItaintaBackgroundPoi.getNavProgress();
    if (id !== idCorrente) return; // nel frattempo è cambiato il percorso
    const stessoId = String(p?.id || '') === id;
    const dettaglio = {
      canale,
      id,
      indice: Number(p?.indice) || 0,
      dettiVicino: Array.isArray(p?.dettiVicino) ? p!.dettiVicino!.map(Number) : [],
      dettiLontano: Array.isArray(p?.dettiLontano) ? p!.dettiLontano!.map(Number) : [],
      ultimoTestoVicino: String(p?.ultimoTestoVicino || ''),
      ultimoTestoLontano: String(p?.ultimoTestoLontano || ''),
      // (21/09/2026) `finito`: l'arrivo finale l'ha chiuso il nativo a schermo
      // spento — la tappa singola chiude senza ridirlo, il giro chiude l'ultima
      // tappa o il rientro. Prima nessuno lo leggeva: allo sblocco lontano
      // dalla meta si ricalcolava verso un posto già visitato.
      finito: p?.finito === true,
      terminato: p?.terminato === true,
    };
    // IL NATIVO NON HA PIÙ IL PERCORSO (o ne ha un altro) MA QUI SI NAVIGA
    // ANCORA: «Termina» toccato a schermo spento svuota il follower, ma
    // App.tsx scarta le azioni del cruscotto più vecchie di 60 s — il giro
    // continua con la stessa firma e nessuno riconsegnerebbe. Lo stesso dopo
    // un riavvio del plugin. Si riconsegna, dal punto in cui si è.
    if (!p?.attivo || !stessoId) {
      // «Termina» dal cruscotto (21/09/2026): il follower ha lasciato la
      // FOTOGRAFIA di quello che aveva fatto. Prima il progresso (i navigatori
      // chiudono le tappe passate), POI la riconsegna — altrimenti al «no»
      // della conferma il giro ripartiva dalla tappa di prima.
      const terminato = !p?.attivo && p?.terminato === true && stessoId;
      if (terminato) {
        window.dispatchEvent(new CustomEvent('wip-nav-nativo-progresso', { detail: dettaglio }));
        // Chi ha ascoltato l'evento può aver già ripubblicato (percorso nuovo):
        // si riconsegna solo quello per cui si è chiesto.
        if (id !== idCorrente) return;
        // (22/09/2026) Dal punto a cui era arrivato il follower, non da quello
        // di prima del congelamento.
        ultimoIndice = Math.max(ultimoIndice, dettaglio.indice);
      }
      // Dopo un «Termina» dal cruscotto la riconsegna nasce IN PAUSA: intanto
      // la pagina chiede conferma (window.confirm blocca il JS), e il follower
      // non deve riaprire il cruscotto né parlare. Il primo battito dopo la
      // risposta porta la pausa vera; al «Sì» il percorso si ritira.
      if (!inMuto()) consegna(terminato);
      return;
    }
    window.dispatchEvent(new CustomEvent('wip-nav-nativo-progresso', { detail: dettaglio }));
  } catch { /* niente allineamento: al peggio una svolta ripetuta */ }
}

/** Parte un riallineamento, o si aggancia a quello già in volo. */
function avviaRiallineamento(): Promise<void> {
  if (!promessaRiallineamento) {
    promessaRiallineamento = riallineaDalNativo()
      .catch(() => { /* già gestito dentro */ })
      // Conta come «contatto» solo a pagina VISIBILE (22/09/2026): da
      // nascosta non segue nessun battito, il nativo resta al comando, e il
      // primo battito dopo deve poter riallineare di nuovo (le svolte dette
      // nel frattempo tornerebbero perse, e ripetute).
      .finally(() => {
        promessaRiallineamento = null;
        if (typeof document === 'undefined' || document.visibilityState === 'visible') riallineatoTs = Date.now();
      });
  }
  return promessaRiallineamento;
}

/**
 * Il nativo è al comando da almeno 8 s: nessun battito E nessun
 * riallineamento da allora. Il riallineamento conta come un contatto: senza,
 * un'azione del cruscotto riallineata al risveglio e il battito che la segue
 * un attimo dopo avrebbero chiesto due volte la stessa cosa (e il giro
 * avrebbe potuto chiudere due volte la stessa tappa).
 */
function nativoAlComandoDaUnPo(adesso: number): boolean {
  if (ultimoBattitoTs <= 0) return false;
  return adesso - Math.max(ultimoBattitoTs, riallineatoTs) >= BUCO_RIALLINEA_MS;
}

/**
 * Manda il battito. Restituisce true se QUESTO battito ha trovato il nativo
 * al comando (buco ≥ 8 s) e ha avviato — o trovato in volo — un
 * riallineamento: i «detti» del nativo arrivano solo con l'evento
 * 'wip-nav-nativo-progresso', e chi chiama in quel fix non deve annunciare
 * nulla, o ripeterebbe la svolta che il nativo ha appena detto.
 */
function mandaBattito(): boolean {
  if (!proprietario || !disponibile()) return false;
  allineaMuto();
  if (sospesoPerMuto) return false;
  const adesso = Date.now();
  // Il buco si misura QUI, prima di aggiornare l'orologio: al disgelo il timer
  // può scattare prima dell'evento di visibilità, e cancellerebbe la prova.
  if (ultimoBattitoTs > 0 && adesso - ultimoBattitoTs >= BUCO_RIALLINEA_MS) fineBucoTs = adesso;
  const riallinea = promessaRiallineamento != null || nativoAlComandoDaUnPo(adesso);
  ultimoBattitoTs = adesso;
  // PRIMA la domanda al nativo, POI il battito: le chiamate al plugin sono
  // servite in ordine, e il progresso va letto prima che il battito unisca
  // gli insiemi del JS.
  if (riallinea) void avviaRiallineamento();
  ItaintaBackgroundPoi.navHeartbeat({ indice: ultimoIndice, dettiVicino: dettiVicinoJs, dettiLontano: dettiLontanoJs, inPausa: pausaCorrente })
    .catch(() => { /* best-effort */ });
  return riallinea;
}

/**
 * IL BATTITO A TIMER: «sono vivo» deve voler dire «sono vivo E sto seguendo
 * la strada». In background una WebView può restare sveglia a metà — i timer
 * girano (rallentati) ma i fix GPS non le arrivano più — e un battito a timer
 * terrebbe zitto il nativo mentre nessuno parla. Quindi il timer batte solo se
 *  - la pagina è VISIBILE, e
 *  - un fix vero è arrivato negli ultimi 20 s (oppure non ne è mai arrivato
 *    uno: i primi secondi dopo «Naviga»). Un watch GPS in errore a pagina
 *    visibile non deve tenere zitto il nativo per sempre.
 * Da fermi si passa la mano dopo 20 s: innocuo, da fermi non c'è nulla da dire.
 */
function battitoDaTimer(): void {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (ultimoBattitoDaFixTs > 0 && Date.now() - ultimoBattitoDaFixTs > FIX_RECENTE_MS) return;
  mandaBattito();
}

function alRitorno(): void {
  if (!proprietario || !disponibile()) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  // Con un buco di battito il riallineamento parte da mandaBattito; senza, il
  // JS è sempre stato al comando e non c'è nulla da chiedere al nativo.
  mandaBattito();
}

function assicuraAscoltoRipresa(): void {
  if (ascoltoRipresa || typeof document === 'undefined') return;
  ascoltoRipresa = true;
  document.addEventListener('visibilitychange', alRitorno);
  window.addEventListener('focus', alRitorno);
}

/**
 * AZIONE DEL CRUSCOTTO CONSEGNATA DOPO UN CONGELAMENTO (21/09/2026). Allo
 * sblocco la prima cosa che gira è l'evento in coda («Pausa» toccata sulla
 * lock screen): applicata subito, faceva ritirare il percorso PRIMA che
 * qualcuno chiedesse al follower cosa aveva fatto a schermo spento, e il giro
 * ripartiva da tappe già visitate. Chi applica un'azione aspetta questa
 * promessa: se il nativo è al comando da ≥ 8 s riprende prima il progresso
 * (lo stesso riallineamento del battito, condiviso), altrimenti si risolve
 * subito — a pagina viva non cambia nulla. Non manda battiti: a pagina
 * nascosta il nativo resta al comando.
 */
export function riallineaSeScongelato(): Promise<void> {
  if (!proprietario || !disponibile() || sospesoPerMuto) return Promise.resolve();
  if (promessaRiallineamento) return promessaRiallineamento;
  if (!nativoAlComandoDaUnPo(Date.now())) return Promise.resolve();
  return avviaRiallineamento();
}

/**
 * IL NATIVO È AL COMANDO (21/09/2026): c'è un percorso consegnato, non in
 * muto, e nessun battito da ≥ 8 s — misurato PRIMA che un battito lo
 * aggiorni. Serve a «Riascolta» dal cruscotto: col nativo al comando il
 * follower l'ha già ridetta a schermo spento, e su iOS l'azione arriva anche
 * al JS (entro 60 s): si sentiva due volte.
 * Al risveglio l'azione in coda può girare DOPO il primo battito (timer o
 * ritorno in primo piano), che il buco l'ha già chiuso: vale ancora «al
 * comando» per FINESTRA_RISVEGLIO_MS dalla fine del buco — il tocco è
 * avvenuto dentro il buco.
 */
export function nativoAlComando(): boolean {
  if (!proprietario || !disponibile() || sospesoPerMuto) return false;
  const adesso = Date.now();
  if (ultimoBattitoTs > 0 && adesso - ultimoBattitoTs >= BUCO_RIALLINEA_MS) return true;
  return fineBucoTs > 0 && adesso - fineBucoTs < FINESTRA_RISVEGLIO_MS;
}

function azzera(): void {
  proprietario = null; firmaCorrente = ''; idCorrente = ''; passiCorrenti = [];
  dettiVicinoJs = []; dettiLontanoJs = [];
  ultimoJson = null; sospesoPerMuto = false;
  ultimoBattitoTs = 0; ultimoBattitoDaFixTs = 0;
  riallineatoTs = 0; fineBucoTs = 0; pausaCorrente = false;
}

/**
 * Consegna (o riconsegna dopo un ricalcolo) il percorso al nativo.
 * `firma` è una stringa qualunque che cambia quando cambia il percorso: con la
 * stessa firma la chiamata non fa nulla, così chi chiama può farlo a ogni fix
 * senza pensarci. `finale`: l'ultimo passo 'arrive' chiude la navigazione.
 * `inPausa` (21/09/2026): il follower nasce in pausa (percorso consegnato
 * durante una pausa MANUALE del giro); poi la pausa la cambia
 * `impostaPausaNativa`, non la firma.
 * `spegniCruscotto` (21/09/2026): all'arrivo finale col nativo al comando il
 * follower spegne il cruscotto solo se true (assente = true, come prima). La
 * tappa singola manda false quando c'è un giro in corso: il cruscotto dopo è
 * del giro, e su iOS una Live Activity chiusa dal background non si riapre.
 */
export function pubblicaPercorsoNativo(args: {
  canale: CanaleNav;
  firma: string;
  passi: PassoNav[];
  indice?: number;
  linea?: [number, number][];
  lingua: string;
  finale: boolean;
  inPausa?: boolean;
  spegniCruscotto?: boolean;
  /** (21/09/2026) Partenza da un indirizzo lontano: niente «fuori percorso» prima di arrivare sul tracciato. */
  fuoriSoloDopoAggancio?: boolean;
}): void {
  if (!disponibile()) return;
  // La tappa singola vince: il giro aspetta che lasci (vedi CanaleNav).
  if (args.canale === 'giro' && proprietario === 'tappa') return;
  if (proprietario === args.canale && args.firma === firmaCorrente) return;
  const passi = args.passi || [];
  // Un passo senza coordinate NON si filtra via: sposterebbe gli indici, che
  // devono restare gli stessi del navigatore che batte. Il nativo rifiuterebbe
  // comunque tutto il percorso: si rinuncia qui.
  if (passi.length === 0 || passi.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))) {
    if (proprietario === args.canale) ritiraPercorsoNativo(args.canale);
    return;
  }
  const l2 = String(args.lingua || 'it').toLowerCase().slice(0, 2);
  proprietario = args.canale;
  firmaCorrente = args.firma;
  idCorrente = `${args.firma}#${Date.now()}`;
  passiCorrenti = passi;
  ultimoIndice = Math.max(0, Math.min(passi.length - 1, Number(args.indice) || 0));
  dettiVicinoJs = []; dettiLontanoJs = [];
  ultimoBattitoTs = Date.now(); ultimoBattitoDaFixTs = 0;
  riallineatoTs = 0; fineBucoTs = 0;
  pausaCorrente = args.inPausa === true;
  ultimoJson = {
    id: idCorrente,
    passi,
    indice: ultimoIndice,
    linea: decima(args.linea || []),
    modelloLontano: MODELLO_LONTANO[l2] || MODELLO_LONTANO.en,
    fraseFuoriPercorso: FUORI_PERCORSO[l2] || FUORI_PERCORSO.en,
    finale: args.finale === true,
    inPausa: pausaCorrente,
    // Campo additivo: assente = il nativo spegne come prima.
    ...(typeof args.spegniCruscotto === 'boolean' ? { spegniCruscotto: args.spegniCruscotto } : {}),
    ...(args.fuoriSoloDopoAggancio === true ? { fuoriSoloDopoAggancio: true } : {}),
  };
  // In muto non si consegna (ci pensa allineaMuto quando il muto finisce), ma
  // il percorso di PRIMA va tolto: il nativo non deve dettare quello vecchio.
  sospesoPerMuto = inMuto();
  if (sospesoPerMuto) ItaintaBackgroundPoi.clearNavRoute().catch(() => { /* best-effort */ });
  else consegna();
  assicuraAscoltoRipresa();
  if (!timerBattito) timerBattito = setInterval(battitoDaTimer, BATTITO_TIMER_MS);
}

/**
 * Navigazione finita, in pausa o annullata: il nativo smette di seguirla.
 * Ognuno ritira SOLO il proprio percorso: la chiamata di chi non è il
 * proprietario non fa nulla.
 */
export function ritiraPercorsoNativo(canale: CanaleNav): void {
  if (proprietario !== canale) return;
  azzera();
  if (timerBattito) { clearInterval(timerBattito); timerBattito = null; }
  if (!disponibile()) return;
  ItaintaBackgroundPoi.clearNavRoute().catch(() => { /* best-effort */ });
}

/**
 * Il battito, da chiamare a ogni fix elaborato dal navigatore JS: dice al
 * nativo «sono vivo, parlo io», a che manovra si è arrivati e COSA si è già
 * annunciato (indici nella lista consegnata).
 *
 * RESTITUISCE true (21/09/2026) se questo battito ha trovato il nativo al
 * comando da ≥ 8 s e ha avviato il riallineamento: in QUEL fix il chiamante
 * non annuncia nulla. Su Android a schermo spento la WebView resta viva e
 * batte solo dai fix buoni: dopo un buco il nativo diceva la svolta, e il JS
 * la ripeteva nello stesso fix, prima che i «detti» del nativo arrivassero.
 */
export function battitoNav(canale: CanaleNav, indice: number, dettiVicino?: Iterable<number>, dettiLontano?: Iterable<number>): boolean {
  if (proprietario !== canale) return false;
  if (Number.isFinite(indice)) ultimoIndice = Math.max(0, Math.round(indice));
  ultimoBattitoDaFixTs = Date.now();
  // Le soglie del JS e del nativo non coincidono al metro (35/30 m): senza
  // dirgli cosa si è già annunciato, una pagina congelata subito DOPO aver
  // parlato lascerebbe al nativo la stessa svolta da ripetere.
  const nuoviVicino = dettiVicino ? Array.from(dettiVicino).filter(Number.isFinite) : dettiVicinoJs;
  const nuoviLontano = dettiLontano ? Array.from(dettiLontano).filter(Number.isFinite) : dettiLontanoJs;
  // Confronto sul CONTENUTO: nel giro si passa da [5] a [6], stessa lunghezza.
  const cambiato = nuoviVicino.join(',') !== dettiVicinoJs.join(',') || nuoviLontano.join(',') !== dettiLontanoJs.join(',');
  dettiVicinoJs = nuoviVicino; dettiLontanoJs = nuoviLontano;
  // Una svolta appena detta va comunicata SUBITO, senza aspettare i 2 s.
  // (22/09/2026) Col riallineamento ancora in volo anche i fix «frenati» dai
  // 2 s restano muti: al disgelo i fix in coda arrivano a raffica, e il
  // secondo annunciava (o chiudeva la tappa) prima che i «detti» del nativo
  // tornassero qui.
  if (!cambiato && Date.now() - ultimoBattitoTs < BATTITO_MIN_MS) return promessaRiallineamento != null;
  return mandaBattito();
}

/** (22/09/2026) Un riallineamento col nativo è in volo: chi riconsegna aspetta. */
export function riallineamentoInVolo(): boolean { return promessaRiallineamento != null; }

/**
 * PAUSA DEL GIRO (21/09/2026, REVISIONE 2). In pausa MANUALE il percorso
 * resta al follower, in pausa: la si memorizza (va in ogni battito e in ogni
 * consegna) e la si dice SUBITO al nativo con un battito, anche a pagina
 * nascosta — il tasto «Pausa» in app deve fermare il follower adesso, non al
 * prossimo fix. Solo quando cambia: ogni aggiornamento del giro la ripete, e
 * un battito da una pagina nascosta tiene zitto il nativo per 8 s.
 * No-op se il canale non è il proprietario.
 */
export function impostaPausaNativa(canale: CanaleNav, inPausa: boolean): void {
  if (proprietario !== canale) return;
  const v = inPausa === true;
  if (v === pausaCorrente) return;
  pausaCorrente = v;
  mandaBattito();
}

/** La tappa singola prende (true) o lascia (false) il cruscotto. */
export function segnaCruscottoTappa(v: boolean): void { cruscottoTappa = v === true; }
/** Il cruscotto (e i suoi tasti) è della tappa singola: il giro non lo scrive e non lo spegne. */
export function cruscottoDellaTappa(): boolean { return cruscottoTappa; }

/**
 * PERCORSO ORFANO DOPO UNA PAGINA RICREATA (21/09/2026). Su iOS, quando muore
 * il processo WebContent, Capacitor ricarica la pagina SENZA richiamare il
 * `load()` del plugin — che è dove il follower si svuota. Il follower teneva
 * il percorso della pagina morta: nessuno batteva più, e ad app aperta
 * dettava svolte e aggiornava la Live Activity di una navigazione che l'app
 * non mostrava, col GPS al massimo. Una volta per pagina, alla PRIMA
 * visibilità (con il telefono in tasca il follower continua a guidare, come
 * vuole la spec per la pagina morta a schermo spento), se questa pagina non
 * ha consegnato nulla si svuota il follower e si avvisa App.tsx
 * ('wip-nav-nativo-orfano'), che chiude il cruscotto se non c'è un giro.
 * Su Android è innocuo: lì `load()` l'ha già svuotato.
 * Non subito al caricamento del modulo: questo file lo carica App.tsx prima
 * di montarsi, e l'evento partirebbe prima che App ascolti e riprenda il giro.
 */
const ORFANO_ATTESA_MS = 2500;
let orfanoPronto = false;
let orfanoVerificato = false;
function pulisciOrfano(): void {
  if (orfanoVerificato || !orfanoPronto) return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  orfanoVerificato = true;
  try { document.removeEventListener('visibilitychange', pulisciOrfano); } catch { /* SSR */ }
  if (!disponibile() || proprietario) return; // questa pagina ha già consegnato: setRoute ha sostituito il vecchio
  ItaintaBackgroundPoi.getNavProgress().then((p) => {
    if (proprietario) return; // nel frattempo è partita una navigazione vera
    ItaintaBackgroundPoi.clearNavRoute().catch(() => { /* best-effort */ });
    window.dispatchEvent(new CustomEvent('wip-nav-nativo-orfano', { detail: { attivo: !!p?.attivo } }));
  }).catch(() => { /* build senza il metodo: niente da pulire */ });
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', pulisciOrfano);
  setTimeout(() => { orfanoPronto = true; pulisciOrfano(); }, ORFANO_ATTESA_MS);
}

/** false sul web e sulle build native senza il follower: chi chiama può risparmiarsi il lavoro. */
export function navNativoDisponibile(): boolean { return disponibile(); }
/** Il percorso consegnato è di QUESTO canale (e non è stato rifiutato dal nativo). */
export function percorsoNativoAttivo(canale: CanaleNav): boolean { return proprietario === canale; }
/** Chi ha il canale adesso: al giro serve per non lavorare a vuoto mentre c'è la tappa singola. */
export function proprietarioNativo(): CanaleNav | null { return proprietario; }
export function passiPubblicati(): PassoNav[] { return passiCorrenti; }
