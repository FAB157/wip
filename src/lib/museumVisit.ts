/**
 * VISITA GUIDATA DALL'AI (10/09/2026).
 *
 * Dentro un museo o una chiesa il geofencing tace per design: l'esperienza è
 * inquadrare le opere. Da qui in poi WIP accompagna anche il percorso: dopo il
 * primo scatto (o se l'utente scrive il nome del museo all'inizio) chiede al
 * server `/api/vision/venue-guide` DOVE si trova e un percorso di tappe
 * ancorato alla voce Wikipedia del luogo; ogni opera riconosciuta dopo viene
 * spuntata nella lista.
 *
 * Lo stato vive in localStorage (una visita alla volta, scade dopo 6 ore) e
 * si annuncia con l'evento `wip-museum-visit-updated`. Nessun base64 qui: solo
 * nomi e id delle schede.
 */
import { supabase } from './supabase';
import { getApiUrl } from './api';
import { Language } from './i18n';

export type VenueTappa = {
  nome: string;
  autore: string;
  anno: string;
  dove: string;
  perche: string;
  /** Foto dell'opera da Wikimedia Commons (via Wikidata P18), se esiste. */
  foto?: string;
  /** La stessa foto a 160 px, per il cerchio accanto al nome. */
  fotoIcona?: string;
  /** Il titolo com'è scritto sul cartellino, quando è diverso dal nostro:
   *  chi cerca l'opera con gli occhi legge il muro, non la traduzione. Non
   *  si traduce mai, in nessuna lingua. */
  nomeOriginale?: string;
  /** Opera della collezione di cui il museo NON dichiara la sala: si mostra
   *  senza numero, in fondo, perché «la possiede» non è «oggi la vedi». */
  soloCollezione?: boolean;
  /** Saltata da chi sta visitando: sala chiusa, opera in prestito, fila. */
  skipped?: boolean;
  skippedAt?: number | null;
  /** id della scheda Vision con cui l'utente l'ha spuntata, se l'ha inquadrata. */
  seenCardId?: string | null;
  seenAt?: number | null;
};

export type VenueGuide = {
  tipo: 'museo' | 'chiesa' | 'sito';
  intro: string;
  consiglio: string;
  tappe: VenueTappa[];
  /** Il museo dichiara le sale? Se no, l'ordine è un consiglio di visita e
   *  non un percorso: si dice, invece di numerare tappe che il visitatore
   *  non saprebbe dove cercare. */
  saleDichiarate?: boolean;
  language: string;
};

export type VenueInfo = {
  id: string | null;
  name: string;
  lat: number | null;
  lon: number | null;
  category: string;
};

export type MuseumVisit = {
  venueKey: string;
  venue: VenueInfo;
  guide: VenueGuide;
  /** Foto DEL LUOGO per la testata e per il cerchio accanto al nome: stessa
   *  regola delle opere, due misure, e niente quando nessuna fonte la
   *  dichiara. */
  venuePhoto?: string;
  venuePhotoIcon?: string;
  source: { lang: string; title: string; url: string } | null;
  startedAt: number;
  updatedAt: number;
  /** Opere riconosciute in ordine di scatto (anche quelle fuori percorso). */
  seen: { name: string; cardId: string | null; ts: number }[];
};

const STORAGE_KEY = 'wip_museum_visit';
const VISIT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const MUSEUM_VISIT_EVENT = 'wip-museum-visit-updated';
export const OPEN_MUSEUM_VISIT_EVENT = 'wip-open-museum-visit';

const normalize = (s: any) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9一-鿿Ѐ-ӿ ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['della', 'delle', 'dello', 'degli', 'nella', 'nelle', 'the', 'and', 'with', 'sala', 'room']);
const tokens = (s: string) => normalize(s).split(' ').filter(t => t.length >= 4 && !STOP.has(t));

