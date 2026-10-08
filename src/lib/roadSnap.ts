// SNAP-TO-PATH (web). Scarica la geometria strade/marciapiedi dell'area da
// /api/roads/tile, la indicizza a griglia in locale e "snappa" la posizione GPS
// sul segmento percorribile più vicino, ma solo in modo CONSERVATIVO: se non
// c'è una strada abbastanza vicina si tiene il GPS grezzo. Nessuna rete al
// momento dello snap (l'indice è già in memoria), degradazione elegante senza
// tile. Vedi endpoint server /api/roads/tile.
import { getApiUrl } from './api';
import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';
import { prescaricaStradeNativo } from '../plugins/ItaintaBackgroundPoi';
import { creaGrafoStrade, distanzaCheDecide, type GrafoStrade, type SorgenteStrada } from './geofencing/distanzaStrada';

type LatLon = [number, number]; // [lat, lon]
interface Seg { a: LatLon; b: LatLon; }
interface Tile { car: number[][][]; foot: number[][][]; }

const CELL = 0.003; // ~300 m: cella della griglia spaziale
const cellKey = (lat: number, lon: number) => `${Math.round(lat / CELL)},${Math.round(lon / CELL)}`;

function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Punto più vicino sul segmento (frame equirettangolare locale) + distanza in m.
function projectToSeg(lat: number, lon: number, a: LatLon, b: LatLon): { lat: number; lon: number; distM: number } {
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1;
  const px = lon * cosLat, py = lat;
  const ax = a[1] * cosLat, ay = a[0];
  const bx = b[1] * cosLat, by = b[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const snapLat = ay + t * dy;
  const snapLon = (ax + t * dx) / cosLat;
  return { lat: snapLat, lon: snapLon, distM: metersBetween(lat, lon, snapLat, snapLon) };
}

export interface RoadIndex {
  snap(lat: number, lon: number, accM: number, mode: 'car' | 'walk'): { lat: number; lon: number; movedM: number } | null;
}

function buildIndex(tile: Tile): RoadIndex {
  const grids: Record<'car' | 'foot', Map<string, Seg[]>> = { car: new Map(), foot: new Map() };
  const addPolylines = (polys: number[][][], net: 'car' | 'foot') => {
    const g = grids[net];
    for (const poly of polys || []) {
      for (let i = 0; i + 1 < poly.length; i++) {
        const a: LatLon = [poly[i][0], poly[i][1]];
        const b: LatLon = [poly[i + 1][0], poly[i + 1][1]];
        const seg: Seg = { a, b };
        for (const pt of [a, b]) {
          const k = cellKey(pt[0], pt[1]);
          const arr = g.get(k);
          if (arr) arr.push(seg); else g.set(k, [seg]);
        }
      }
    }
  };
  addPolylines(tile.car, 'car');
  addPolylines(tile.foot, 'foot');

  return {
    snap(lat, lon, accM, mode) {
      const g = mode === 'car' ? grids.car : grids.foot;
      if (g.size === 0) return null;
      // Soglia conservativa: mai oltre max(accuratezza, 20 m), cap 40 m. Se la
      // strada più vicina è oltre, probabilmente NON sei su una strada (interno
      // di una piazza/parco) → non snappare.
      const maxSnap = Math.min(40, Math.max(20, accM || 20));
      const cLat = Math.round(lat / CELL), cLon = Math.round(lon / CELL);
      let best: { lat: number; lon: number; distM: number } | null = null;
      for (let dLa = -1; dLa <= 1; dLa++) {
        for (let dLo = -1; dLo <= 1; dLo++) {
          const arr = g.get(`${cLat + dLa},${cLon + dLo}`);
          if (!arr) continue;
          for (const s of arr) {
            const p = projectToSeg(lat, lon, s.a, s.b);
            if (!best || p.distM < best.distM) best = p;
          }
        }
      }
      if (!best || best.distM > maxSnap) return null;
      const movedM = metersBetween(lat, lon, best.lat, best.lon);
      if (movedM < 3) return null; // spostamento trascurabile → no-op
      return { lat: best.lat, lon: best.lon, movedM };
    },
  };
}

let currentIndex: RoadIndex | null = null;
// Ultimo TENTATIVO (non ultimo successo): prima si registrava solo il successo,
// quindi dopo un errore di rete shouldRefreshRoads tornava true per sempre e la
// tile veniva richiesta a OGNI fix GPS — con la rete che fa i capricci, una
// richiesta al secondo. Ora ogni tentativo lascia una traccia con il timestamp.
let lastAttempt = { lat: 0, lon: 0, ts: 0, ok: false };
let failures = 0;      // fallimenti consecutivi, azzerati al primo successo
let nextRetryAt = 0;   // epoch ms: prima di questo istante non si riprova
let inFlight = false;

// Attesa crescente dopo un fallimento: 5 s, 15 s, 60 s, 300 s, poi tetto 15 min.
// Se la rete è giù si degrada in silenzio (niente snap, GPS grezzo, nessun log
// a raffica) invece di martellare il server.
const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000, 900_000];
const backoffFor = (n: number) => BACKOFF_MS[Math.min(n, BACKOFF_MS.length - 1)];

