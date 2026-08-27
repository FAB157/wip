// =====================================================================
// I TRACCIATI SULLA MAPPA — la linea, non solo il punto di partenza
// =====================================================================
//
// Fino al 21/08/2026 di un cammino la mappa mostrava un pin solo: il
// punto di partenza. All'import da OpenStreetMap le geometrie non erano
// state prese perche' sembravano costare ~3 s a percorso; rimisurato,
// costano 0,3 s. Ora stanno in `route_geometries` e qui si disegnano.
//
// DISEGNO A PUNTINI, non linea piena. E' la stessa scelta di
// TourRouteLayer per il giro a piu' tappe: su una mappa cittadina una
// linea piena si confonde con le strade, i puntini no. E la fascia
// bianca sotto tiene i puntini leggibili anche sopra un bosco verde o
// una tavola scura.
//
// LA LINEA GRIGIA NON E' UN PERCORSO. Quando `profile` vale 'dritta'
// (strade del gusto che si fanno in treno o in barca, o routing muto) si
// disegna tratteggiata e grigia: e' il collegamento fra le tappe, e non
// va spacciato per una strada percorribile. Stessa regola, stesso
// disegno della bozza del giro.
// =====================================================================
import L from 'leaflet';
import { supabase } from './supabase';
import { decodeSegments } from './polyline';

export interface RouteStop {
  n: number;
  luogo: string;
  lat: number;
  lon: number;
  note?: string;
}

export interface RouteLine {
  poiId: string;
  kind: string;
  profile: string;
  segments: [number, number][][];
  km: number | null;
  /** Le tappe in ordine, se il percorso ne ha. */
  stops?: RouteStop[];
}

/**
 * I tracciati che ricadono nel riquadro. Il filtro e' l'intersezione fra
 * due rettangoli, non il contenimento: un cammino di 200 km attraversa lo
 * schermo senza che partenza o arrivo ci stiano dentro, e va disegnato
 * lo stesso.
 *
 * `order` per lunghezza decrescente: se il limite taglia, taglia i
 * sentierini di paese e tiene le grandi dorsali — che sono quelle che a
 * zoom basso uno si aspetta di vedere.
 */
/**
 * Tre livelli di dettaglio, decisi dallo zoom.
 *
 *  · `regionale` (zoom 8-10) — inquadrando la Toscana si devono gia'
 *    vedere i cammini che la attraversano. Si legge `line_regionale`, la
 *    versione grossolana (~120 punti): una pannellata costa ~36 KB invece
 *    di 850, e i percorsi che a quella scala non hanno senso — gli anelli
 *    comunali — quella colonna non ce l'hanno e restano fuori da soli.
 *  · `medio` (11-12) — la linea intera, un punto su due.
 *  · `pieno` (13+) — tutto, e le tappe numerate.
 *
 * Sotto zoom 8 niente linee: restano le palline col numero.
 */
export type LivelloTracciato = 'regionale' | 'medio' | 'pieno';

export function livelloDaZoom(zoom: number): LivelloTracciato | null {
  if (zoom < 8) return null;
  if (zoom < 11) return 'regionale';
  if (zoom < 13) return 'medio';
  return 'pieno';
}