/** Quanto il nome A è contenuto nel nome B (0-1). */
const overlap = (a: string, b: string): number => {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  if (!ta.length || !tb.size) return 0;
  return ta.filter(t => tb.has(t)).length / ta.length;
};

const emit = () => {
  try { window.dispatchEvent(new CustomEvent(MUSEUM_VISIT_EVENT)); } catch { /* ok */ }
};

export function getVisit(): MuseumVisit | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as MuseumVisit;
    if (!v?.venueKey || !v?.guide?.tappe?.length) return null;
    if (Date.now() - (v.startedAt || 0) > VISIT_MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

function saveVisit(v: MuseumVisit | null) {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage pieno o bloccato */ }
  emit();
}

export function endVisit() {
  saveVisit(null);
}

/** Tappa del percorso che corrisponde a un'opera riconosciuta, se c'è. */
export function matchTappa(guide: VenueGuide, workName: string): number {
  let best = -1;
  let bestScore = 0;
  guide.tappe.forEach((t, i) => {
    const score = Math.max(overlap(t.nome, workName), overlap(workName, t.nome));
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return bestScore >= 0.6 ? best : -1;
}

type VenueGuideResponse =
  | { ok: true; cached?: boolean; fromLibrary?: boolean; venue: VenueInfo; guide: VenueGuide; source: MuseumVisit['source']; officialSite?: string | null; venuePhoto?: string; venuePhotoIcon?: string }
  // 'needs_tour_pass': la visita guidata è del Pass Museo con itinerario.
  | { ok: false; reason: string; venue?: VenueInfo; hasBasePass?: boolean; priceCredits?: number; upgradeCredits?: number };

async function authHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

/**
 * Chiede al server dove siamo e il percorso. `venueHintSource: 'user'` quando
 * è l'utente a scrivere il nome del museo: allora il nome vince sul GPS.
 */
export async function fetchVenueGuide(args: {
  lat: number | null;
  lon: number | null;
  venueHint?: string | null;
  venueHintSource?: 'user' | 'model';
  currentWork?: string | null;
  /** Museo indicato per id: dalla scheda di un museo sulla mappa. */
  poiId?: string | null;
  language: Language;
}): Promise<VenueGuideResponse | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(getApiUrl('/api/vision/venue-guide'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        lat: args.lat,
        lon: args.lon,
        venueHint: args.venueHint || '',
        venueHintSource: args.venueHintSource || 'model',
        currentWork: args.currentWork || '',
        ...(args.poiId ? { poiId: args.poiId } : {}),
        language: args.language,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as VenueGuideResponse;
  } catch {
    return null;
  }
}

/**
 * LIBRERIA: musei e chiese che hanno GIÀ la visita pronta. Serve a mostrare
 * «qui vicino c'è una visita guidata» senza generare nulla e senza spendere.
 */
export type MuseumLibraryItem = {
  venue_key: string;
  venue_name: string;
  poi_id: string | null;
  venue_type: string;
  city: string | null;
  lat: number | null;
  lon: number | null;
  stops_count: number;
  stops_with_room: number;
  official_site: string | null;
  distance_m?: number | null;
  /** Foto DEL LUOGO (Wikidata P18 del museo, o l'immagine del POI): due
   *  misure, come per le opere — grande per la scheda, 160 px per il
   *  cerchio accanto al nome. Assenti quando nessuna fonte ne dichiara
   *  una: in quel caso resta il simbolo, mai la foto di un altro posto. */
  venue_photo?: string;
  venue_photo_icon?: string;
};

export async function fetchMuseumLibrary(args: { lat?: number | null; lon?: number | null; q?: string; language: Language; radiusKm?: number; limit?: number }): Promise<MuseumLibraryItem[]> {
  try {
    const p = new URLSearchParams({ language: args.language });
    if (Number.isFinite(args.lat as number) && Number.isFinite(args.lon as number)) {
      p.set('lat', String(args.lat));
      p.set('lon', String(args.lon));
      p.set('radius_km', String(args.radiusKm ?? 25));
    }
    if (args.q) p.set('q', args.q);
    if (args.limit) p.set('limit', String(args.limit));
    const res = await fetch(getApiUrl(`/api/museums/library?${p.toString()}`));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.museums) ? data.museums : [];
  } catch {
    return [];
  }
}

const venueKeyOf = (venue: VenueInfo) => venue.id ? `poi_${venue.id}` : `nome_${normalize(venue.name).replace(/ /g, '_')}`;

/**
 * Avvia la visita (o la aggiorna) a partire da una risposta del server.
 * Se il luogo è lo stesso della visita in corso, si conserva ciò che è già
 * stato visto; se è un altro luogo, la visita riparte da zero.
 */
export function startVisitFromGuide(resp: Extract<VenueGuideResponse, { ok: true }>): MuseumVisit {
  const key = venueKeyOf(resp.venue);
  const current = getVisit();
  const now = Date.now();
  if (current && current.venueKey === key) {
    // Stesso luogo: si tengono le spunte, si aggiorna il resto.
    const seenNames = current.seen;
    const tappe = resp.guide.tappe.map(t => {
      const hit = seenNames.find(s => Math.max(overlap(t.nome, s.name), overlap(s.name, t.nome)) >= 0.6);
      return hit ? { ...t, seenCardId: hit.cardId, seenAt: hit.ts } : { ...t, seenCardId: null, seenAt: null };
    });
    // La foto già trovata non si perde se questa risposta non ne porta una
    // (una traduzione, per esempio, non la ricerca).
    const v: MuseumVisit = {
      ...current, venue: resp.venue, guide: { ...resp.guide, tappe }, source: resp.source, updatedAt: now,
      venuePhoto: resp.venuePhoto || current.venuePhoto,
      venuePhotoIcon: resp.venuePhotoIcon || current.venuePhotoIcon,
    };
    saveVisit(v);
    return v;
  }
  const v: MuseumVisit = {
    venueKey: key,
    venue: resp.venue,
    guide: { ...resp.guide, tappe: resp.guide.tappe.map(t => ({ ...t, seenCardId: null, seenAt: null })) },
    ...(resp.venuePhoto ? { venuePhoto: resp.venuePhoto } : {}),
    ...(resp.venuePhotoIcon ? { venuePhotoIcon: resp.venuePhotoIcon } : {}),
    source: resp.source,
    startedAt: now,
    updatedAt: now,
    seen: [],
  };
  saveVisit(v);
  return v;
}

/** Registra un'opera riconosciuta: entra in `seen` e spunta la tappa se c'è. */
export function markWorkSeen(workName: string, cardId: string | null): MuseumVisit | null {
  const v = getVisit();
  if (!v || !workName) return null;
  const already = v.seen.some(s => s.cardId && cardId && s.cardId === cardId);
  if (!already) v.seen.push({ name: workName, cardId, ts: Date.now() });
  const idx = matchTappa(v.guide, workName);
  if (idx >= 0 && !v.guide.tappe[idx].seenCardId) {
    v.guide.tappe[idx] = { ...v.guide.tappe[idx], seenCardId: cardId || `seen-${Date.now()}`, seenAt: Date.now() };
  }
  v.updatedAt = Date.now();
  saveVisit(v);
  return v;
}

/**
 * RIAPRE UNA VISITA CONSERVATA, senza rete e senza pagare (11/09/2026).
 *
 * La visita «in corso» vive in localStorage e scade dopo sei ore, perché
 * serve a sapere dove sei ADESSO. L'archivio invece non scade: è roba già
 * pagata. Questa funzione prende una visita dall'archivio e la rimette in
 * corso così com'era — percorso, sale, foto, opere spuntate — senza toccare
 * il server, che è il modo in cui «non si ripaga» smette di essere una
 * promessa e diventa un fatto: la richiesta non parte proprio.
 */
export function riapriVisitaConservata(archiviata: {
  venueKey: string; venueName: string; guide: VenueGuide; venuePhotoIcon?: string;
}): MuseumVisit | null {
  if (!archiviata?.venueKey || !archiviata?.guide?.tappe?.length) return null;
  const now = Date.now();
  const v: MuseumVisit = {
    venueKey: archiviata.venueKey,
    venue: { id: null, name: archiviata.venueName, lat: null, lon: null, category: archiviata.guide.tipo || 'museo' },
    guide: archiviata.guide,
    ...(archiviata.venuePhotoIcon ? { venuePhotoIcon: archiviata.venuePhotoIcon } : {}),
    source: null,
    startedAt: now,
    updatedAt: now,
    // Le spunte sono quelle salvate nel percorso archiviato: chi aveva già
    // visto dieci opere le ritrova spuntate.
    seen: archiviata.guide.tappe
      .filter(t => t.seenCardId)
      .map(t => ({ name: t.nome, cardId: t.seenCardId || null, ts: t.seenAt || now })),
  };
  saveVisit(v);
  return v;
}

/**
 * «NON LA TROVO» (10/09/2026).
 *
 * Dentro un museo vero la sala è chiusa per allestimento, l'opera è partita
 * in prestito, davanti c'è la fila, oppure semplicemente non si riesce a
 * capire dove sia. Fino a ieri il percorso non lo prevedeva: le tappe erano
 * numerate e immobili, e chi restava bloccato sulla 3 non arrivava mai alla 4.
 *
 * Il tasto fa due cose, e la seconda vale più della prima:
 *  1. per chi visita: la tappa si chiude, il percorso prosegue;
 *  2. per noi: se la stessa opera viene saltata da tante persone diverse, non
 *     è sfortuna — è una tappa sbagliata, e ce lo sta dicendo il posto invece
 *     di un controllo automatico. È il segnale più onesto che possiamo avere,
 *     perché arriva da qualcuno che era lì davanti.
 * Il secondo punto è best-effort e anonimo: se la rete non c'è, il salto
 * resta valido lo stesso sul telefono.
 */
export function skipStop(index: number, motivo: 'non_trovata' | 'chiusa' | 'coda' = 'non_trovata'): MuseumVisit | null {
  const v = getVisit();
  if (!v || !v.guide?.tappe?.[index]) return null;
  const tappa = v.guide.tappe[index];
  v.guide.tappe[index] = { ...tappa, skipped: true, skippedAt: Date.now() };
  v.updatedAt = Date.now();
  saveVisit(v);
  // Il segnale al server non blocca nulla e non aspetta risposta.
  void (async () => {
    try {
      const headers = await authHeaders();
      if (!headers) return;
      await fetch(getApiUrl('/api/museums/stop-skipped'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ venueKey: v.venueKey, stopName: tappa.nome, reason: motivo }),
      });
    } catch { /* il salto vale comunque */ }
  })();
  return v;
}