// ── METRI DI STRADA PER CHI NON HA UN TRACCIATO (03/10/2026) ───────────────
// Un solo ingresso per banner, liste, incontri del giro e luoghi lungo il
// navigatore: la distanza fra una posizione e un luogo, in metri di strada
// quando la rete attorno è nota, altrimenti la distanza diretta. La sorgente
// (le distanze da una posizione) si ricalcola solo se ci si è spostati di più
// di 3 m o è arrivata una tile nuova: cento luoghi in elenco costano un solo
// Dijkstra.
const RICERCA_STRADA_M = { car: 700, walk: 450 } as const;
let sorgenteInCache: { lat: number; lon: number; mode: 'car' | 'walk'; grafo: GrafoStrade; s: SorgenteStrada | null } | null = null;
function sorgenteDa(lat: number, lon: number, mode: 'car' | 'walk'): SorgenteStrada | null {
  const grafo = getGrafoStrade(mode);
  if (!grafo) return null;
  const c = sorgenteInCache;
  if (c && c.grafo === grafo && c.mode === mode && metersBetween(lat, lon, c.lat, c.lon) < 3) return c.s;
  let s: SorgenteStrada | null = null;
  try { s = grafo.da(lat, lon, RICERCA_STRADA_M[mode]); } catch { s = null; }
  sorgenteInCache = { lat, lon, mode, grafo, s };
  return s;
}
/**
 * La distanza CHE DECIDE (trigger, incontri): metri di strada, Infinity se il
 * luogo non si raggiunge entro il raggio di ricerca. Vedi distanzaCheDecide.
 */
export function metriDiStrada(lat: number, lon: number, pLat: number, pLon: number, mode: 'car' | 'walk' = 'walk'): number {
  const aria = metersBetween(lat, lon, pLat, pLon);
  if (!Number.isFinite(aria) || aria > RICERCA_STRADA_M[mode]) return aria;
  const s = sorgenteDa(lat, lon, mode);
  return distanzaCheDecide(aria, s ? s.verso(pLat, pLon) : null);
}
/** La distanza DA MOSTRARE (banner, elenchi): come sopra, ma sempre un numero finito. */
export function metriDiStradaDaMostrare(lat: number, lon: number, pLat: number, pLon: number, mode: 'car' | 'walk' = 'walk'): number {
  const d = metriDiStrada(lat, lon, pLat, pLon, mode);
  return Number.isFinite(d) ? d : metersBetween(lat, lon, pLat, pLon);
}
/** Tiene aggiornata la tile attorno alla posizione (per chi non passa da foregroundTriggers: giro, navigatore). */
export function tieniStradeAggiornate(lat: number, lon: number): void {
  if (shouldRefreshRoads(lat, lon)) void refreshRoadTile(lat, lon);
}

// Modo di trasporto stimato in casa: il chiamante (foregroundTriggers) non lo
// passa, ma fra due fix consecutivi la velocità si ricava. >4 m/s (~14 km/h) =
// veicolo. Nessuna dipendenza esterna, nessun cambio di firma per i chiamanti.
let lastSeen = { lat: 0, lon: 0, ts: 0 };
let modoStimato: 'car' | 'walk' = 'walk';

