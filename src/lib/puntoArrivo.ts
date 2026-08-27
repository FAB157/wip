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
  // IL PUNTO DELL'INDIRIZZO (23/08/2026, regola dell'utente: «chi ha
  // indirizzo, quello E' l'arrivo»). Non e' una geocodifica al volo: e' la
  // casa piu' vicina al POI nel dump Nominatim, cioe' vicinanza MISURATA a
  // pochi metri, scritta in `address_point_lat/lon`. Arriva col POI, non
  // costa una chiamata di rete, e vale quanto un portone.
  const p2 = puntoIndirizzo(p);
  if (p2) return p2;
  return { lat: Number(p?.lat), lon: Number(p?.lon) };
}

/**
 * GUARDIA sul punto dell'indirizzo: oltre 250 m dal centroide non e'
 * l'indirizzo di QUESTO POI ma di qualcos'altro — un abbinamento sbagliato,
 * una casa dall'altra parte del paese. Meglio il centroide, che e' sicuramente
 * il posto giusto per quanto impreciso, di un punto preciso nel posto errato.
 * Stessa costante di RaggiFiducia (Kotlin) e PoiRadii (Swift).
 */
export const MAX_DISTANZA_PUNTO_INDIRIZZO_M = 250;

/** Il punto dell'indirizzo, se utilizzabile. Null se assente o inaffidabile. */
export function puntoIndirizzo(p: any): { lat: number; lon: number } | null {
  const aLat = Number(p?.address_point_lat ?? p?.addressPointLat);
  const aLon = Number(p?.address_point_lon ?? p?.addressPointLon);
  if (!Number.isFinite(aLat) || !Number.isFinite(aLon) || (aLat === 0 && aLon === 0)) return null;
  // «strada_vicina» non e' un indirizzo: e' «la strada con nome piu' vicina»,
  // scritta per dire da dove ci si arriva. Una chiesa in mezzo ai campi non
  // sta al civico di quella via.
  const fonte = String(p?.address_source ?? p?.addressSource ?? '').trim().toLowerCase();
  if (fonte === 'strada_vicina') return null;
  const cLat = Number(p?.lat), cLon = Number(p?.lon);
  if (Number.isFinite(cLat) && Number.isFinite(cLon)
      && metri(cLat, cLon, aLat, aLon) > MAX_DISTANZA_PUNTO_INDIRIZZO_M) return null;
  return { lat: aLat, lon: aLon };
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
  // L'ingresso vero, non il punto dell'indirizzo: `puntoArrivo` ormai
  // restituisce anche quello, e chiamarlo «ingresso» falserebbe la fonte
  // mostrata e la scala di fiducia che ci si appoggia.
  const eLat = Number(p?.entrance_lat ?? p?.entranceLat);
  const eLon = Number(p?.entrance_lon ?? p?.entranceLon);
  const haIngresso = Number.isFinite(eLat) && Number.isFinite(eLon) && (eLat !== 0 || eLon !== 0);
  if (haIngresso) return { ...base, fonte: 'ingresso' };

  // Punto dell'indirizzo gia' pronto sul POI: e' l'arrivo, e non serve
  // geocodificare niente (la rete resta ferma).
  const pIndirizzo = puntoIndirizzo(p);
  if (pIndirizzo) return { ...pIndirizzo, fonte: 'indirizzo' };

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
    let fonteIndirizzo = String(p?.address_source || '').trim();
    // L'indirizzo arriva ormai insieme al POI: `get_geofence_pois` lo porta dal
    // 23/08/2026 (migration 20260823140000, con address_source) e `nearby_pois`
    // dal 20260823090000. Quando c'e', la select qui sotto non parte affatto —
    // era una query per ogni POI aperto.
    //
    // MA UN INDIRIZZO SENZA LA SUA PROVENIENZA NON E' USABILE. `nearby_pois`
    // restituisce `address` e NON `address_source`: se ci fidassimo, un
    // `address_source='strada_vicina'` (la strada vicina, non l'indirizzo del
    // luogo — vedi sotto) scivolerebbe nel geocoder e il navigatore
    // porterebbe a un punto a caso di quella via. Quindi si interroga il DB
    // anche quando l'indirizzo c'e' ma la fonte manca: una volta sola per POI,
    // il risultato finisce comunque in cacheStrada.
    if ((!address || !fonteIndirizzo) && p?.id) {
      const { supabase } = await import('./supabase');
      const { data } = await supabase.from('shared_pois').select('address, city, address_source').eq('id', String(p.id)).maybeSingle();
      address = address || String((data as any)?.address || '').trim();
      city = city || String((data as any)?.city || '').trim();
      fonteIndirizzo = fonteIndirizzo || String((data as any)?.address_source || '').trim();
    }
    if (!address) { cacheStrada.set(id, null); return { ...base, fonte: 'centroide' }; }

    // NON TUTTI GLI `address` SONO INDIRIZZI (23/08/2026). Dal 23/08 la
    // colonna ospita anche `address_source='strada_vicina'`: la strada con
    // nome piu' vicina al POI, utile a dire "ci si arriva da li'", ma NON
    // l'indirizzo del luogo — una chiesa in mezzo ai campi non sta al civico
    // di quella via. Geocodificarla porterebbe il navigatore su un punto a
    // caso di quella strada. Stessa ragione per gli indirizzi senza civico:
    // senza numero il geocoder restituisce il centro della via, che su una
    // provinciale di tre chilometri e' un altro paese.
    if (fonteIndirizzo === 'strada_vicina' || !/\d/.test(address)) {
      cacheStrada.set(id, null);
      return { ...base, fonte: 'centroide' };
    }

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
        const out = suCarreggiata(vicino.lat, vicino.lon);
        cacheStrada.set(id, out);
        return { ...out, fonte: 'indirizzo' };
      }
    }
  } catch { /* best-effort: centroide */ }
  cacheStrada.set(id, null);
  return { ...base, fonte: 'centroide' };
}

