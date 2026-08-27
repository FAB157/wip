// ─────────────────────────────────────────────────────────────────────────────
// 🧭 GATE DI BUSSOLA — «non raccontare ciò che ti sei già lasciato alle spalle»
//
// IL CASO REALE (22/08/2026). Cammini lungo la via, superi la chiesa, e tre
// passi DOPO la voce attacca: «Alla tua destra, la chiesa di…». Ti giri, non
// c'è più niente da guardare, e il racconto diventa un fastidio. Succede
// perché il geofence guarda SOLO la distanza: appena entri nel raggio parte,
// e il raggio è un cerchio — non sa se il POI ce l'hai davanti o dietro.
//
// Il gate aggiunge la sola informazione che mancava: la DIREZIONE in cui sei
// rivolto. Se il POI è dietro, il racconto non si butta via — si RIMANDA: non
// si marca come scattato e si riprova al fix successivo. Se torni indietro,
// o se lo superi ma poi ti giri a guardarlo, parte allora, al momento giusto.
//
// PRINCIPIO NON NEGOZIABILE: fail-open. Il gate può solo migliorare il
// tempismo, mai sopprimere un racconto. Sensore assente, permesso negato,
// fix impreciso, dato mancante, eccezione: TUTTO finisce in 'ignora-gate',
// cioè si parla come si è sempre parlato. Meglio un racconto in ritardo che
// nessun racconto (per questo c'è anche la scadenza del rinvio, sotto).
//
// Questo modulo è PURO: non parla col trigger, non marca nulla, non fa suoni.
// Decide e basta. Il cablaggio nel trigger sta altrove.
// ─────────────────────────────────────────────────────────────────────────────

import { calculateBearing } from '../arMath';
import { dentroPerimetro } from './footprints';

/**
 * Bearing geografico (gradi da nord, orario) dal punto 1 al punto 2.
 * Non è una reimplementazione: è l'unica formula del repo (`lib/arMath.ts`,
 * usata dal radar AR e — in copia privata — dal pan audio di locationService),
 * ri-esportata qui col nome italiano per chi cabla il gate.
 */
export function bearingTo(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return calculateBearing(lat1, lon1, lat2, lon2);
}

// ── Costanti tarate (identiche su web, Android e iOS) ────────────────────────

/** Semi-apertura del cono "davanti a me", in gradi: ±60° = 120° di visuale. */
export const TOLLERANZA_GRADI = 60;
/** Sotto questa velocità il `course` del GPS è rumore: si usa la bussola. */
export const SOGLIA_FERMO_MS = 1;
/** Fix peggiore di così non permette di fidarsi di nulla → fail-open. */
export const ACCURATEZZA_MASSIMA_M = 50;
/** Entro questo raggio sei ARRIVATO: dove guardi non conta più. */
export const RAGGIO_ARRIVO_M = 25;
/** Dopo tanto in sospeso si parla comunque: tardi è meglio di mai. */
export const SCADENZA_RINVIO_MS = 90_000;
/** Letture "dietro" consecutive richieste quando la direzione è da bussola. */
export const LETTURE_DIETRO_RICHIESTE = 2;

/** Chiave localStorage della preferenza utente (default: ACCESO). */
export const CHIAVE_PREFERENZA = 'wip_bearing_gate';

// ── Tipi ────────────────────────────────────────────────────────────────────

export type EsitoGate = 'passa' | 'rimanda' | 'ignora-gate';

/** Da dove viene la direzione: cambia quanto ci si fida di una singola lettura. */
export type FonteDirezione = 'gps' | 'bussola';

export interface DirezioneUtente {
  /** Gradi da nord, orario, 0…360. */
  gradi: number;
  fonte: FonteDirezione;
}

/** Il minimo che serve del fix GPS (compatibile con `LocationUpdate`). */
export interface PosizioneGate {
  latitude: number;
  longitude: number;
  speed?: number | null;
  /** `course` del fix: direzione di MOVIMENTO, non di sguardo. */
  heading?: number | null;
  accuracy?: number | null;
}

/** Il minimo che serve del POI. */
export interface PoiGate {
  id: string | number;
  lat: number;
  lon: number;
}

