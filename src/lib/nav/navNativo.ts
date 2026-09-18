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
let riallineamentoInCorso = false;
/** Build nativa più vecchia del JS: i metodi non esistono, si smette di provare. */
let nativoSenzaMetodi = false;

function disponibile(): boolean {
  return !nativoSenzaMetodi && typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

function decima(linea: [number, number][]): [number, number][] {
  const pulita = (linea || []).filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (pulita.length <= MAX_PUNTI_LINEA) return pulita;
  const passo = Math.ceil(pulita.length / MAX_PUNTI_LINEA);
  const out = pulita.filter((_, i) => i % passo === 0);
  const ultimo = pulita[pulita.length - 1];
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
function consegna(): void {
  if (!ultimoJson) return;
  const id = String(ultimoJson.id || '');
  const routeJson = JSON.stringify({ ...ultimoJson, indice: ultimoIndice });
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
  if (riallineamentoInCorso || !proprietario || !disponibile() || sospesoPerMuto) return;
  riallineamentoInCorso = true;
  const canale = proprietario;
  const id = idCorrente;
  try {
    const p = await ItaintaBackgroundPoi.getNavProgress();
    if (id !== idCorrente) return; // nel frattempo è cambiato il percorso
    // IL NATIVO NON HA PIÙ IL PERCORSO (o ne ha un altro) MA QUI SI NAVIGA
    // ANCORA: «Termina» toccato a schermo spento svuota il follower, ma
    // App.tsx scarta le azioni del cruscotto più vecchie di 60 s — il giro
    // continua con la stessa firma e nessuno riconsegnerebbe. Lo stesso dopo
    // un riavvio del plugin. Si riconsegna, dal punto in cui si è.
    if (!p?.attivo || String(p.id || '') !== id) { if (!inMuto()) consegna(); return; }
    window.dispatchEvent(new CustomEvent('wip-nav-nativo-progresso', {
      detail: {
        canale,
        id,
        indice: Number(p.indice) || 0,
        dettiVicino: Array.isArray(p.dettiVicino) ? p.dettiVicino.map(Number) : [],
        dettiLontano: Array.isArray(p.dettiLontano) ? p.dettiLontano.map(Number) : [],
        ultimoTestoVicino: String(p.ultimoTestoVicino || ''),
        ultimoTestoLontano: String(p.ultimoTestoLontano || ''),
      },
    }));
  } catch { /* niente allineamento: al peggio una svolta ripetuta */ }
  finally { riallineamentoInCorso = false; }
}

function mandaBattito(): void {
  if (!proprietario || !disponibile()) return;
  allineaMuto();
  if (sospesoPerMuto) return;
  const adesso = Date.now();
  // Il buco si misura QUI, prima di aggiornare l'orologio: al disgelo il timer
  // può scattare prima dell'evento di visibilità, e cancellerebbe la prova.
  const buco = ultimoBattitoTs > 0 ? adesso - ultimoBattitoTs : 0;
  ultimoBattitoTs = adesso;
  if (buco >= BUCO_RIALLINEA_MS) void riallineaDalNativo();
  ItaintaBackgroundPoi.navHeartbeat({ indice: ultimoIndice, dettiVicino: dettiVicinoJs, dettiLontano: dettiLontanoJs })
    .catch(() => { /* best-effort */ });
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

function azzera(): void {
  proprietario = null; firmaCorrente = ''; idCorrente = ''; passiCorrenti = [];
  dettiVicinoJs = []; dettiLontanoJs = [];
  ultimoJson = null; sospesoPerMuto = false;
  ultimoBattitoTs = 0; ultimoBattitoDaFixTs = 0;
}

/**
 * Consegna (o riconsegna dopo un ricalcolo) il percorso al nativo.
 * `firma` è una stringa qualunque che cambia quando cambia il percorso: con la
 * stessa firma la chiamata non fa nulla, così chi chiama può farlo a ogni fix
 * senza pensarci. `finale`: l'ultimo passo 'arrive' chiude la navigazione.
 */
export function pubblicaPercorsoNativo(args: {
  canale: CanaleNav;
  firma: string;
  passi: PassoNav[];
  indice?: number;
  linea?: [number, number][];
  lingua: string;
  finale: boolean;
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
  ultimoJson = {
    id: idCorrente,
    passi,
    indice: ultimoIndice,
    linea: decima(args.linea || []),
    modelloLontano: MODELLO_LONTANO[l2] || MODELLO_LONTANO.en,
    fraseFuoriPercorso: FUORI_PERCORSO[l2] || FUORI_PERCORSO.en,
    finale: args.finale === true,
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
 */
export function battitoNav(canale: CanaleNav, indice: number, dettiVicino?: Iterable<number>, dettiLontano?: Iterable<number>): void {
  if (proprietario !== canale) return;
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
  if (!cambiato && Date.now() - ultimoBattitoTs < BATTITO_MIN_MS) return;
  mandaBattito();
}

/** false sul web e sulle build native senza il follower: chi chiama può risparmiarsi il lavoro. */
export function navNativoDisponibile(): boolean { return disponibile(); }
/** Il percorso consegnato è di QUESTO canale (e non è stato rifiutato dal nativo). */
export function percorsoNativoAttivo(canale: CanaleNav): boolean { return proprietario === canale; }
/** Chi ha il canale adesso: al giro serve per non lavorare a vuoto mentre c'è la tappa singola. */
export function proprietarioNativo(): CanaleNav | null { return proprietario; }
export function passiPubblicati(): PassoNav[] { return passiCorrenti; }
