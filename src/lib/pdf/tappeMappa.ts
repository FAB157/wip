/**
 * Le tappe che finiscono sulla mappa del percorso (PDF dell'itinerario),
 * numerate nell'ordine in cui compaiono: lo STESSO elenco alimenta i pin
 * della mappa statica Mapbox e la legenda sotto la mappa (07/09/2026, il
 * committente: «meglio metterla con i nomi delle tappe»). Entrano solo le
 * tappe con coordinate vere; massimo 40 (limite dell'URL Mapbox).
 * Nessuna dipendenza: lo importano sia il client che il server.
 */

export interface TappaMappa {
  n: number;
  giorno: number;
  titolo: string;
  lat: number;
  lon: number;
}

export const MAX_TAPPE_MAPPA = 40;

export const coordTappa = (t: any): { lat: number; lon: number } | null => {
  const lat = Number(t?.coordinate?.lat ?? t?.lat);
  const lon = Number(t?.coordinate?.lng ?? t?.coordinate?.lon ?? t?.lng ?? t?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) ? { lat, lon } : null;
};

export function tappeMappa(plan: any): TappaMappa[] {
  const out: TappaMappa[] = [];
  for (const g of plan?.giorni || []) {
    for (const t of g?.tappe || []) {
      const c = coordTappa(t);
      if (!c) continue;
      if (out.length >= MAX_TAPPE_MAPPA) return out;
      out.push({ n: out.length + 1, giorno: Number(g?.giorno) || 0, titolo: String(t?.titolo_tappa || t?.nome || '').trim(), ...c });
    }
  }
  return out;
}