export interface OpzioniGate {
  /** Semi-apertura del cono, in gradi. Default 60. */
  tolleranzaGradi?: number;
  /** Distanza utente-POI in metri, se il chiamante l'ha già calcolata. */
  distanzaMetri?: number | null;
  /** Raggio entro cui si considera "arrivato". Default 25 m. */
  raggioArrivo?: number;
  /** Accuratezza oltre la quale si va fail-open. Default 50 m. */
  accuratezzaMassima?: number;
  /** Quanto un POI può restare in sospeso. Default 90 s. */
  scadenzaRinvioMs?: number;
  /** Forza on/off ignorando la preferenza utente (test, nativi, admin). */
  abilitato?: boolean;
  /** Direzione già nota (test, o piattaforma che la fornisce da sé). */
  direzione?: DirezioneUtente | number | null;
  /** Orologio iniettabile, per i test. */
  adesso?: number;
}

// ── Preferenza utente ───────────────────────────────────────────────────────

/**
 * Il gate è ACCESO per default: è il comportamento che l'utente si aspetta
 * ("raccontami quello che vedo"). Si spegne solo mettendo esplicitamente '0'
 * — così un localStorage vuoto, o bloccato, non lo disattiva per sbaglio.
 */
export function isBearingGateEnabled(): boolean {
  try {
    return localStorage.getItem(CHIAVE_PREFERENZA) !== '0';
  } catch {
    return true; // storage negato: si tiene il default
  }
}

export function setBearingGateEnabled(attivo: boolean): void {
  try {
    localStorage.setItem(CHIAVE_PREFERENZA, attivo ? '1' : '0');
  } catch { /* storage bloccato: la preferenza vale per questa sessione */ }
}

// ── Bussola: si RIUSA il listener del pan audio, non se ne apre un secondo ──
//
// `locationService` registra già `deviceorientationabsolute`/`deviceorientation`
// per l'audio spaziale in cuffia. Un secondo listener sugli stessi eventi
// costerebbe batteria e darebbe lo stesso numero. Qui si legge il suo valore
// tramite `getDeviceHeading()`.
//
// L'import è DINAMICO e una tantum: bearingGate finirà cablato dentro la
// catena dei trigger, che locationService a sua volta usa — un import statico
// creerebbe un ciclo ESM. Finché la promise non si risolve l'heading è null,
// cioè fail-open: al massimo i primi fix parlano senza gate.

let servizioPosizione: any = null;
let importAvviato = false;

function assicuraBussola(): void {
  if (typeof window === 'undefined') return;
  if (!importAvviato) {
    importAvviato = true;
    import('../../services/locationService')
      .then((m) => {
        servizioPosizione = m.locationService;
        try { servizioPosizione?.ensureCompassListener?.(); } catch { /* fail-open */ }
      })
      .catch(() => { /* niente bussola: fail-open */ });
    return;
  }
  try { servizioPosizione?.ensureCompassListener?.(); } catch { /* fail-open */ }
}

/** Heading bussola condiviso, o null. Non registra listener propri. */
export function headingBussola(): number | null {
  try {
    assicuraBussola();
    const h = servizioPosizione?.getDeviceHeading?.();
    return typeof h === 'number' && Number.isFinite(h) ? normalizza360(h) : null;
  } catch {
    return null;
  }
}

// ── Direzione dell'utente ───────────────────────────────────────────────────

/**
 * Direzione in cui l'utente è rivolto, con la fonte da cui arriva.
 *
 * In MOVIMENTO (> 1 m/s) comanda il `course` del GPS: chi cammina guarda dove
 * cammina, ed è un dato stabile, indipendente da come tieni il telefono in
 * mano (che è esattamente ciò che rende inaffidabile la bussola in tasca).
 * DA FERMO il course è rumore puro (il GPS "balla" di qualche metro e inventa
 * direzioni a caso), quindi si passa alla bussola — che da fermo è l'unica a
 * dire davvero dove hai il naso.
 *
 * null = nessuna delle due è utilizzabile → il chiamante va fail-open.
 */
export function direzioneConFonte(posizione: PosizioneGate | null | undefined): DirezioneUtente | null {
  try {
    if (!posizione) return null;
    const velocita = Number(posizione.speed);
    const course = Number(posizione.heading);
    const courseValido = Number.isFinite(course) && course >= 0;

    if (Number.isFinite(velocita) && velocita > SOGLIA_FERMO_MS && courseValido) {
      return { gradi: normalizza360(course), fonte: 'gps' };
    }

    const bussola = headingBussola();
    if (bussola !== null) return { gradi: bussola, fonte: 'bussola' };

    // Ultima spiaggia: un course valido anche se la velocità non è nota
    // (alcuni fix Android danno bearing senza speed).
    if (courseValido && !Number.isFinite(velocita)) {
      return { gradi: normalizza360(course), fonte: 'gps' };
    }
    return null;
  } catch {
    return null;
  }
}