/** Rimette in percorso una tappa saltata per errore. */
export function unskipStop(index: number): MuseumVisit | null {
  const v = getVisit();
  if (!v || !v.guide?.tappe?.[index]) return null;
  const { skipped, skippedAt, ...resto } = v.guide.tappe[index] as any;
  v.guide.tappe[index] = resto;
  v.updatedAt = Date.now();
  saveVisit(v);
  return v;
}

/**
 * Dopo il riconoscimento di un'opera: risolve il luogo (GPS + luogo dichiarato
 * dal modello), avvia/aggiorna la visita e spunta l'opera. Best-effort: non
 * lancia mai, la scheda dell'opera si apre comunque.
 */
export async function onArtworkRecognized(card: any, coords: { lat: number | null; lon: number | null }, language: Language): Promise<MuseumVisit | null> {
  try {
    const workName = String(card?.nome || '').trim();
    const hint = String(card?.luogo_esposizione || '').trim();
    const current = getVisit();
    // Visita già in corso e nessun indizio contrario: si spunta e basta,
    // senza rifare la chiamata.
    if (current && (!hint || overlap(hint, current.venue.name) >= 0.5 || overlap(current.venue.name, hint) >= 0.5)) {
      return markWorkSeen(workName, card?.card_id || null);
    }
    const resp = await fetchVenueGuide({ lat: coords.lat, lon: coords.lon, venueHint: hint, venueHintSource: 'model', currentWork: workName, language });
    if (!resp || resp.ok !== true) {
      // Luogo non risolto: se c'era una visita, l'opera resta almeno tra le viste.
      return current ? markWorkSeen(workName, card?.card_id || null) : null;
    }
    startVisitFromGuide(resp);
    return markWorkSeen(workName, card?.card_id || null);
  } catch {
    return null;
  }
}

