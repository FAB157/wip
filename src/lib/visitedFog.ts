// =====================================================================
// ITAINTA · Visited Fog — diario delle zone esplorate ("fog of war")
//
// Registra i luoghi in cui l'utente è FISICAMENTE passato come celle di
// una griglia di ~150×150 m: chiave = indici lat/lon con passo 0.0015°
// (≈167 m in latitudine, ≈120 m in longitudine alle latitudini italiane).
//
// Alimentazione: come gpsReplay, NON tocca locationService — al load del
// modulo si aggancia all'evento 'wip-location-update' che quel servizio
// emette già su window a ogni fix GPS (reale o replay). MapArea aggiunge
// solo un markVisited esplicito al primo fix della mappa.
//
// Persistenza: localStorage 'wip_visited_fog' come array JSON di chiavi
// "i_j" in ordine di prima visita (l'ordine dell'array È la coda FIFO).
// Oltre MAX_CELLS (~20.000 celle ≈ 450 km² esplorati) si scartano le
// celle più vecchie: si perde il diario remoto, mai quello recente.
// =====================================================================

/** Passo della griglia in gradi (~150 m per lato alle nostre latitudini). */
export const FOG_CELL_DEG = 0.0015;

const STORAGE_KEY = 'wip_visited_fog';
const MAX_CELLS = 20_000;
const SAVE_DEBOUNCE_MS = 2_000;

export interface FogBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface FogCell {
  /** Indice di riga (latitudine): sud della cella = i * FOG_CELL_DEG. */
  i: number;
  /** Indice di colonna (longitudine): ovest della cella = j * FOG_CELL_DEG. */
  j: number;
  south: number;
  west: number;
  north: number;
  east: number;
}

// Set in-memory: l'ordine di inserimento (prima visita) guida il pruning FIFO.
let cells: Set<string> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadCells(): Set<string> {
  if (cells) return cells;
  cells = new Set<string>();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      for (const k of parsed) {
        if (typeof k === 'string' && /^-?\d+_-?\d+$/.test(k)) cells.add(k);
        if (cells.size >= MAX_CELLS) break;
      }
    }
  } catch { /* storage assente/corrotto: si riparte da zero */ }
  return cells;
}

function scheduleSave(): void {
  if (saveTimer) return; // debounce: un salvataggio ogni SAVE_DEBOUNCE_MS al massimo
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadCells()]));
    } catch { /* quota piena/bloccato: si ritenta alla prossima cella */ }
  }, SAVE_DEBOUNCE_MS);
}

function cellKey(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return `${Math.floor(lat / FOG_CELL_DEG)}_${Math.floor(lon / FOG_CELL_DEG)}`;
}

/** Marca come visitata la cella che contiene (lat, lon). Idempotente. */
export function markVisited(lat: number, lon: number): void {
  const key = cellKey(lat, lon);
  if (!key) return;
  const set = loadCells();
  if (set.has(key)) return;
  set.add(key);
  // Pruning FIFO: via le celle visitate per prime (le più "antiche")
  if (set.size > MAX_CELLS) {
    const excess = set.size - MAX_CELLS;
    let removed = 0;
    for (const old of set) {
      set.delete(old);
      if (++removed >= excess) break;
    }
  }
  scheduleSave();
}

/** Numero totale di celle esplorate (per debug/statistiche). */
export function getVisitedCount(): number {
  return loadCells().size;
}

/**
 * Celle visitate, opzionalmente limitate a un bounds (celle anche solo
 * parzialmente comprese). Ogni cella arriva con i suoi bounds geografici,
 * pronta per essere disegnata come rettangolo Leaflet.
 */
export function getVisitedCells(bounds?: FogBounds): FogCell[] {
  const set = loadCells();
  const out: FogCell[] = [];
  // Range di indici del bounds (inclusivo), per filtrare senza trigonometria
  const iMin = bounds ? Math.floor(bounds.south / FOG_CELL_DEG) : -Infinity;
  const iMax = bounds ? Math.floor(bounds.north / FOG_CELL_DEG) : Infinity;
  const jMin = bounds ? Math.floor(bounds.west / FOG_CELL_DEG) : -Infinity;
  const jMax = bounds ? Math.floor(bounds.east / FOG_CELL_DEG) : Infinity;
  for (const key of set) {
    const sep = key.indexOf('_');
    const i = Number(key.slice(0, sep));
    const j = Number(key.slice(sep + 1));
    if (i < iMin || i > iMax || j < jMin || j > jMax) continue;
    out.push({
      i,
      j,
      south: i * FOG_CELL_DEG,
      west: j * FOG_CELL_DEG,
      north: (i + 1) * FOG_CELL_DEG,
      east: (j + 1) * FOG_CELL_DEG,
    });
  }
  return out;
}

/**
 * Percentuale di esplorazione dell'area nel bounds.
 *
 * METRICA (onesta per costruzione): non conosciamo quali celle del
 * viewport siano "urbane"/percorribili (mare, campi, tetti…), quindi
 * NON si divide per tutte le celle del bounds — darebbe percentuali
 * ridicole su viewport larghi. L'area "esplorabile" è approssimata con
 * l'INVILUPPO dell'esplorazione: le celle visitate più le loro 8 vicine
 * non visitate (la frontiera che hai sfiorato ma non attraversato).
 *
 *   copertura = visitate / (visitate ∪ vicine-non-visitate)  [nel bounds]
 *
 * Proprietà: parte da ~11% alla prima cella (1 su 9), cresce man mano
 * che si "riempie" il proprio intorno, arriva a 100% solo quando ogni
 * cella adiacente al percorso è stata calpestata. Non dichiara mai di
 * aver coperto zone mai avvicinate. Ritorna 0 se nel bounds non c'è
 * nessuna cella visitata.
 */
export function cityCoveragePercent(bounds: FogBounds): number {
  const visited = getVisitedCells(bounds);
  if (visited.length === 0) return 0;
  const set = loadCells();
  const iMin = Math.floor(bounds.south / FOG_CELL_DEG);
  const iMax = Math.floor(bounds.north / FOG_CELL_DEG);
  const jMin = Math.floor(bounds.west / FOG_CELL_DEG);
  const jMax = Math.floor(bounds.east / FOG_CELL_DEG);
  const frontier = new Set<string>();
  for (const c of visited) {
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const ni = c.i + di;
        const nj = c.j + dj;
        if (ni < iMin || ni > iMax || nj < jMin || nj > jMax) continue;
        const nKey = `${ni}_${nj}`;
        if (!set.has(nKey)) frontier.add(nKey);
      }
    }
  }
  return (visited.length / (visited.length + frontier.size)) * 100;
}

// ── Aggancio ai fix GPS (side-effect al load del modulo) ──────────────
// Stesso pattern di gpsReplay: locationService emette 'wip-location-update'
// su window a ogni fix; ogni fix marca la sua cella. Costo per fix: un
// lookup su Set — trascurabile, quindi il diario si costruisce sempre,
// anche col layer fog spento.
if (typeof window !== 'undefined') {
  window.addEventListener('wip-location-update', (e: Event) => {
    try {
      const d = (e as CustomEvent).detail || {};
      markVisited(Number(d.lat), Number(d.lon));
    } catch { /* mai disturbare il flusso posizioni */ }
  });
}
