// =====================================================================
// PERIMETRI DEGLI EDIFICI — "sono DENTRO?" invece di "quanto dista?"
//
// PERCHE'. Il geofence e' sempre stato un cerchio attorno al centroide del
// POI. Per un edificio compatto va bene; per un palazzo a L, un chiostro, una
// cinta muraria o un parco il cerchio sbaglia in entrambi i versi: o e'
// piccolo e non scatta quando sei dentro l'ala lunga, o e' grande e scatta
// dall'altra parte della strada.
//
// Dal 21/08/2026 il database ha i perimetri veri: 402.889 POI in
// `poi_footprints`, presi dai poligoni degli edifici di OpenStreetMap
// (area mediana 915 m², 15 vertici). Quando un POI ne ha uno, la domanda
// giusta non e' piu' la distanza ma l'appartenenza.
//
// COME. Si scarica il GeoJSON dei soli POI che l'utente ha nel raggio, si
// tiene in memoria, e il test e' un ray casting: si conta quante volte una
// semiretta uscente dal punto attraversa i lati del poligono. Dispari =
// dentro. Non serve PostGIS sul client e non serve una libreria: sono venti
// righe e girano in microsecondi.
//
// UN RIQUADRO PRIMA DI TUTTO. Il ray casting su 15 lati e' veloce, ma farlo
// per 100 POI a ogni fix GPS sarebbe sprecato: prima si guarda se il punto
// cade nel rettangolo che contiene il poligono, che sono quattro confronti.
// Il 99% dei casi si chiude li'.
// =====================================================================

/** Riquadro che contiene il poligono: il filtro rapido prima del test vero. */
interface Riquadro { minLat: number; maxLat: number; minLon: number; maxLon: number }

interface Perimetro {
  /** Anelli del poligono: [[ [lon,lat], ... ], ...]. Il primo e' l'esterno. */
  anelli: number[][][];
  riquadro: Riquadro;
}

// I perimetri scaricati, per id POI. `null` = "chiesto e non ce l'ha", che va
// ricordato quanto il perimetro stesso: senza, si richiederebbe a ogni giro
// il 82% dei POI che un perimetro non ce l'ha.
const cache = new Map<string, Perimetro | null>();

/** Quanti POI tenere in cache: oltre, si buttano i piu' vecchi. */
const MAX_CACHE = 600;
/** Quanti id chiedere per volta: l'URL di PostgREST ha un limite di lunghezza. */
const LOTTO = 80;

let inCorso: Promise<void> | null = null;

function riquadroDi(anelli: number[][][]): Riquadro {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const anello of anelli) {
    for (const [lon, lat] of anello) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** Da GeoJSON (Polygon o MultiPolygon) alla lista di anelli. */
function anelliDa(geojson: any): number[][][] | null {
  try {
    const g = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;
    if (!g?.type) return null;
    if (g.type === 'Polygon' && Array.isArray(g.coordinates)) return g.coordinates;
    if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
      // Un MultiPolygon si appiattisce: per il test "dentro/fuori" contano
      // tutti gli anelli, e la parita' degli attraversamenti li gestisce
      // insieme senza doverli distinguere.
      return g.coordinates.flat();
    }
    return null;
  } catch { return null; }
}

/**
 * Ray casting. Si tira una semiretta orizzontale verso destra dal punto e si
 * contano gli attraversamenti dei lati: dispari = dentro.
 *
 * I buchi (cortili interni, chiostri) vengono gestiti dalla parita' stessa,
 * senza codice apposta: chi sta nel cortile attraversa due volte (l'anello
 * esterno e quello interno) e risulta fuori, che e' la risposta giusta —
 * nel cortile di un palazzo non sei nel palazzo.
 */
function dentro(anelli: number[][][], lat: number, lon: number): boolean {
  let attraversamenti = 0;
  for (const anello of anelli) {
    for (let i = 0, j = anello.length - 1; i < anello.length; j = i++) {
      const [xi, yi] = anello[i];
      const [xj, yj] = anello[j];
      // Il lato deve stare a cavallo della latitudine del punto: se sta
      // tutto sopra o tutto sotto, la semiretta non lo tocca.
      if ((yi > lat) === (yj > lat)) continue;
      // Longitudine del punto in cui il lato taglia la latitudine del punto.
      const taglio = xi + ((lat - yi) / (yj - yi)) * (xj - xi);
      if (lon < taglio) attraversamenti++;
    }
  }
  return attraversamenti % 2 === 1;
}

function potaCache(): void {
  if (cache.size <= MAX_CACHE) return;
  // Map mantiene l'ordine d'inserimento: i primi sono i piu' vecchi.
  const dabuttare = cache.size - MAX_CACHE;
  let i = 0;
  for (const k of cache.keys()) {
    cache.delete(k);
    if (++i >= dabuttare) break;
  }
}