/** L'utente scrive il nome del museo all'inizio: la guida parte da lì. */
export async function startVisitByName(name: string, coords: { lat: number | null; lon: number | null }, language: Language): Promise<{ ok: boolean; reason?: string; visit?: MuseumVisit; priceCredits?: number; upgradeCredits?: number; hasBasePass?: boolean }> {
  const resp = await fetchVenueGuide({ lat: coords.lat, lon: coords.lon, venueHint: name, venueHintSource: 'user', language });
  if (!resp) return { ok: false, reason: 'network' };
  if (resp.ok !== true) return { ok: false, reason: resp.reason, priceCredits: resp.priceCredits, upgradeCredits: resp.upgradeCredits, hasBasePass: resp.hasBasePass };
  return { ok: true, visit: startVisitFromGuide(resp) };
}

/**
 * Visita guidata di un museo scelto sulla mappa (o dalla libreria): non serve
 * essere sul posto. Regola del committente: qualsiasi museo o chiesa con sito
 * o voce Wikipedia può avere la sua guida, generata al volo se non è già in
 * libreria.
 */
export async function startVisitByPoi(poiId: string, language: Language, fallbackCoords?: { lat: number | null; lon: number | null }): Promise<{ ok: boolean; reason?: string; visit?: MuseumVisit; priceCredits?: number; upgradeCredits?: number; hasBasePass?: boolean }> {
  const resp = await fetchVenueGuide({ lat: fallbackCoords?.lat ?? null, lon: fallbackCoords?.lon ?? null, poiId, language });
  if (!resp) return { ok: false, reason: 'network' };
  if (resp.ok !== true) return { ok: false, reason: resp.reason, priceCredits: resp.priceCredits, upgradeCredits: resp.upgradeCredits, hasBasePass: resp.hasBasePass };
  return { ok: true, visit: startVisitFromGuide(resp) };
}