function aggiornaModo(lat: number, lon: number, now: number) {
  if (lastSeen.ts) {
    const dt = (now - lastSeen.ts) / 1000;
    if (dt > 1 && dt < 120) {
      const v = metersBetween(lat, lon, lastSeen.lat, lastSeen.lon) / dt;
      // Isteresi: si entra in "car" sopra 4 m/s, si esce sotto 2 m/s, così un
      // semaforo rosso non fa oscillare soglia e raggio a ogni fix.
      if (v > 4) modoStimato = 'car';
      else if (v < 2) modoStimato = 'walk';
    }
  }
  lastSeen = { lat, lon, ts: now };
}

// Soglia di rinfresco legata al modo, non più 400 m fissi:
// - a piedi (1,4 m/s) 500 m sono ~6 min e restano dentro il raggio 700 m;
// - in auto (14 m/s) 400 m sono 28 s, troppo tardi: si scarica un raggio più
//   largo (1500 m, il massimo che il server accetta) e si rinfresca a 900 m,
//   cioè ~64 s di preavviso con ~600 m di geometria ancora buona davanti.
// Effetto collaterale voluto: in auto si passa da ~200 download/ora a ~55.
const SOGLIA_M: Record<'car' | 'walk', number> = { car: 900, walk: 500 };
const RAGGIO_M: Record<'car' | 'walk', number> = { car: 1500, walk: 700 };

export function getRoadIndex(): RoadIndex | null { return currentIndex; }

// DISTANZA DI STRADA (03/10/2026): le stesse polilinee, come grafo. Costruito
// alla prima richiesta dopo ogni tile nuova, una rete alla volta (a piedi si
// usa la pedonale, in auto quella delle auto). Vedi geofencing/distanzaStrada.ts.
let currentTile: Tile | null = null;
const grafi: { car: GrafoStrade | null; foot: GrafoStrade | null } = { car: null, foot: null };
export function getGrafoStrade(mode: 'car' | 'walk'): GrafoStrade | null {
  if (!currentTile) return null;
  const rete = mode === 'car' ? 'car' : 'foot';
  if (!grafi[rete]) {
    // A PIEDI la rete è pedonale + auto: nelle tile pre-estratte la «foot»
    // contiene solo i tratti pedonali (marciapiedi, sentieri, scalinate) e da
    // sola è a pezzi — a Montecatini 15 coppie di punti su 25 risultavano
    // irraggiungibili; unite, 25 su 25 e mai più lunghe del percorso OSRM
    // (scratch/collaudo-distanza-strada-vera.mts).
    const polilinee = rete === 'foot' ? [...(currentTile.foot || []), ...(currentTile.car || [])] : (currentTile.car || []);
    try { grafi[rete] = creaGrafoStrade(polilinee); } catch { return null; }
  }
  return grafi[rete];
}

// ── STRADE SCARICATE IN ANTICIPO (03/10/2026, committente: «le tiles devono
// essere scaricate quando si crea un percorso, con o senza audioguida, e nelle
// funzioni offline») ──────────────────────────────────────────────────────
// Fino a oggi il tile attorno all'utente viveva solo in memoria: senza rete,
// dopo 500 m le distanze di strada e l'aggancio alla via non avevano più dati.
// Ora ogni tile si salva in IndexedDB, una voce per chiave (la griglia a 0,01°
// con cui il server tiene la cache), e `prescaricaStrade` le prende tutte lungo
// un percorso al momento in cui lo si crea. Il servizio nativo ha la sua copia
// (prescaricaStradeNativo → RoadSnap.prescarica): a schermo spento la WebView
// dorme e questa non la legge nessuno.
const STRADE_PREFISSO = 'wip-strade:';
const STRADE_MAX = 400;                         // tile tenute
const STRADE_FRESCO_MS = 30 * 24 * 3600 * 1000; // dopo si riscarica
const chiaveTile = (lat: number, lon: number) => `${lat.toFixed(2)},${lon.toFixed(2)}`;

