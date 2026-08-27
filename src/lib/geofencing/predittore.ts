// ─────────────────────────────────────────────────────────────────────────────
// 🎯 PREDITTORE — il punto di massimo avvicinamento (CPA) sul web
//
// PORT del nucleo predittivo che i nativi hanno gia':
//   - android/app/src/main/java/com/itaintasca/app/geofence/PredictiveTrigger.kt
//   - ios/App/App/PredictiveTrigger.swift
// Costanti, soglie e ORDINE DEI RAMI decisionali devono restare identici nelle
// tre implementazioni: se cambi un numero qui, cambialo anche la'.
//
// IL PROBLEMA. Fino al 23/08/2026 il web decideva l'avvicinamento con una sola
// riga: «la distanza e' calata di almeno 0,5 m dall'ultimo fix»
// (APPROACH_EPSILON_M in foregroundTriggers). E' una regola POVERA:
//   • non anticipa NULLA — dice solo che ti sei mosso verso il POI, e la voce
//     parte quando sei gia' dentro il cerchio, cioe' quando sei sul posto;
//   • non distingue chi arriva da chi passa nella via parallela: anche di
//     lato la distanza cala, fino al traverso;
//   • non sa quanto manca: a 1,4 m/s e a 14 m/s la stessa distanza in calo
//     significa cose diversissime.
//
// LA SOLUZIONE, la stessa dei nativi: si ragiona sul CPA (Closest Point of
// Approach) invece che sulla distanza radiale. Con p = utente, v = vettore
// velocita', q = POI:
//
//     r     = q - p
//     t_cpa = (r · v) / (v · v)      secondi al massimo avvicinamento
//     d_cpa = | r - v * t_cpa |      distanza minima che l'utente raggiungera'
//
// Si scatta quando  t_cpa ∈ (0, T_LEAD]  AND  d_cpa <= CORRIDOIO.
//
// Il luogo dei punti che soddisfa le due condizioni E' un corridoio orientato
// nella direzione di marcia: semi-larghezza CORRIDOIO, lunghezza |v| * T_LEAD.
// Nella direzione di marcia si scala da se' con la velocita' — nessuna soglia
// separata da tarare fra piedi e auto.
//
// Conseguenze dirette:
//   - via parallela           → d_cpa grande   → non scatta (prima scattava)
//   - utente che si allontana → t_cpa < 0      → non scatta
//   - utente in arrivo        → scatta T_LEAD secondi PRIMA, non a X metri
//
// FAIL-OPEN DELIBERATO. Quando i dati non permettono una predizione (fix
// impreciso, fermo, senza direzione) NON si irrigidisce: si torna esattamente
// al comportamento di oggi (dentro il raggio = scatta, fuori = attendi, e il
// chiamante applica la sua regola «distanza in calo»). Peggiorare il punto
// cieco sarebbe una regressione.
// ─────────────────────────────────────────────────────────────────────────────

import { SOGLIA_ACCURATEZZA_TRIGGER_M, type TransportMode } from '../guideSettings';

// ── Costanti replicate dal nativo (NON toccare da sole) ──────────────────────

/**
 * Anticipo desiderato sull'annuncio, in secondi.
 * Deve coprire: eta' del fix (~3 s) + durata del TTS (~3 s) + tempo di reazione
 * dell'utente (~5 s) = 11 s minimo teorico. 22 s a piedi sono ~30 m a 1,4 m/s.
 * (PredictiveTrigger.kt: T_LEAD_WALKING_S / T_LEAD_DRIVING_S)
 */
export const T_LEAD_PIEDI_S = 22.0;
export const T_LEAD_AUTO_S = 14.0;

/** Semi-larghezza del corridoio: quanto «di lato» puo' stare il POI. */
export const CORRIDOIO_PIEDI_M = 35.0;
export const CORRIDOIO_AUTO_M = 70.0;

/** Tetto all'estrapolazione della posizione: oltre, l'errore supera il beneficio. */
export const MAX_ESTRAPOLAZIONE_S = 3.0;

/** Sotto questa velocita' il course del GPS e' rumore: predizione non affidabile. */
export const VELOCITA_MINIMA_VETTORE_MS = 0.5;

/** Oltre questo ritardo il fix e' troppo vecchio per estrapolarlo. */
export const MAX_ETA_FIX_MS = 30_000;