export function countSeen(v: MuseumVisit): number {
  return v.guide.tappe.filter(t => !!t.seenCardId).length;
}

/**
 * ESPERIENZE PRENOTABILI del museo (biglietti salta-fila, visite guidate).
 * Solo per chi ha il Pass Museo: è un servizio per chi ha già le guide, non
 * una vetrina per tutti.
 */
export type EsperienzaMuseo = {
  fonte: string;
  titolo: string;
  descrizione: string;
  prezzo: string;
  durata: string;
  voto: string;
  foto: string;
  url: string;
};

export async function fetchEsperienzeMuseo(visit: MuseumVisit, language: Language): Promise<EsperienzaMuseo[]> {
  const headers = await authHeaders();
  if (!headers) return [];
  try {
    const p = new URLSearchParams({ venueName: visit.venue.name, language });
    if (visit.venue.lat != null && visit.venue.lon != null) {
      p.set('lat', String(visit.venue.lat));
      p.set('lon', String(visit.venue.lon));
    }
    const res = await fetch(getApiUrl(`/api/museums/experiences?${p.toString()}`), { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.experiences) ? data.experiences : [];
  } catch {
    return [];
  }
}

/**
 * ALTRE OPERE: chiede al server le opere minori non ancora nel percorso.
 * Solo con la rete (il client nasconde il tasto quando è offline).
 */
export async function fetchMoreArtworks(visit: MuseumVisit, language: Language): Promise<{ ok: boolean; added: VenueTappa[]; reason?: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, added: [], reason: 'login' };
  try {
    const res = await fetch(getApiUrl('/api/museums/more-artworks'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        venueName: visit.venue.name,
        venueKey: visit.venueKey,
        existing: (visit.guide?.tappe || []).map(t => t.nome),
        language,
      }),
    });
    if (!res.ok) return { ok: false, added: [], reason: `http_${res.status}` };
    const data = await res.json();
    if (data?.ok !== true) return { ok: false, added: [], reason: data?.reason || 'no_more' };
    const added: VenueTappa[] = (Array.isArray(data.added) ? data.added : []).map((t: any) => ({
      nome: String(t?.nome || ''), autore: String(t?.autore || ''), anno: String(t?.anno || ''),
      dove: String(t?.dove || ''), perche: String(t?.perche || ''),
      ...(t?.foto ? { foto: String(t.foto) } : {}), ...(t?.fotoIcona ? { fotoIcona: String(t.fotoIcona) } : {}),
      seenCardId: null, seenAt: null,
    })).filter((t: VenueTappa) => t.nome);
    if (added.length) {
      // Entrano nella visita in corso, in coda al percorso.
      const v = getVisit();
      if (v && v.venueKey === visit.venueKey) {
        v.guide = { ...v.guide, tappe: [...v.guide.tappe, ...added] };
        v.updatedAt = Date.now();
        saveVisit(v);
      }
    }
    return { ok: true, added };
  } catch {
    return { ok: false, added: [], reason: 'network' };
  }
}