/**
 * Scarica i perimetri dei POI indicati che non sono gia' in cache.
 * Fail-open: se la rete o la tabella non rispondono, i POI restano senza
 * perimetro e il geofence continua a lavorare a raggi come sempre.
 */
export async function caricaPerimetri(poiIds: string[]): Promise<void> {
  const mancanti = poiIds.filter((id) => id && !cache.has(id));
  if (!mancanti.length) return;
  // Una richiesta alla volta: i fix GPS arrivano ogni pochi secondi e senza
  // questo si accavallerebbero chiedendo gli stessi id.
  if (inCorso) return inCorso;

  inCorso = (async () => {
    try {
      const { supabase } = await import('../supabase');
      for (let i = 0; i < mancanti.length; i += LOTTO) {
        const lotto = mancanti.slice(i, i + LOTTO);
        const { data, error } = await supabase
          .from('poi_footprints')
          .select('poi_id,geojson')
          .in('poi_id', lotto);
        if (error) break;
        const trovati = new Set<string>();
        for (const r of (data || [])) {
          const anelli = anelliDa((r as any).geojson);
          if (!anelli?.length) continue;
          cache.set(String((r as any).poi_id), { anelli, riquadro: riquadroDi(anelli) });
          trovati.add(String((r as any).poi_id));
        }
        // Chi non e' tornato un perimetro non ce l'ha: si ricorda, altrimenti
        // lo si richiederebbe a ogni fix.
        for (const id of lotto) if (!trovati.has(id)) cache.set(id, null);
      }
      potaCache();
    } catch { /* fail-open: si resta ai raggi */ }
    finally { inCorso = null; }
  })();
  return inCorso;
}

/**
 * true se il punto sta DENTRO il perimetro del POI.
 * false anche quando il perimetro non c'e' o non e' ancora arrivato: chi
 * chiama deve continuare a usare la distanza come prima.
 */
export function dentroPerimetro(poiId: string, lat: number, lon: number): boolean {
  const p = cache.get(poiId);
  if (!p) return false;
  const r = p.riquadro;
  if (lat < r.minLat || lat > r.maxLat || lon < r.minLon || lon > r.maxLon) return false;
  return dentro(p.anelli, lat, lon);
}

/**
 * DISTANZA DAL BORDO del perimetro, in metri. 0 se il punto e' dentro,
 * Infinity se il POI non ha un perimetro (o non e' ancora arrivato).
 *
 * E' questa la misura che governa l'audioguida (decisione del 22/08/2026):
 * la guida deve partire a 30 m DAL MURO, non quando si e' gia' dentro ne'
 * a 50 m da un ingresso che per un parco o una cinta muraria puo' stare
 * dall'altra parte. Chi cammina lungo la facciata e' "al POI", e lo e' da
 * qualunque lato.
 *
 * Calcolo: minimo della distanza punto-segmento su tutti i lati di tutti
 * gli anelli, in un frame equirettangolare locale (metri). Su 15 lati sono
 * microsecondi; il riquadro allargato di `entro` metri scarta prima chi e'
 * chiaramente lontano.
 */
export function distanzaDalPerimetro(poiId: string, lat: number, lon: number, entro = 100): number {
  const p = cache.get(poiId);
  if (!p) return Infinity;
  const r = p.riquadro;
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos((lat * Math.PI) / 180);
  const dLat = entro / mLat, dLon = entro / (mLon || 1);
  if (lat < r.minLat - dLat || lat > r.maxLat + dLat || lon < r.minLon - dLon || lon > r.maxLon + dLon) return Infinity;
  if (dentro(p.anelli, lat, lon)) return 0;
  let best = Infinity;
  for (const anello of p.anelli) {
    for (let i = 0, j = anello.length - 1; i < anello.length; j = i++) {
      const ax = (anello[j][0] - lon) * mLon, ay = (anello[j][1] - lat) * mLat;
      const bx = (anello[i][0] - lon) * mLon, by = (anello[i][1] - lat) * mLat;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const px = ax + t * dx, py = ay + t * dy;
      const d = Math.sqrt(px * px + py * py);
      if (d < best) best = d;
    }
  }
  return best;
}

/** true se per questo POI sappiamo gia' se ha o non ha un perimetro. */
export function perimetroNoto(poiId: string): boolean {
  return cache.has(poiId);
}

/** Quanti perimetri veri abbiamo in memoria (per la diagnostica). */
export function perimetriInMemoria(): number {
  let n = 0;
  for (const v of cache.values()) if (v) n++;
  return n;
}

/** Svuota tutto: serve ai test e al replay GPS. */
export function svuotaPerimetri(): void {
  cache.clear();
}