/**
 * Metri oltre il CPA perche' un POI sia «superato». In DISTANZA, non in
 * secondi (memoria di progetto sui trigger pedonali: la vecchia soglia -3 s
 * valeva ~42 m in auto ma ~4 m a piedi). PredictiveTrigger.kt:221.
 */
export const DISTANZA_SUPERAMENTO_M = 40.0;

/**
 * Sopra questa incertezza la predizione non e' affidabile: fail-open.
 * E' la STESSA soglia con cui il trigger scarta il fix — vive in guideSettings
 * proprio per non poter divergere (era 50 sul web e 50 nel predittore nativo,
 * ma scritta due volte in due file diversi).
 */
export const MAX_ACCURATEZZA_PREDIZIONE_M = SOGLIA_ACCURATEZZA_TRIGGER_M;

// ── Filtro sul jitter ────────────────────────────────────────────────────────
//
// PERCHE' SERVE. Il CPA e' una derivata: si nutre della differenza fra due
// posizioni. Fra i palazzi un fix GPS rimbalza di 10-30 m fra un secondo e
// l'altro, e su un rimbalzo il vettore r cambia direzione di decine di gradi:
// il d_cpa calcolato su un fix «ballerino» butta fuori dal corridoio un POI che
// invece stai raggiungendo (o ce ne infila uno della via accanto).
//
// PERCHE' UN KALMAN SCALARE E NON UNA MEDIA MOBILE. Una media mobile su un
// utente IN MOVIMENTO e' un ritardo puro: mediare le ultime N posizioni di chi
// cammina a 1,4 m/s vuol dire stimarlo N/2 secondi indietro — cioe' esattamente
// il difetto che stiamo cercando di togliere. Il Kalman a una dimensione (uno
// per asse, lat e lon indipendenti) ha in piu' il PASSO DI PREDIZIONE: prima di
// fondere il nuovo fix, la stima precedente viene AVANZATA lungo la rotta nota
// (bearing + velocita' × dt). Il filtro non insegue piu' l'utente, lo accompagna:
// il ritardo strutturale sparisce e resta solo il livellamento del rumore.
// Costa due variabili di stato e nessuna libreria.
//
// IL GUADAGNO E' L'ACCURATEZZA DEL FIX, non un numero fisso: alfa =
// acc / (acc + SIGMA_MODELLO). Con un fix da 5 m il filtro pesa 1/3 e comanda
// il GPS; con un fix da 30 m il filtro pesa 3/4 e comanda il modello. E' la
// forma chiusa del guadagno di Kalman con varianza di processo costante.
//
// IL COMPROMESSO, DICHIARATO. Un filtro puo' sempre sbagliarsi: se l'utente
// gira di colpo, o se il GPS si riaggancia dopo una galleria, la stima filtrata
// e quella grezza divergono. Sopra SCOSTAMENTO_MAX_M (10 m, l'ordine di
// grandezza dell'errore urbano) NON si media un errore: si butta lo stato e si
// riparte dal fix grezzo. Il filtro puo' quindi solo togliere rumore fino a
// 10 m; oltre, e' come non esserci. Nessun ritardo percepibile, per costruzione.

/** Rumore di modello: quanto ci si fida della stima filtrata, in metri. */
export const SIGMA_MODELLO_M = 10;
/** Oltre questo scostamento dal fix grezzo il filtro si azzera e non si applica. */
export const SCOSTAMENTO_MAX_M = 10;
/** Peso minimo/massimo del filtro: mai zero, mai tutto. */
const ALFA_MIN = 0.15;
const ALFA_MAX = 0.9;
/** Piu' di cosi' fra due fix (o piu' lontano di cosi') = nuova traccia. */
const SALTO_TEMPO_MS = 30_000;
const SALTO_DISTANZA_M = 200;

const METRI_PER_GRADO_LAT = 111_320;

interface StatoFiltro {
  lat: number;
  lon: number;
  ts: number;
}

let statoFiltro: StatoFiltro | null = null;

/** Fix GPS minimo che serve al predittore (compatibile con `wip-location-update`). */
export interface FixPredittore {
  lat: number;
  lon: number;
  /** m/s. Assente/NaN = predizione non possibile (fail-open). */
  speed?: number | null;
  /** Gradi da nord, orario: direzione di MOVIMENTO (course del fix). */
  heading?: number | null;
  /** Metri. Assente = si assume peggiore del limite (fail-open). */
  accuracy?: number | null;
  /** Millisecondi del fix. Assente = si assume «adesso» (eta' 0). */
  tempoMs?: number | null;
}