/**
 * AUDIOGUIDA DETTAGLIATA DI UNA SINGOLA OPERA del percorso (10/09/2026).
 * 250-350 parole come le audioguide dei musei: cosa si vede, tecnica, storia,
 * significato. Generata dal server su fonti verificate e messa in cache per
 * (museo, opera, lingua); inclusa nelle audioguide del Pass Museo.
 */
export type ArtworkGuide = {
  testo: string;
  titolo: string;
  autore: string;
  anno: string;
  tecnica: string;
  misure: string;
  /** Dettagli da cercare guardando: sempre presenti, per ogni opera. */
  daGuardare: string[];
  /** Una curiosità documentata, dopo il racconto. */
  curiosita?: string;
  /** Foto dell'opera (Wikimedia Commons via Wikidata), grande e piccola. */
  foto?: string;
  fotoIcona?: string;
  parole: number;
  language: string;
};

export type ArtworkGuideResponse =
  | { ok: true; cached?: boolean; artwork: string; venue: string; guide: ArtworkGuide; source: { lang: string; title: string; url: string } | null; museumPage?: string | null; scansUsed?: number; scansLimit?: number }
  | { ok: false; reason: string; artwork?: string; priceCredits?: number; scansUsed?: number; scansLimit?: number };

export async function fetchArtworkGuide(args: {
  artwork: string;
  venueName: string;
  artist?: string | null;
  room?: string | null;
  officialSite?: string | null;
  language: Language;
}): Promise<ArtworkGuideResponse | null> {
  const headers = await authHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(getApiUrl('/api/museums/artwork-guide'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        artwork: args.artwork,
        venueName: args.venueName,
        ...(args.artist ? { artist: args.artist } : {}),
        ...(args.room ? { room: args.room } : {}),
        ...(args.officialSite ? { officialSite: args.officialSite } : {}),
        language: args.language,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ArtworkGuideResponse;
  } catch {
    return null;
  }
}
