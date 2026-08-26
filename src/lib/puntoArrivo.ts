/**
 * DOVE SI ARRIVA DAVVERO: la porta, non il centro dell'edificio.
 * ==============================================================
 * La differenza fra i due punti non e' cosmetica. OSRM aggancia la
 * destinazione alla strada percorribile piu' vicina: dal centroide di un
 * palazzo puo' agganciarsi alla via sul RETRO, e allora l'intero percorso gira
 * dalla parte sbagliata. Con l'ingresso si aggancia alla via del portone.
 * Cambia il percorso, non l'ultimo metro.
 *
 * Il nativo lo fa gia' da sempre — `poi.entranceLat ?: poi.lat` in
 * GeofenceManager.kt, WipRadarScreen.kt (Android Auto) e
 * PoiModels.swift::triggerLocation. Il web no: tutti i punti di partenza della
 * navigazione passavano il centroide. Questa funzione e' l'allineamento.
 */
export function puntoArrivo(p: any): { lat: number; lon: number } {
  const eLat = Number(p?.entrance_lat ?? p?.entranceLat);
  const eLon = Number(p?.entrance_lon ?? p?.entranceLon);
  // Lo zero-zero e' escluso di proposito: (0,0) e' il Golfo di Guinea, ed e'
  // il valore che esce da un campo vuoto convertito a numero, non un ingresso.
  if (Number.isFinite(eLat) && Number.isFinite(eLon) && (eLat !== 0 || eLon !== 0)) {
    return { lat: eLat, lon: eLon };
  }
  return { lat: Number(p?.lat), lon: Number(p?.lon) };
}

/**
 * LA STRADA DELL'INDIRIZZO, quando la porta non la conosciamo.
 * ==============================================================
 * Ordine (22/08/2026, «il navigatore deve portare nella strada principale
 * data dall'indirizzo»):
 *   1. ingresso OSM (entrance_lat/lon): il nodo sta gia' sulla via del portone;
 *   2. altrimenti l'INDIRIZZO (shared_pois.address + city): si geocodifica il
 *      civico e, se il punto cade entro 150 m dal centroide, si va li'. Il
 *      civico sta per definizione sulla via principale, e OSRM aggancia la
 *      destinazione a QUELLA via invece che al vicolo sul retro;
 *   3. altrimenti il centroide, come sempre.
 * Best-effort: rete giu', geocoder muto o civico troppo lontano (omonimia in
 * un'altra frazione) → si torna al passo 1/3 senza bloccare la navigazione.
 * Cache per id: chi preme "vai" due volte non paga due geocodifiche.
 */
const cacheStrada = new Map<string, { lat: number; lon: number } | null>();
const MAX_SCARTO_CIVICO_M = 150;

function metri(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const cos = Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot((lat2 - lat1) * 111_320, (lon2 - lon1) * 111_320 * cos);
}

export async function puntoArrivoSuStrada(p: any): Promise<{ lat: number; lon: number; fonte: 'ingresso' | 'indirizzo' | 'centroide' }> {
  const base = puntoArrivo(p);
  const haIngresso = base.lat !== Number(p?.lat) || base.lon !== Number(p?.lon);
  if (haIngresso) return { ...base, fonte: 'ingresso' };

  const cLat = Number(p?.lat), cLon = Number(p?.lon);
  if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) return { ...base, fonte: 'centroide' };

  const id = String(p?.id || `${cLat},${cLon}`);
  if (cacheStrada.has(id)) {
    const hit = cacheStrada.get(id);
    return hit ? { ...hit, fonte: 'indirizzo' } : { ...base, fonte: 'centroide' };
  }

  try {
    let address = String(p?.address || '').trim();
    let city = String(p?.city || p?.comune || '').trim();
    // Il radar (RPC nearby_pois, colonne fisse) non porta l'indirizzo: si
    // legge dal POI. Una select per id, solo quando serve e solo una volta.
    if (!address && p?.id) {
      const { supabase } = await import('./supabase');
      const { data } = await supabase.from('shared_pois').select('address, city').eq('id', String(p.id)).maybeSingle();
      address = String((data as any)?.address || '').trim();
      city = city || String((data as any)?.city || '').trim();
    }
    if (!address) { cacheStrada.set(id, null); return { ...base, fonte: 'centroide' }; }

    const { getApiUrl } = await import('./api');
    const q = city && !address.toLowerCase().includes(city.toLowerCase()) ? `${address}, ${city}` : address;
    const r = await fetch(getApiUrl(`/api/geocode?q=${encodeURIComponent(q)}&types=address&limit=3`));
    if (r.ok) {
      const j = await r.json();
      const vicino = (j?.features || [])
        .map((f: any) => ({ lat: Number(f.lat), lon: Number(f.lon) }))
        .filter((f: any) => Number.isFinite(f.lat) && Number.isFinite(f.lon))
        .map((f: any) => ({ ...f, d: metri(cLat, cLon, f.lat, f.lon) }))
        .filter((f: any) => f.d <= MAX_SCARTO_CIVICO_M)
        .sort((a: any, b: any) => a.d - b.d)[0];
      if (vicino) {
        const out = { lat: vicino.lat, lon: vicino.lon };
        cacheStrada.set(id, out);
        return { ...out, fonte: 'indirizzo' };
      }
    }
  } catch { /* best-effort: centroide */ }
  cacheStrada.set(id, null);
  return { ...base, fonte: 'centroide' };
}