export interface EsitoFiltro {
  lat: number;
  lon: number;
  /** true se la posizione restituita e' quella filtrata, false se e' il fix grezzo. */
  filtrato: boolean;
  /** Di quanti metri il filtro ha spostato la stima rispetto al grezzo. */
  scostamentoM: number;
}

/**
 * Stabilizza lat/lon prima del calcolo del CPA. Kalman scalare per asse con
 * passo di predizione lungo la rotta nota; guard-rail a 10 m (vedi sopra).
 * Idempotente rispetto agli errori: qualunque dato mancante → fix grezzo.
 */
export function stabilizzaFix(fix: FixPredittore, adesso = Date.now()): EsitoFiltro {
  const lat = Number(fix?.lat);
  const lon = Number(fix?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { lat, lon, filtrato: false, scostamentoM: 0 };
  }
  const ts = Number(fix?.tempoMs);
  const tempo = Number.isFinite(ts) ? ts : adesso;

  const precedente = statoFiltro;
  if (!precedente) {
    statoFiltro = { lat, lon, ts: tempo };
    return { lat, lon, filtrato: false, scostamentoM: 0 };
  }

  const dt = Math.max(0, (tempo - precedente.ts) / 1000);
  // Traccia interrotta (app in background, galleria, teletrasporto del fix di
  // rete): non si fonde nulla, si riparte dal grezzo.
  if (dt > SALTO_TEMPO_MS / 1000 ||
      distanzaPiana(precedente.lat, precedente.lon, lat, lon) > SALTO_DISTANZA_M) {
    statoFiltro = { lat, lon, ts: tempo };
    return { lat, lon, filtrato: false, scostamentoM: 0 };
  }

  // ── Passo di PREDIZIONE: la stima precedente avanza lungo la rotta nota.
  // Senza questo, il filtro sarebbe un ritardo puro su un utente in movimento.
  const velocita = Number(fix?.speed);
  const rotta = Number(fix?.heading);
  let predLat = precedente.lat;
  let predLon = precedente.lon;
  if (Number.isFinite(velocita) && velocita > 0 && Number.isFinite(rotta) && rotta >= 0 && dt > 0) {
    const avanzato = estrapola(precedente.lat, precedente.lon, rotta, velocita, dt);
    predLat = avanzato.lat;
    predLon = avanzato.lon;
  }

  // ── Passo di CORREZIONE: guadagno dall'accuratezza del fix.
  const acc = Number(fix?.accuracy);
  const accuratezza = Number.isFinite(acc) && acc > 0 ? acc : SIGMA_MODELLO_M;
  const alfa = Math.min(ALFA_MAX, Math.max(ALFA_MIN, accuratezza / (accuratezza + SIGMA_MODELLO_M)));
  const fusaLat = alfa * predLat + (1 - alfa) * lat;
  const fusaLon = alfa * predLon + (1 - alfa) * lon;

  const scostamentoM = distanzaPiana(fusaLat, fusaLon, lat, lon);
  if (scostamentoM > SCOSTAMENTO_MAX_M) {
    // Il filtro sta discutendo col GPS su piu' di 10 m: ha torto per definizione.
    statoFiltro = { lat, lon, ts: tempo };
    return { lat, lon, filtrato: false, scostamentoM };
  }

  statoFiltro = { lat: fusaLat, lon: fusaLon, ts: tempo };
  return { lat: fusaLat, lon: fusaLon, filtrato: true, scostamentoM };
}

/** Dimentica la traccia (spegnimento audioguida, cambio sessione, test). */
export function azzeraFiltro(): void {
  statoFiltro = null;
}

// ── L'esito della predizione ─────────────────────────────────────────────────

/**
 * Gli stessi tre esiti del nativo (Decision.FIRE/HOLD/REJECT), coi nomi
 * italiani usati nel resto della catena web.
 */
export type DecisionePredittore = 'scatta' | 'attendi' | 'rifiuta';

