// Caricamento (rete) di poi_gluten_safety verso lo store in memoria.
import { supabase } from "./supabase";
import type { GlutenSafety } from "./glutenSafety";
import { impostaGlutenSafety, inCache, segnaAssente, pulisciPoiId } from "./glutenSafetyStore";

const CHUNK = 150;

/** Carica le righe mancanti. Ritorna true se lo store e' cambiato. */
export async function caricaGlutenSafety(ids: Array<string | number>): Promise<boolean> {
  const mancanti = [...new Set(ids.map(pulisciPoiId))].filter(i => !inCache(i));
  if (mancanti.length === 0) return false;
  let cambiata = false;
  for (let i = 0; i < mancanti.length; i += CHUNK) {
    const blocco = mancanti.slice(i, i + CHUNK);
    try {
      const { data, error } = await supabase.from("poi_gluten_safety").select("*").in("poi_id", blocco);
      if (error) continue; // tabella assente/offline: niente cache, si riprovera'
      const righe = (data || []) as GlutenSafety[];
      const trovati = new Set(righe.map(r => r.poi_id));
      if (righe.length) { impostaGlutenSafety(righe); cambiata = true; }
      for (const id of blocco) if (!trovati.has(id)) segnaAssente(id);
    } catch { /* offline */ }
  }
  return cambiata;
}