export async function fetchRouteLines(
  bounds: L.LatLngBounds,
  kinds: string[],
  limite: number,
  /**
   * Diradamento: tiene un punto ogni `passo`. A zoom basso un tracciato
   * pieno e' inutile — misurato sulle Alpi a zoom 7: 150 tracciati fanno
   * 300.000 punti, che Leaflet disegna col fiatone e nessuno distingue.
   * Primo e ultimo punto restano sempre, altrimenti i tratti si accorciano.
   */
  passo = 1,
  livello: LivelloTracciato = 'pieno',
): Promise<RouteLine[]> {
  try {
    const regionale = livello === 'regionale';
    let q = supabase
      .from('route_geometries')
      .select(`poi_id,kind,profile,${regionale ? 'line_regionale' : 'line'},length_km,stops`)
      .in('kind', kinds)
      .lte('min_lat', bounds.getNorth())
      .gte('max_lat', bounds.getSouth())
      .lte('min_lon', bounds.getEast())
      .gte('max_lon', bounds.getWest());
    // A scala regionale si mostrano solo i percorsi che quella colonna ce
    // l'hanno: e' il filtro «vale la pena vederlo da qui», gia' deciso al
    // momento di generarla.
    if (regionale) q = q.not('line_regionale', 'is', null);
    const { data, error } = await q
      .order('length_km', { ascending: false })
      .limit(limite);
    if (error) throw error;
    const dirada = (segs: [number, number][][]): [number, number][][] => {
      if (passo <= 1) return segs;
      return segs.map((s) => {
        if (s.length <= 3) return s;
        const out = s.filter((_, i) => i % passo === 0);
        const ultimo = s[s.length - 1];
        if (out[out.length - 1] !== ultimo) out.push(ultimo);
        return out;
      });
    };
    return (data || []).map((r: any) => ({
      poiId: String(r.poi_id),
      kind: String(r.kind || ''),
      profile: String(r.profile || 'reale'),
      segments: dirada(decodeSegments(String((regionale ? r.line_regionale : r.line) || ''))),
      km: r.length_km != null ? Number(r.length_km) : null,
      stops: Array.isArray(r.stops)
        ? (r.stops as any[])
          .filter((t) => Number.isFinite(Number(t?.lat)) && Number.isFinite(Number(t?.lon)))
          .map((t, i) => ({
            n: Number(t.n) || i + 1,
            luogo: String(t.luogo || ''),
            lat: Number(t.lat),
            lon: Number(t.lon),
            note: t.note ? String(t.note) : undefined,
          }))
          .sort((a, b) => a.n - b.n)
        : undefined,
    })).filter((r) => r.segments.length > 0);
  } catch (e) {
    // La tabella puo' non esserci ancora (migration non applicata): i pin
    // restano, la mappa non si rompe per una linea mancante.
    console.warn('[routeLines] tracciati non disponibili:', e);
    return [];
  }
}

// ── Le tappe ─────────────────────────────────────────────────────────────
//
// Un cammino non e' una linea: e' una successione di tappe, e la domanda
// di chi lo guarda e' «dove dormo stasera, e domani quanto cammino».
// Quindi i cerchi NUMERATI, gli stessi del giro a piu' tappe
// (TourRouteLayer): bianchi col bordo del colore del layer e il numero
// dentro. Chi ha gia' fatto un giro con l'app li riconosce.
//
// Le tappe sono LOCALITA, mai rifugi o alberghi: un rifugio cambia
// gestione e chiude, un paese resta dov'e'.
export function drawRouteStops(
  group: L.LayerGroup,
  stops: RouteStop[],
  colore: string,
  nomePercorso?: string,
): void {
  for (const t of stops) {
    const lato = 22;
    const icon = L.divIcon({
      className: 'wip-tappa-percorso',
      html: `<div style="width:${lato}px;height:${lato}px;border-radius:50%;background:#ffffff;
        border:2.5px solid ${colore};color:${colore};display:flex;align-items:center;justify-content:center;
        font-family:system-ui,-apple-system,sans-serif;font-weight:800;font-size:11px;line-height:1;
        box-shadow:0 1px 5px rgba(0,0,0,.3);">${t.n}</div>`,
      iconSize: [lato, lato],
      iconAnchor: [lato / 2, lato / 2],
      popupAnchor: [0, -12],
    });
    L.marker([t.lat, t.lon], { icon, zIndexOffset: 300 })
      .bindPopup(`<div style="font-family:system-ui,sans-serif;min-width:150px;max-width:240px;">
        ${nomePercorso ? `<div style="font-size:10px;color:#6b7280;">${escapeHtmlBreve(nomePercorso)}</div>` : ''}
        <div style="font-size:12.5px;font-weight:800;color:${colore};margin-top:2px;">Tappa ${t.n} · ${escapeHtmlBreve(t.luogo)}</div>
        ${t.note ? `<div style="font-size:11px;color:#374151;margin-top:3px;">${escapeHtmlBreve(t.note)}</div>` : ''}
      </div>`)
      .addTo(group);
  }
}

