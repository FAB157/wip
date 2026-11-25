// =====================================================================
// PERCORSI COLLAUDATI (20/11/2026, committente: «sì, salva il percorso
// collaudato negli itinerari verificati»).
//
// Un itinerario verificato (libreria `verificato-<città>-<N>g`) porta, per
// ogni giorno, le tratte a piedi fra tappe consecutive che il collaudo
// notturno ha CAMMINATO con il telefono simulato (scratch/collaudo-notte,
// simula-tappe.mts): geometria decimata, manovre grezze (tipo, modificatore,
// nome della via, punto) con il testo IT, metri, minuti, data, esito dello
// scatto della guida all'arrivo. Il server le salva solo se lo scatto è stato
// «giusto» (server.ts, percorsoCollaudatoValido).
//
// Qui l'app le usa come PERCORSO INIZIALE: se chi parte sta all'inizio di una
// tratta collaudata (≤ 40 m) e va al suo punto d'arrivo (≤ 30 m), e la tratta
// ha meno di 45 giorni, fetchWalkingRoute la restituisce senza chiedere la
// rete (vale anche offline). Uscire dal percorso fa ricalcolare come sempre:
// da un punto lontano dall'inizio della tratta questa non vale più.
// Gli itinerari senza percorsi collaudati non cambiano in niente.
// =====================================================================

export interface ManovraCollaudata {
  /** maneuver.type / modifier / exit di OSRM, nome della via, punto, metri fino alla manovra dopo. */
  t: string; m?: string; x?: number; n?: string; lat: number; lon: number; d: number;
  /** Testo italiano già pronto (per un utente IT si legge com'è). */
  it?: string;
}
export interface TrattaCollaudata {
  da: { poi_id?: string | null; lat: number; lon: number };
  a: { poi_id?: string | null; lat: number; lon: number };
  /** [lat, lon] decimati. */
  geometria: [number, number][];
  manovre: ManovraCollaudata[];
  metri: number;
  minuti: number;
  /** Data del collaudo, AAAA-MM-GG. */
  data: string;
  scatto: 'giusto' | 'presto' | 'mai' | string;
  punto: string;
}

export const COLLAUDATO_VALIDO_GIORNI = 45;
const R = 6371000, rad = Math.PI / 180;
export function metriFra(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const x = (b.lat - a.lat) * rad, y = (b.lon - a.lon) * rad;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Una tratta si usa solo se: scatto giusto, geometria vera, meno di 45 giorni. */
export function trattaCollaudataValida(t: any, adesso: number = Date.now()): t is TrattaCollaudata {
  if (!t || t.scatto !== 'giusto') return false;
  if (!Array.isArray(t.geometria) || t.geometria.length < 2) return false;
  if (![t.da?.lat, t.da?.lon, t.a?.lat, t.a?.lon].every((v) => Number.isFinite(Number(v)))) return false;
  const quando = new Date(String(t.data || '')).getTime();
  if (!Number.isFinite(quando)) return false;
  return (adesso - quando) / 86400000 <= COLLAUDATO_VALIDO_GIORNI;
}

/** Le tratte valide di un itinerario: `giorni[i].percorso_collaudato` (array di tratte). */
export function tratteCollaudateDi(itin: any, adesso: number = Date.now()): TrattaCollaudata[] {
  const out: TrattaCollaudata[] = [];
  for (const g of (Array.isArray(itin?.giorni) ? itin.giorni : [])) {
    for (const t of (Array.isArray(g?.percorso_collaudato) ? g.percorso_collaudato : [])) if (trattaCollaudataValida(t, adesso)) out.push(t);
  }
  return out;
}

/** La tratta che serve per andare da `da` a `a`: partenza ≤ 40 m dall'inizio, arrivo ≤ 30 m dalla fine. */
export function trattaPer(tratte: TrattaCollaudata[], da: { lat: number; lon: number }, a: { lat: number; lon: number }): TrattaCollaudata | null {
  let migliore: TrattaCollaudata | null = null, scarto = Infinity;
  for (const t of tratte || []) {
    const d1 = metriFra(da, t.da), d2 = metriFra(a, t.a);
    if (d1 <= 40 && d2 <= 30 && d1 + d2 < scarto) { migliore = t; scarto = d1 + d2; }
  }
  return migliore;
}

// Registro in memoria: lo riempie chi apre un itinerario (PlanScreen), lo legge fetchWalkingRoute.
let registro: TrattaCollaudata[] = [];
export function registraPercorsiCollaudati(itin: any): number {
  registro = tratteCollaudateDi(itin);
  return registro.length;
}
export function percorsoCollaudatoPer(da: { lat: number; lon: number }, a: { lat: number; lon: number }): TrattaCollaudata | null {
  if (!registro.length) return null;
  const t = trattaPer(registro, da, a);
  return t && trattaCollaudataValida(t) ? t : null;
}