/**
 * IL PUNTO GEOCODIFICATO, PORTATO SULLA CARREGGIATA.
 * ==================================================
 * L'errore del geocoder e' LUNGO la strada (quale civico), non ATTRAVERSO: di
 * quale via si tratti e' certo. Vale quindi la pena di scendere sull'asfalto:
 * il grafo strade e' gia' in memoria per lo snap dei fix GPS (roadSnap.ts,
 * scaricato ogni 500-900 m), e proiettare il civico sul segmento piu' vicino
 * lo mette dove l'utente passa davvero.
 *
 * Il grafo NON porta i nomi delle vie (la tile e' sola geometria), quindi non
 * si puo' cercare «via Roma» e proiettarci il centroide: si snappa il punto
 * geocodificato, che sulla via giusta ci sta gia'. Lo snap si muove al massimo
 * di 40 m e mai sotto i 3, cioe' non puo' cambiare strada; se il grafo non c'e'
 * (nessuna tile, offline) resta il punto geocodificato, come prima.
 */
function suCarreggiata(lat: number, lon: number): { lat: number; lon: number } {
  try {
    // `getRoadIndex` e' sincrona e non fa rete; l'import statico creerebbe un
    // ciclo con i moduli di geofencing che importano puntoArrivo.
    const mod = (globalThis as any).__wipRoadSnap;
    const snap = mod?.getRoadIndex?.()?.snap?.(lat, lon, 20, 'walk');
    if (snap && Number.isFinite(snap.lat) && Number.isFinite(snap.lon)) {
      return { lat: snap.lat, lon: snap.lon };
    }
  } catch { /* nessun grafo: si resta sul punto geocodificato */ }
  return { lat, lon };
}

/** Registra roadSnap per `suCarreggiata` (lo fa foregroundTriggers all'avvio). */
export function collegaGrafoStrade(mod: any): void {
  try { (globalThis as any).__wipRoadSnap = mod; } catch { /* ambiente ostile */ }
}

/** Chiave di cache di un POI: la stessa di `puntoArrivoSuStrada`. */
function chiaveCache(p: any): string {
  return String(p?.id || `${Number(p?.lat)},${Number(p?.lon)}`);
}

/**
 * Il punto dell'indirizzo, SE gia' geocodificato. Sincrona e senza rete:
 * e' quella che il ciclo dei trigger puo' permettersi a ogni fix.
 * null = mai chiesto, oppure chiesto e non utilizzabile.
 */
export function puntoStradaInCache(p: any): { lat: number; lon: number } | null {
  return cacheStrada.get(chiaveCache(p)) || null;
}

/**
 * Punto d'arrivo migliore DISPONIBILE ORA, senza toccare la rete:
 * ingresso → indirizzo gia' geocodificato → centroide.
 */
export function puntoArrivoSincrono(p: any): { lat: number; lon: number; fonte: 'ingresso' | 'indirizzo' | 'centroide' } {
  const base = puntoArrivo(p);
  const cLat = Number(p?.lat), cLon = Number(p?.lon);
  if (base.lat !== cLat || base.lon !== cLon) return { ...base, fonte: 'ingresso' };
  const strada = puntoStradaInCache(p);
  if (strada) return { ...strada, fonte: 'indirizzo' };
  return { ...base, fonte: 'centroide' };
}

/** Un indirizzo vale la geocodifica? (niente `strada_vicina`, serve il civico) */
export function indirizzoGeocodificabile(p: any): boolean {
  const address = String(p?.address || '').trim();
  if (!address) return !!p?.id; // fonte ignota: decidera' la query in puntoArrivoSuStrada
  if (String(p?.address_source || '').trim() === 'strada_vicina') return false;
  return /\d/.test(address);
}

/**
 * PRECARICA, UNA VOLTA PER POI, AL MOMENTO DELL'AVVISO.
 * `puntoArrivoSuStrada` geocodifica via rete: non si puo' chiamare a ogni fix.
 * Si lancia quando il POI entra nel raggio d'AVVISO — li' ci sono secondi di
 * margine prima del trigger — e non si aspetta: se al passaggio successivo il
 * punto e' pronto lo usa `puntoArrivoSincrono`, altrimenti si resta sul
 * centroide. Mai attese bloccanti.
 */
const precaricaInCorso = new Set<string>();
export function precaricaPuntoStrada(p: any): void {
  try {
    const id = chiaveCache(p);
    if (cacheStrada.has(id) || precaricaInCorso.has(id)) return;
    if (!indirizzoGeocodificabile(p)) { cacheStrada.set(id, null); return; }
    precaricaInCorso.add(id);
    void puntoArrivoSuStrada(p)
      .catch(() => { /* rete giu': si riprova al prossimo avviso */ })
      .finally(() => precaricaInCorso.delete(id));
  } catch { /* mai fatale */ }
}
