/**
 * DIECI TAPPE — i POI lungo il corridoio del percorso.
 *
 * Il radar vede 2 km attorno a te (1 km sulla PWA) e si sposta con te: per
 * gli incontri in cammino basta. Ma il giro il suo tracciato lo CONOSCE dal
 * primo momento — una linea di qualche centinaio di punti — e aspettare di
 * arrivarci per scoprire cosa c'e` lungo la strada e` uno spreco: non si puo`
 * aggiungere una tappa quando l'ordine e` gia` fatto e si e` a meta`.
 *
 * Qui si interroga il database lungo la linea, una volta: un cerchio ogni
 * ~300 m di tracciato, in piccoli gruppi per non affollare Supabase (la
 * memoria di progetto sulla saturazione vale anche per le letture), poi si
 * tiene solo cio` che sta davvero a pochi metri dal percorso — la distanza
 * vera dalla polilinea, non dal centro del cerchio.
 *
 * Nessuna predizione: e` geometria.
 */
import { getGeofencePois, isVisiblePoiStatus } from '../../services/poiRepository';
import { isCategoryAllowed } from '../guideSettings';
import { getBlockedCommunityPoiIds } from '../communityModeration';
import { supabase } from '../supabase';

export interface PoiLungoStrada {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string | null;
  city?: string | null;
  is_gem?: boolean;
  premium?: boolean;
  /** Metri fra il POI e il punto piu` vicino del tracciato. */
  distanza_dal_percorso: number;
  /** A che punto del giro lo si incontra (metri dall'inizio del tracciato). */
  metri_lungo: number;
  [altro: string]: any;
}

/** Un cerchio di ricerca ogni tanti metri di tracciato. */
const PASSO_M = 300;
/** Mai piu` di tanti cerchi: su un giro lungo il passo si allarga. */
const MAX_CENTRI = 24;
/** Richieste contemporanee verso il database. */
const IN_PARALLELO = 4;

type Punto = [number, number];

/** Coordinate → metri su un piano locale: basta e avanza per qualche km. */
function proiettore(latRif: number) {
  const kx = 111_320 * Math.cos((latRif * Math.PI) / 180);
  const ky = 110_540;
  return (p: { lat: number; lon: number }) => ({ x: p.lon * kx, y: p.lat * ky });
}

export async function poiLungoIlCorridoio(
  geometria: Punto[],
  opzioni: { entro?: number; escludi?: Set<string> } = {},
): Promise<PoiLungoStrada[]> {
  const entro = opzioni.entro ?? 60;
  const escludi = opzioni.escludi ?? new Set<string>();
  if (!Array.isArray(geometria) || geometria.length < 2) return [];

  // 1. Il tracciato in metri, con la distanza progressiva a ogni vertice.
  const proietta = proiettore(geometria[0][0]);
  const vertici = geometria.map(([lat, lon]) => proietta({ lat, lon }));
  const progressiva: number[] = [0];
  for (let i = 1; i < vertici.length; i++) {
    progressiva.push(progressiva[i - 1] + Math.hypot(vertici[i].x - vertici[i - 1].x, vertici[i].y - vertici[i - 1].y));
  }
  const lunghezza = progressiva[progressiva.length - 1];
  if (!(lunghezza > 0)) return [];

  // 2. I centri di ricerca: uno ogni `passo` metri (il vertice piu` vicino a
  //    quella progressiva: i vertici sono fitti, interpolare non serve).
  const passo = Math.max(PASSO_M, lunghezza / MAX_CENTRI);
  const centri: Punto[] = [];
  let prossimo = 0, j = 0;
  while (prossimo <= lunghezza && centri.length < MAX_CENTRI + 1) {
    while (j < progressiva.length - 1 && progressiva[j] < prossimo) j++;
    centri.push(geometria[j]);
    prossimo += passo;
  }
  const ultimo = geometria[geometria.length - 1];
  if (centri[centri.length - 1] !== ultimo) centri.push(ultimo);

  // Il raggio deve coprire tutto il corridoio fra un centro e l'altro: meta`
  // passo in avanti, `entro` di lato, piu` un margine per il GPS.
  const raggio = Math.ceil(Math.hypot(passo / 2, entro) + 40);

  // 3. Le letture, a piccoli gruppi.
  let userId: string | null = null;
  try { const { data } = await supabase.auth.getSession(); userId = data?.session?.user?.id || null; } catch { /* anonimo */ }
  const trovati = new Map<string, any>();
  for (let i = 0; i < centri.length; i += IN_PARALLELO) {
    const gruppo = centri.slice(i, i + IN_PARALLELO);
    const esiti = await Promise.all(gruppo.map(([lat, lon]) => getGeofencePois(lat, lon, userId, raggio).catch(() => [])));
    for (const lista of esiti) for (const p of lista) {
      const id = String(p?.id ?? '');
      if (id && !trovati.has(id)) trovati.set(id, p);
    }
  }

  // 4. Gli stessi filtri del radar: stato visibile, categorie del GeoControl,
  //    community bloccate. Un POI che il radar non mostrerebbe non deve
  //    entrare dalla finestra del corridoio.
  let attive: Record<string, boolean> = { monumenti: true, musei: true, chiese: true };
  try { const s = localStorage.getItem('wip_active_subcategories'); if (s) attive = JSON.parse(s); } catch { /* default */ }
  const bloccati = getBlockedCommunityPoiIds();

  const esito: PoiLungoStrada[] = [];
  for (const p of trovati.values()) {
    const id = String(p.id);
    if (escludi.has(id)) continue;
    const lat = Number(p.lat), lon = Number(p.lon);
    if (!p.name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!isVisiblePoiStatus(p)) continue;
    if (p.audio_enabled === false) continue;
    if (!isCategoryAllowed({ category: p.category, premium: p.premium, is_gem: p.is_gem }, attive)) continue;
    if (String(p.category || '').toLowerCase() === 'community' && bloccati.has(id)) continue;

    // 5. La distanza vera dalla polilinea, segmento per segmento.
    const q = proietta({ lat, lon });
    let minD = Infinity, lungo = 0;
    for (let i = 1; i < vertici.length; i++) {
      const a = vertici[i - 1], b = vertici[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2)) : 0;
      const d = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
      if (d < minD) { minD = d; lungo = progressiva[i - 1] + t * Math.sqrt(l2); }
    }
    if (minD > entro) continue;
    esito.push({ ...p, id, lat, lon, distanza_dal_percorso: Math.round(minD), metri_lungo: Math.round(lungo) });
  }

  esito.sort((a, b) => a.metri_lungo - b.metri_lungo);
  return esito;
}