export interface EsitoPredizione {
  decisione: DecisionePredittore;
  /** Secondi al massimo avvicinamento. NaN quando non si e' potuto predire. */
  tCpaSecondi: number;
  /** Distanza minima prevista, in metri. NaN quando non si e' potuto predire. */
  dCpaMetri: number;
  /** Distanza radiale adesso (sul fix compensato, quando possibile). */
  distanzaOraMetri: number;
  /** false = fail-open, si e' replicato il comportamento radiale di oggi. */
  haPredetto: boolean;
  /** Motivo leggibile, per la telemetria e il log in strada. */
  motivo: string;
}

/**
 * Valuta un POI rispetto al fix corrente.
 *
 * @param fix      posizione corrente (gia' stabilizzata dal chiamante)
 * @param poiLat   latitudine del punto d'arrivo del POI (ingresso, non centroide)
 * @param poiLon   longitudine del punto d'arrivo
 * @param raggioM  raggio di trigger della fase (quello che il chiamante usa gia')
 * @param modo     'walk' | 'car'
 * @param adesso   orologio iniettabile (test)
 */
export function valutaPredizione(
  fix: FixPredittore,
  poiLat: number,
  poiLon: number,
  raggioM: number,
  modo: TransportMode,
  adesso = Date.now(),
): EsitoPredizione {
  const tLead = modo === 'car' ? T_LEAD_AUTO_S : T_LEAD_PIEDI_S;
  const corridoio = modo === 'car' ? CORRIDOIO_AUTO_M : CORRIDOIO_PIEDI_M;

  const ts = Number(fix?.tempoMs);
  const etaFixMs = Math.max(0, Number.isFinite(ts) ? adesso - ts : 0);
  const acc = Number(fix?.accuracy);
  const accuratezza = Number.isFinite(acc) ? acc : Number.MAX_VALUE;
  const velocita = Number.isFinite(Number(fix?.speed)) ? Number(fix?.speed) : 0;
  const rotta = Number.isFinite(Number(fix?.heading)) ? Number(fix?.heading) : -1;

  const puoPredire = accuratezza <= MAX_ACCURATEZZA_PREDIZIONE_M &&
    velocita >= VELOCITA_MINIMA_VETTORE_MS &&
    rotta >= 0 &&
    etaFixMs <= MAX_ETA_FIX_MS;

  // ── Compensazione della latenza. Il fix viene usato come se fosse «adesso»,
  // ma e' vecchio di secondi. A 1,4 m/s ogni secondo di ritardo e' 1,4 m di
  // errore: su un raggio d'arrivo di 30 m sposta l'annuncio oltre il monumento.
  // (Sul web l'evento 'wip-location-update' viene emesso alla ricezione del fix
  // e non porta timestamp: senza `tempoMs` l'eta' e' 0 e questo passo e' un
  // no-op. Il codice resta perche' il replay GPS e i test lo forniscono.)
  const estrapolazioneS = puoPredire ? Math.min(etaFixMs / 1000, MAX_ESTRAPOLAZIONE_S) : 0;
  const utente = estrapola(Number(fix.lat), Number(fix.lon), rotta, velocita, estrapolazioneS);

  // Frame metrico locale (equirettangolare): sotto i 2 km l'errore e'
  // trascurabile e costa due moltiplicazioni.
  const { est, nord } = offsetLocale(utente.lat, utente.lon, poiLat, poiLon);
  const distanzaOra = Math.sqrt(est * est + nord * nord);

  if (!puoPredire) {
    // FAIL-OPEN: si replica il comportamento radiale attuale.
    const motivi: string[] = [];
    if (accuratezza > MAX_ACCURATEZZA_PREDIZIONE_M) motivi.push(`acc=${Number.isFinite(accuratezza) ? Math.round(accuratezza) : '?'}m`);
    if (velocita < VELOCITA_MINIMA_VETTORE_MS) motivi.push(`v=${velocita.toFixed(1)}m/s`);
    if (rotta < 0) motivi.push('no-rotta');
    if (etaFixMs > MAX_ETA_FIX_MS) motivi.push(`eta=${etaFixMs}ms`);
    return {
      decisione: distanzaOra <= raggioM ? 'scatta' : 'attendi',
      tCpaSecondi: NaN,
      dCpaMetri: NaN,
      distanzaOraMetri: distanzaOra,
      haPredetto: false,
      motivo: `fail-open:${motivi.join(' ')}`,
    };
  }

  // Vettore velocita' nel frame locale.
  const rotteRad = (rotta * Math.PI) / 180;
  const vEst = velocita * Math.sin(rotteRad);
  const vNord = velocita * Math.cos(rotteRad);
  const vQuadro = vEst * vEst + vNord * vNord;

  // t_cpa = (r · v) / (v · v)
  const tCpa = (est * vEst + nord * vNord) / vQuadro;
  // d_cpa = | r - v * t_cpa |
  const scartoEst = est - vEst * tCpa;
  const scartoNord = nord - vNord * tCpa;
  const dCpa = Math.sqrt(scartoEst * scartoEst + scartoNord * scartoNord);

  const base = { tCpaSecondi: tCpa, dCpaMetri: dCpa, distanzaOraMetri: distanzaOra, haPredetto: true };

  // ORDINE DEI RAMI: identico a PredictiveTrigger.kt:190-211. Non riordinare.
  // Gia' dentro il raggio: si annuncia comunque, la predizione non deve poter
  // negare un arrivo effettivo.
  if (distanzaOra <= raggioM) return { ...base, decisione: 'scatta', motivo: 'dentro-raggio' };
  // Si sta allontanando (il CPA e' dietro di lui).
  if (tCpa <= 0) return { ...base, decisione: 'rifiuta', motivo: 'si-allontana' };
  // Passera' di lato: via parallela, altro lato della piazza.
  if (dCpa > corridoio) return { ...base, decisione: 'rifiuta', motivo: `fuori-corridoio d_cpa=${Math.round(dCpa)}m` };
  // In rotta, ma non ancora nella finestra di anticipo.
  if (tCpa > tLead) return { ...base, decisione: 'attendi', motivo: `troppo-presto t_cpa=${Math.round(tCpa)}s` };
  // In rotta e dentro la finestra: e' il momento.
  return { ...base, decisione: 'scatta', motivo: `predetto t_cpa=${Math.round(tCpa)}s` };
}