/** Come `direzioneConFonte`, ma solo i gradi (o null). */
export function direzioneUtente(posizione: PosizioneGate | null | undefined): number | null {
  return direzioneConFonte(posizione)?.gradi ?? null;
}

// ── Geometria del cono ──────────────────────────────────────────────────────

/** Differenza angolare firmata, normalizzata a −180…+180. */
export function differenzaAngolare(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

/**
 * true se il POI sta nel cono davanti all'utente.
 * ±60° di default: abbastanza largo da non tagliare fuori ciò che vedi con la
 * coda dell'occhio o dall'altro lato della strada, abbastanza stretto da
 * escludere ciò che hai davvero alle spalle.
 */
export function poiDavanti(direzione: number, bearingVersoPoi: number, tolleranza = TOLLERANZA_GRADI): boolean {
  try {
    if (!Number.isFinite(direzione) || !Number.isFinite(bearingVersoPoi)) return true; // fail-open
    return Math.abs(differenzaAngolare(bearingVersoPoi, direzione)) <= tolleranza;
  } catch {
    return true;
  }
}

// ── Stato: isteresi + scadenza del rinvio ───────────────────────────────────

interface StatoPoi {
  /** Quando il POI è finito in sospeso la prima volta. */
  primoRinvio: number;
  /** Letture "dietro" consecutive (azzerate appena torna davanti). */
  dietroConsecutivi: number;
}

const stato = new Map<string, StatoPoi>();

/** Dimentica lo stato di un POI (dopo che ha parlato) o di tutti. */
export function azzeraGate(poiId?: string | number): void {
  if (poiId === undefined) stato.clear();
  else stato.delete(String(poiId));
}

/** Stato corrente di un POI, per la diagnostica. */
export function statoGate(poiId: string | number): { inSospesoDaMs: number; dietroConsecutivi: number } | null {
  const s = stato.get(String(poiId));
  if (!s) return null;
  return { inSospesoDaMs: Date.now() - s.primoRinvio, dietroConsecutivi: s.dietroConsecutivi };
}

// ── La decisione ────────────────────────────────────────────────────────────

/**
 * Decide se questo POI può essere raccontato ORA.
 *
 *  'passa'        → il POI è davanti: racconta.
 *  'rimanda'      → è dietro: NON marcare nulla, si riprova al fix successivo.
 *  'ignora-gate'  → il gate non ha titolo per decidere: racconta comunque.
 *
 * I casi di 'ignora-gate' non sono ripieghi, sono scelte:
 *  • preferenza spenta;
 *  • nessuna direzione affidabile (niente sensori/permessi/velocità);
 *  • fix impreciso: con ±80 m di errore il bearing è inventato;
 *  • sei DENTRO il perimetro dell'edificio: dentro il duomo la direzione non
 *    vuol dire niente, sei arrivato da qualunque parte tu stia guardando;
 *  • sei nel raggio di arrivo stretto: idem, sei sul posto;
 *  • il rinvio è scaduto (90 s): meglio tardi che mai.
 */
export function valutaGate(
  poi: PoiGate | null | undefined,
  posizione: PosizioneGate | null | undefined,
  opts: OpzioniGate = {}
): EsitoGate {
  try {
    if (!poi || !posizione) return 'ignora-gate';

    const abilitato = opts.abilitato ?? isBearingGateEnabled();
    if (!abilitato) return 'ignora-gate';

    const lat = Number(posizione.latitude);
    const lon = Number(posizione.longitude);
    const pLat = Number(poi.lat);
    const pLon = Number(poi.lon);
    if (![lat, lon, pLat, pLon].every(Number.isFinite)) return 'ignora-gate';

    const id = String(poi.id);
    const adesso = opts.adesso ?? Date.now();

    // Fix impreciso: il bearing calcolato su un punto sbagliato di 80 m dice
    // il contrario del vero. Non si decide su un dato così.
    const accuratezza = Number(posizione.accuracy);
    const accMax = opts.accuratezzaMassima ?? ACCURATEZZA_MASSIMA_M;
    if (Number.isFinite(accuratezza) && accuratezza > accMax) {
      stato.delete(id);
      return 'ignora-gate';
    }

    // Dentro l'edificio: la direzione dello sguardo è irrilevante.
    try {
      if (dentroPerimetro(id, lat, lon)) { stato.delete(id); return 'ignora-gate'; }
    } catch { /* perimetri non caricati: si continua coi raggi */ }

    // Arrivato: idem, il POI è addosso, da qualunque lato lo si guardi.
    const raggioArrivo = opts.raggioArrivo ?? RAGGIO_ARRIVO_M;
    const distanza = opts.distanzaMetri ?? distanzaMetri(lat, lon, pLat, pLon);
    if (Number.isFinite(distanza) && (distanza as number) <= raggioArrivo) {
      stato.delete(id);
      return 'ignora-gate';
    }

    // Direzione: senza, il gate non esiste.
    const dir = normalizzaOpzioneDirezione(opts.direzione) ?? direzioneConFonte(posizione);
    if (!dir) { stato.delete(id); return 'ignora-gate'; }

    const bearing = bearingTo(lat, lon, pLat, pLon);
    const davanti = poiDavanti(dir.gradi, bearing, opts.tolleranzaGradi ?? TOLLERANZA_GRADI);

    if (davanti) {
      stato.delete(id); // torna davanti → l'isteresi riparte da zero
      return 'passa';
    }

    // ── È dietro. Prima di rimandare, due cautele. ──

    const s = stato.get(id) ?? { primoRinvio: adesso, dietroConsecutivi: 0 };
    s.dietroConsecutivi += 1;
    if (!stato.has(id)) stato.set(id, s);

    // 1) Scadenza. Un POI rimandato non può restare in sospeso per sempre:
    //    se sei entrato nel raggio e ne stai uscendo camminando all'indietro
    //    rispetto al POI, senza scadenza non lo sentiresti MAI. Dopo 90 s si
    //    parla comunque — un racconto tardivo vale più del silenzio.
    const scadenza = opts.scadenzaRinvioMs ?? SCADENZA_RINVIO_MS;
    if (adesso - s.primoRinvio >= scadenza) {
      stato.delete(id);
      return 'ignora-gate';
    }

    // 2) Isteresi, e SOLO per la bussola. Da fermo il magnetometro oscilla di
    //    decine di gradi tra una lettura e l'altra: una singola lettura
    //    "dietro" non basta a rimandare, ne servono due consecutive. Il
    //    `course` del GPS in movimento è invece stabile e vale subito — ed è
    //    proprio il caso che il gate esiste per risolvere (cammini, superi la
    //    chiesa: lì si rimanda alla prima lettura, senza esitare).
    if (dir.fonte === 'bussola' && s.dietroConsecutivi < LETTURE_DIETRO_RICHIESTE) {
      return 'ignora-gate';
    }

    return 'rimanda';
  } catch {
    return 'ignora-gate'; // qualunque imprevisto: si parla, come sempre
  }
}

// ── Utilità interne ─────────────────────────────────────────────────────────

function normalizza360(g: number): number {
  return ((g % 360) + 360) % 360;
}

function normalizzaOpzioneDirezione(d: OpzioniGate['direzione']): DirezioneUtente | null {
  if (d === null || d === undefined) return null;
  if (typeof d === 'number') {
    return Number.isFinite(d) ? { gradi: normalizza360(d), fonte: 'bussola' } : null;
  }
  return Number.isFinite(d.gradi) ? { gradi: normalizza360(d.gradi), fonte: d.fonte } : null;
}

/** Haversine, in metri (copia locale minima per non tirarsi dietro moduli). */
function distanzaMetri(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const f1 = (lat1 * Math.PI) / 180;
  const f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ───────────────────────────────────────────────────────────────────────────
   SPECIFICA DEL GATE DI BUSSOLA — da replicare IDENTICA in Kotlin e Swift
   1. Direzione: se speed > 1 m/s usa il course del fix GPS; altrimenti (o se
      il course è null/NaN/negativo) usa la bussola; se manca tutto → null.
   2. poiDavanti(dir, bearing, toll=60): |((bearing-dir+540)%360)-180| <= toll.
   3. Esiti: 'passa' (davanti), 'rimanda' (dietro: NON marcare scattato,
      riprovare al fix successivo), 'ignora-gate' (parla comunque).
   4. 'ignora-gate' quando: preferenza wip_bearing_gate = off; direzione null;
      accuracy > 50 m; utente dentro il perimetro del POI; distanza <= 25 m.
   5. Scadenza: al primo rinvio si segna il timestamp; dopo 90 s → 'ignora-gate'
      (meglio un racconto tardivo che nessun racconto).
   6. Isteresi: solo con direzione da bussola servono 2 letture "dietro"
      consecutive prima di rimandare; col course GPS basta la prima.
   7. Appena il POI torna davanti (o parla) si azzera il suo stato.
   8. Il contatore dei rinvii vive per POI, in memoria, non va persistito.
   9. Fail-open assoluto: qualunque errore o dato mancante → 'ignora-gate'.
  10. Il gate non sopprime MAI un racconto: al più lo sposta più avanti.
   ─────────────────────────────────────────────────────────────────────────── */
