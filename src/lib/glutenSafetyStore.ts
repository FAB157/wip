// Store in memoria delle righe di poi_gluten_safety (fase 5). PURO: nessun
// Supabase, nessun React, cosi' poiTaxonomy resta testabile fuori dal browser.
// Il caricamento dalla rete sta in glutenSafetyCache.ts.
import type { GlutenSafety } from "./glutenSafety";

/** Id di filtro "vincoli" del riquadro Sicurezza: si sommano (AND) ai sub-chip. */
export const GF_VINCOLI = ["gf_cucina", "gf_friggitrice", "gf_certificato"] as const;
export type GfVincolo = typeof GF_VINCOLI[number];

const cache = new Map<string, GlutenSafety | null>(); // null = interrogato, nessuna riga

export const pulisciPoiId = (id: string | number) => String(id).replace(/_[A-Z]{2}$/, "");

export const inCache = (id: string) => cache.has(id);
export const segnaAssente = (id: string) => { cache.set(id, null); };

export function getGlutenSafetySync(id: string | number): GlutenSafety | null {
  return cache.get(pulisciPoiId(id)) ?? null;
}

/** Inserisce righe in cache (usato dal caricamento e dai test). */
export function impostaGlutenSafety(righe: GlutenSafety[]): void {
  for (const r of righe) cache.set(pulisciPoiId(r.poi_id), r);
}

/** Vero se il POI rispetta il vincolo. Senza riga o con dato sconosciuto: falso. */
export function rispettaVincolo(id: string | number, vincolo: GfVincolo): boolean {
  const r = getGlutenSafetySync(id);
  if (!r || r.level === "non_verificato") return false;
  if (vincolo === "gf_cucina") return r.dedicated_kitchen === true;
  if (vincolo === "gf_friggitrice") return r.dedicated_fryer === true;
  return !!r.certification;
}