/**
 * Superamento del POI: CPA alle spalle di almeno DISTANZA_SUPERAMENTO_M metri
 * E distanza oltre il pavimento radiale, in crescita. Port di
 * PredictiveTrigger.hasPassed (Kotlin:230-241). Il chiamante sceglie il
 * pavimento (raggio d'arrivo in auto, raggio d'alert a piedi).
 */
export function haSuperato(
  tCpaSecondi: number,
  distanzaOra: number,
  distanzaPrecedente: number,
  raggioM: number,
  velocitaMs: number,
): boolean {
  if (distanzaOra <= distanzaPrecedente) return false;
  if (!Number.isFinite(tCpaSecondi)) return distanzaOra > raggioM;
  const metriOltreCpa = -tCpaSecondi * Math.max(0, velocitaMs);
  return metriOltreCpa > DISTANZA_SUPERAMENTO_M && distanzaOra > raggioM;
}

// ── Utilita' geometriche (port 1:1 del nativo) ───────────────────────────────

/** Proietta una posizione in avanti lungo una rotta, per `secondi`. */
function estrapola(
  lat: number, lon: number, rottaGradi: number, velocitaMs: number, secondi: number,
): { lat: number; lon: number } {
  if (!(secondi > 0) || !(velocitaMs > 0) || !(rottaGradi >= 0)) return { lat, lon };
  const distanza = velocitaMs * secondi;
  const rad = (rottaGradi * Math.PI) / 180;
  const dNord = distanza * Math.cos(rad);
  const dEst = distanza * Math.sin(rad);
  return {
    lat: lat + dNord / METRI_PER_GRADO_LAT,
    lon: lon + dEst / (METRI_PER_GRADO_LAT * cosLatSicuro(lat)),
  };
}

/** Offset (est, nord) in metri dal punto utente al POI. */
function offsetLocale(
  latUtente: number, lonUtente: number, poiLat: number, poiLon: number,
): { est: number; nord: number } {
  return {
    est: (poiLon - lonUtente) * METRI_PER_GRADO_LAT * cosLatSicuro(latUtente),
    nord: (poiLat - latUtente) * METRI_PER_GRADO_LAT,
  };
}

/** Distanza piana nel frame locale: basta e avanza sotto i 200 m del filtro. */
function distanzaPiana(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const { est, nord } = offsetLocale(lat1, lon1, lat2, lon2);
  return Math.sqrt(est * est + nord * nord);
}

function cosLatSicuro(lat: number): number {
  const c = Math.cos((lat * Math.PI) / 180);
  return Math.abs(c) < 1e-6 ? 1e-6 : c;
}