async function salvaTile(chiave: string, tile: any): Promise<void> {
  try { await idbSet(STRADE_PREFISSO + chiave, { ts: Date.now(), car: tile.car || [], foot: tile.foot || [] }); } catch { /* disco pieno o IndexedDB assente */ }
}
async function leggiTile(chiave: string): Promise<{ ts: number; car: number[][][]; foot: number[][][] } | null> {
  try { return (await idbGet(STRADE_PREFISSO + chiave)) || null; } catch { return null; }
}
async function potaTile(): Promise<void> {
  try {
    const chiavi = (await idbKeys()).filter(k => typeof k === 'string' && (k as string).startsWith(STRADE_PREFISSO)) as string[];
    if (chiavi.length <= STRADE_MAX) return;
    const conEta: Array<[string, number]> = [];
    for (const k of chiavi) { const v: any = await idbGet(k); conEta.push([k, Number(v?.ts) || 0]); }
    conEta.sort((a, b) => a[1] - b[1]);
    for (const [k] of conEta.slice(0, chiavi.length - STRADE_MAX)) await idbDel(k);
  } catch { /* best-effort */ }
}

export interface EsitoStrade { totali: number; scaricate: number; giaPresenti: number; fallite: number }

/**
 * Scarica in anticipo le strade lungo un percorso. `punti` = [lat, lon] lungo
 * il tracciato o le tappe (anche fitti: si riducono alle chiavi distinte; fra
 * due punti lontani si riempie il tratto in mezzo). Salta quelle già salvate e
 * fresche; se la rete cade si ferma. Non lancia mai.
 */
export async function prescaricaStrade(
  punti: number[][],
  opz: { auto?: boolean; max?: number; onProgress?: (fatte: number, totali: number) => void } = {},
): Promise<EsitoStrade> {
  const esito: EsitoStrade = { totali: 0, scaricate: 0, giaPresenti: 0, fallite: 0 };
  try {
    const centri = new Map<string, [number, number]>();
    const aggiungi = (lat: number, lon: number) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const cLat = Math.round(lat * 100) / 100, cLon = Math.round(lon * 100) / 100;
      const k = chiaveTile(cLat, cLon);
      if (!centri.has(k)) centri.set(k, [cLat, cLon]);
    };
    let prec: number[] | null = null;
    for (const p of punti || []) {
      if (!Array.isArray(p) || p.length < 2) continue;
      // fra due punti lontani (due tappe senza tracciato) si riempie il tratto
      if (prec) {
        const d = metersBetween(prec[0], prec[1], p[0], p[1]);
        const passi = Math.min(200, Math.floor(d / 400));
        for (let i = 1; i <= passi; i++) aggiungi(prec[0] + ((p[0] - prec[0]) * i) / (passi + 1), prec[1] + ((p[1] - prec[1]) * i) / (passi + 1));
      }
      aggiungi(p[0], p[1]);
      prec = p;
    }
    const lista = [...centri.entries()].slice(0, opz.max ?? 150);
    esito.totali = lista.length;
    const raggio = opz.auto ? RAGGIO_M.car : RAGGIO_M.walk;
    let fatte = 0;
    for (const [k, [lat, lon]] of lista) {
      const gia = await leggiTile(k);
      if (gia && Date.now() - gia.ts < STRADE_FRESCO_MS) esito.giaPresenti++;
      else {
        try {
          const res = await fetch(getApiUrl(`/api/roads/tile?lat=${lat}&lon=${lon}&radius=${raggio}`));
          const tile = res.ok ? await res.json() : null;
          if (tile && (Array.isArray(tile.car) || Array.isArray(tile.foot))) { await salvaTile(k, tile); esito.scaricate++; }
          else esito.fallite++;
        } catch { esito.fallite += lista.length - fatte; break; } // rete assente: inutile insistere
        await new Promise(ok => setTimeout(ok, 150));
      }
      opz.onProgress?.(++fatte, lista.length);
    }
    void potaTile();
    // La stessa cosa nella cache del servizio nativo, che ha la sua strada e i suoi tempi.
    void prescaricaStradeNativo(lista.map(([, c]) => c), !!opz.auto);
  } catch { /* best-effort */ }
  return esito;
}

