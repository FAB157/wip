// =====================================================================
// Confini delle denominazioni d'origine, per il layer Vino e Gusto
//
// Dal nostro /api/denominazioni/aree (tabella denominazioni_geometrie):
// USA = confini ufficiali delle AVA (UC Davis AVA Project, CC0, da 27 CFR
// part 9); UE = aree DERIVATE dai confini dei comuni collegati su Wikidata,
// etichettate come indicative. Geometrie già semplificate a ~100 m.
// Cache in memoria per cella di 0,5° e per sessione: una zona vinicola non
// cambia mentre si naviga.
// =====================================================================
import { getApiUrl } from './api';

export interface AreaDenominazione {
  id: string;
  nome: string;
  tipo: string | null;
  prodotto: string | null;
  paese: string | null;
  url: string | null;
  fonte: string;
  qualita: 'ufficiale' | 'derivata';
  attribuzione: string | null;
  area_kmq: number | null;
  geom: any;
}

const memoria = new Map<string, AreaDenominazione[]>();

export async function fetchAreeDenominazioni(b: { south: number; west: number; north: number; east: number }): Promise<AreaDenominazione[]> {
  // Cella fissa di 0,5° attorno al centro: la stessa risposta serve a molti pan
  const cLat = Math.round(((b.south + b.north) / 2) * 2) / 2;
  const cLon = Math.round(((b.west + b.east) / 2) * 2) / 2;
  const halfLat = Math.max(0.35, (b.north - b.south) / 2 + 0.05);
  const halfLon = Math.max(0.5, (b.east - b.west) / 2 + 0.05);
  const chiave = `${cLat}_${cLon}_${halfLat.toFixed(1)}_${halfLon.toFixed(1)}`;
  const m = memoria.get(chiave);
  if (m) return m;
  try {
    const p = new URLSearchParams({
      n: (cLat + halfLat).toFixed(3), s: (cLat - halfLat).toFixed(3),
      e: (cLon + halfLon).toFixed(3), w: (cLon - halfLon).toFixed(3), limit: '60',
    });
    const r = await fetch(getApiUrl(`/api/denominazioni/aree?${p}`), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const j = await r.json();
    const aree: AreaDenominazione[] = Array.isArray(j?.aree) ? j.aree : [];
    memoria.set(chiave, aree);
    return aree;
  } catch {
    return [];
  }
}