/** I nomi arrivano da OSM e dalla ricerca: passano da qui prima dell'HTML. */
function escapeHtmlBreve(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Raggruppamento ───────────────────────────────────────────────────────
//
// Stessa grammatica dei POI: da lontano una pallina grande col NUMERO di
// quanti percorsi ci sono lì sotto, avvicinandosi si apre nei singoli pin,
// e al momento giusto compaiono i tracciati. E' la stessa cosa che fa
// MarkerClusterGroup per i monumenti — chi usa l'app ha già imparato che
// quel cerchio col numero si apre toccandolo, e non deve impararlo due
// volte.
//
// `leaflet.markercluster` è già in gioco (lo carica react-leaflet-cluster
// per la mappa dei POI): qui si usa la sua API Leaflet diretta. Se un
// giorno sparisse, si ricade su un gruppo semplice — pin tutti visibili,
// brutto ma vivo.
export function creaGruppoPercorsi(colore: string, aperturaZoom: number): L.LayerGroup {
  const fabbrica = (L as any).markerClusterGroup;
  if (typeof fabbrica !== 'function') return L.layerGroup();
  return fabbrica({
    maxClusterRadius: 55,
    // Oltre questo zoom niente palline: i pin stanno da soli, ed è lo
    // stesso zoom da cui si disegnano i tracciati.
    disableClusteringAtZoom: aperturaZoom,
    spiderfyOnMaxZoom: false,
    showCoverageOnHover: false,
    chunkedLoading: true,
    iconCreateFunction: (cluster: any) => {
      const n = cluster.getChildCount();
      const lato = n < 10 ? 32 : n < 100 ? 38 : 46;
      const corpo = n < 1000 ? String(n) : `${Math.floor(n / 1000)}k`;
      return L.divIcon({
        html: `<div style="width:${lato}px;height:${lato}px;border-radius:50%;background:${colore};
          border:2.5px solid rgba(255,255,255,.92);box-shadow:0 2px 10px rgba(0,0,0,.32);
          color:#fff;display:flex;align-items:center;justify-content:center;
          font-family:system-ui,-apple-system,sans-serif;font-weight:800;font-size:${n < 100 ? 13 : 12}px;">${corpo}</div>`,
        className: 'wip-cluster-percorsi',
        iconSize: [lato, lato],
        iconAnchor: [lato / 2, lato / 2],
      });
    },
  }) as L.LayerGroup;
}

// ── Attribuzione ─────────────────────────────────────────────────────────
//
// Non e' cortesia: OSM e il catasto CAI sono ODbL, il PDIPR e' Licence
// Ouverte 2.0, e tutte e tre chiedono di essere citate dove il dato si
// vede. Finche' il layer e' spento la riga non compare — si dichiara
// quello che si sta mostrando, non tutto lo scibile.
export const ATTRIB_SENTIERI =
  'Tracciati: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL) · CAI INFOMONT · PDIPR (Licence Ouverte 2.0)';
export const ATTRIB_GUSTO =
  'Percorsi calcolati con OSRM su dati © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (ODbL)';

export function setRouteAttribution(map: L.Map | null, testo: string, acceso: boolean): void {
  try {
    const c = (map as any)?.attributionControl;
    if (!c) return;
    if (acceso) c.addAttribution(testo);
    else c.removeAttribution(testo);
  } catch { /* la mappa puo' essere gia' smontata */ }
}

/** Disegna i tracciati dentro il gruppo, sotto i pin (pane di default). */
export function drawRouteLines(
  group: L.LayerGroup,
  linee: RouteLine[],
  colore: string,
  nomi?: Map<string, string>,
): void {
  for (const linea of linee) {
    const nome = nomi?.get(linea.poiId);
    const dritta = linea.profile === 'dritta';
    // 'reale' = la traccia rilevata sul terreno e mappata su OSM o dal CAI:
    // e' il sentiero. Gli altri profili ('foot', 'bike', 'car') sono linee
    // che abbiamo CALCOLATO fra le tappe: seguono strade vere, ma sono il
    // corridoio, non la segnaletica. Sono 552 su 244.221, e vanno
    // distinguibili — un tratteggio piu' rado e un filo di trasparenza,
    // senza gridare.
    const calcolata = !dritta && linea.profile !== 'reale';
    for (const seg of linea.segments) {
      if (dritta) {
        L.polyline(seg, {
          color: '#64748b', weight: 3, opacity: 0.7, dashArray: '6 8', lineCap: 'round', interactive: false,
        }).addTo(group);
        continue;
      }
      // Fascia bianca sotto: i puntini restano leggibili su qualsiasi
      // sfondo. Non intercetta i click, altrimenti coprirebbe i pin.
      L.polyline(seg, {
        color: '#ffffff', weight: 7, opacity: 0.55, lineCap: 'round', interactive: false,
      }).addTo(group);
      const linea2 = L.polyline(seg, {
        color: colore,
        weight: 4,
        opacity: calcolata ? 0.7 : 0.95,
        dashArray: calcolata ? '1 14' : '1 9',
        lineCap: 'round',
      });
      if (nome) {
        const km = linea.km ? ` · ${linea.km < 10 ? linea.km.toFixed(1) : Math.round(linea.km)} km` : '';
        const come = calcolata ? '<br><i>percorso ricostruito fra le tappe</i>' : '';
        linea2.bindTooltip(`${nome}${km}${come}`, { sticky: true, direction: 'top', opacity: 0.9 });
      }
      linea2.addTo(group);
    }
  }
}