/**
 * Le strade di un'AREA (mappe offline: centro + raggio in km), dal centro verso
 * l'esterno, fino a `max` chiavi: oltre, l'area è troppo grande e si coprono
 * solo i chilometri centrali — il resto si scarica camminando, quando c'è rete.
 */
export async function prescaricaStradeArea(lat: number, lon: number, raggioKm: number, max = 150): Promise<EsitoStrade> {
  const punti: Array<[number, number, number]> = [];
  const nLat = Math.ceil((raggioKm * 1000) / 1113), nLon = Math.ceil((raggioKm * 1000) / (1113 * Math.max(0.2, Math.cos((lat * Math.PI) / 180))));
  for (let i = -nLat; i <= nLat; i++) for (let j = -nLon; j <= nLon; j++) {
    const pLat = lat + i * 0.01, pLon = lon + j * 0.01;
    const d = metersBetween(lat, lon, pLat, pLon);
    if (d <= raggioKm * 1000) punti.push([pLat, pLon, d]);
  }
  punti.sort((a, b) => a[2] - b[2]);
  // Già una griglia a passo di chiave: il riempimento fra un punto e l'altro
  // di prescaricaStrade aggiunge solo chiavi che ci sono già.
  return prescaricaStrade(punti.slice(0, max).map(p => [p[0], p[1]]), { max });
}

/**
 * True se conviene (ri)scaricare il tile: mai fatto, oppure spostati oltre la
 * soglia del modo di trasporto. Durante l'attesa crescente post-errore torna
 * sempre false. `thresholdM` esplicito, se passato, vince sulla soglia adattiva.
 */
export function shouldRefreshRoads(lat: number, lon: number, thresholdM?: number): boolean {
  const now = Date.now();
  aggiornaModo(lat, lon, now);
  if (inFlight) return false;
  if (now < nextRetryAt) return false; // fallito da poco: si aspetta
  if (!lastAttempt.ts || !lastAttempt.ok) return true;
  const soglia = Number.isFinite(thresholdM as number) ? (thresholdM as number) : SOGLIA_M[modoStimato];
  return metersBetween(lat, lon, lastAttempt.lat, lastAttempt.lon) > soglia;
}

/** Scarica il tile strade dell'area e ricostruisce l'indice. Best-effort. */
export async function refreshRoadTile(lat: number, lon: number, radius?: number): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  const r = Number.isFinite(radius as number) ? (radius as number) : RAGGIO_M[modoStimato];
  let ok = false;
  const applica = (tile: any): boolean => {
    if (!tile || (!Array.isArray(tile.car) && !Array.isArray(tile.foot))) return false;
    if (!(tile.car?.length || tile.foot?.length)) return false;
    currentIndex = buildIndex({ car: tile.car || [], foot: tile.foot || [] });
    currentTile = { car: tile.car || [], foot: tile.foot || [] };
    grafi.car = null; grafi.foot = null;
    return true;
  };
  try {
    try {
      const res = await fetch(getApiUrl(`/api/roads/tile?lat=${lat}&lon=${lon}&radius=${r}`));
      if (res.ok) {
        const tile = await res.json();
        if (applica(tile)) { ok = true; void salvaTile(chiaveTile(lat, lon), tile); }
      }
    } catch { /* rete assente: si prova il disco qui sotto */ }
    // SENZA RETE: il tile della zona scaricato in anticipo (prescaricaStrade) o
    // in un passaggio precedente. Vale come riuscito.
    if (!ok) {
      const salvato = await leggiTile(chiaveTile(lat, lon));
      if (salvato && applica(salvato)) ok = true;
    }
  } catch {
    /* best-effort: senza tile si usa il GPS grezzo, in silenzio */
  } finally {
    // Il tentativo si registra SEMPRE: è questo che spezza il ciclo infinito.
    lastAttempt = { lat, lon, ts: Date.now(), ok };
    if (ok) { failures = 0; nextRetryAt = 0; }
    else { nextRetryAt = Date.now() + backoffFor(failures); failures++; }
    inFlight = false;
  }
}
