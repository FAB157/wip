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
  /** Sotto la spiegazione, SEMPRE (richiesta del committente, 12/09/2026):
   *  un fatto sorprendente su questa tappa, o in mancanza un consiglio
   *  pratico per guardarla meglio. Mai generico, mai vuoto quando arriva
   *  dalla generazione nuova — assente solo sulle guide più vecchie in
   *  libreria, generate prima di questa regola. */
  curiosita?: string;
  /** Foto dell'opera da Wikimedia Commons (via Wikidata P18), se esiste. */
  foto?: string;
  /** La stessa foto a 160 px, per il cerchio accanto al nome. */
  fotoIcona?: string;
  /** Il titolo com'è nella FONTE (spesso in inglese, da Wikidata), quando
   *  «nome» è la traduzione: si mostrano tutti e due, perché è con questo
   *  che l'opera si ritrova in rete. Vuoto se coincide con «nome». */
  nomeFonte?: string;
  /** Dove DENTRO la sala: «parete di fondo», «prima campata a destra»,
   *  «sopra l'altare». È il dato che porta davvero davanti all'opera —
   *  in una sala con ottanta quadri il numero della sala non basta. */
  puntoPreciso?: string;
  /** Il titolo com'è scritto sul cartellino, quando è diverso dal nostro:
   *  chi cerca l'opera con gli occhi legge il muro, non la traduzione. Non
   *  si traduce mai, in nessuna lingua. */
  nomeOriginale?: string;
  /** Opera della collezione di cui il museo NON dichiara la sala: si mostra
   *  senza numero, in fondo, perché «la possiede» non è «oggi la vedi». */
  soloCollezione?: boolean;
  /** Il tipo secondo Wikidata (P31): serve al filtro per interessi. Assente
   *  se non censita; «altro» è una risposta onesta, non un errore. */
  tipo?: 'dipinto' | 'scultura' | 'altro';
  /** Posizione nell'ordine di fama di Wikidata (1 = la più nota): serve al
   *  percorso su misura per scegliere cosa tenere in «capolavori» e «30
   *  minuti». Assente se l'opera non è censita. */
  famaRank?: number;
  /** Fra le tre opere più famose del museo: nelle ore centrali c'è la fila.
   *  Il segnale è da Wikidata (numero di lingue in cui l'opera ha una voce),
   *  non un'opinione: chi lo vede può decidere di rimandarla. */
  affollata?: boolean;
  /** Saltata da chi sta visitando: sala chiusa, opera in prestito, fila. */
  skipped?: boolean;
  skippedAt?: number | null;
  /** Rimandata in fondo perché affollata: si vede dopo, non si perde. */
  rimandata?: boolean;
  /** Il cuore: l'opera che ha colpito. Le preferite sono un ricordo, le
   *  viste un elenco — ed è il ricordo che si condivide. */
  preferita?: boolean;
  /** Vista in una visita PRECEDENTE di questo museo (dall'archivio). */
  vistaInPassato?: boolean;
  /** La sua sala è chiusa in questi giorni, secondo gli avvisi del sito. */
  chiusaOggi?: boolean;
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
  /** Dove sono bagni, guardaroba, caffetteria, bookshop, uscita, accessibilità:
   *  solo le voci che il sito ufficiale dichiara. Dopo un'ora e mezza dentro
   *  un museo è la cosa che serve davvero. */
  servizi?: Partial<Record<'bagni' | 'guardaroba' | 'caffetteria' | 'bookshop' | 'uscita' | 'accessibilita', string>>;
  /** La pianta ufficiale del museo (PDF o immagine dal sito), se pubblicata. */
  pianta?: string;
  language: string;
};

/**
 * IL PERCORSO SU MISURA (11/09/2026): tre leve indipendenti.
 *  - tempo: tutto, mezz'ora (8 opere), un'ora (15);
 *  - interessi: tutto, solo dipinti, solo sculture, il resto;
 *  - bambini: sei opere, e l'audioguida raccontata a un bambino di otto anni.
 */
export type Personalizzazione = {
  tempo: 'tutto' | '30' | '60';
  interessi: 'tutto' | 'dipinti' | 'sculture' | 'altro';
  bambini: boolean;
  /** Seconda visita: solo le opere non ancora viste, più le preferite. */
  soloNuove?: boolean;
};
export const PERSONALIZZAZIONE_BASE: Personalizzazione = { tempo: 'tutto', interessi: 'tutto', bambini: false, soloNuove: false };

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
  /** La sala in cui ci si trova, letta dal cartello sul muro. */
  salaCorrente?: string;
  /** Visita ricevuta dal leader di un tour di gruppo: si segue, non si guida. */
  dalLeader?: boolean;
  /** Il percorso su misura scelto: tempo, interessi, bambini. */
  personalizzazione?: Personalizzazione;
  /** Le prime opere sono già state prescaricate all'ingresso: non si rifà. */
  prefetchFatto?: boolean;
  /** «Sei già stato qui»: quando, quante viste, quante preferite. */
  visitaPrecedente?: { quando: number; viste: number; preferite: number };
  /** Gli avvisi di chiusura letti dal sito, com'erano scritti. */
  saleChiuse?: { testo: string; quando: number };
  /** Opere riconosciute in ordine di scatto (anche quelle fuori percorso). */
  seen: { name: string; cardId: string | null; ts: number }[];
};

const STORAGE_KEY = 'wip_museum_visit';
/** L'archivio delle visite fatte (pacchettoMuseo.ts scrive, qui si legge). */
export const ARCHIVIO_MUSEI_KEY = 'wip_museo_offline';
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
  | { ok: false; reason: string; venue?: VenueInfo; hasBasePass?: boolean; priceCredits?: number; upgradeCredits?: number; sourcesOk?: boolean; sample?: { text: string; language: string } | null;
      /** reason 'poche_opere' (12/09/2026): la guida ha meno di minOpere opere, il pass non conviene: scansioni singole a prezzoScansione crediti. */
      opere?: number; minOpere?: number; prezzoScansione?: number };

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
  /** 'library' = guida già pronta; 'poi' = museo del nostro archivio senza
   *  guida, si prepara alla prima richiesta (12/09/2026). Assente nelle
   *  risposte vecchie: vale 'library'. */
  kind?: 'library' | 'poi';
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

/**
 * SUGGERIMENTI per la casella «Cerca un museo o una chiesa» (12/09/2026):
 * guide pronte in libreria, POI del DB e voci Wikipedia, tolleranti agli
 * errori di battitura e in più lingue. Ogni voce ha la forma dell'elenco
 * «qui vicino», così si apre con lo stesso gesto (apriVisitaDiElenco).
 */
export type MuseumSuggestion = MuseumLibraryItem & {
  kind: 'library' | 'poi' | 'wiki';
  subtitle: string | null;
  language?: string;
};

export async function fetchMuseumSuggest(args: { q: string; lat?: number | null; lon?: number | null; language: Language; signal?: AbortSignal }): Promise<MuseumSuggestion[]> {
  try {
    const p = new URLSearchParams({ q: args.q, language: args.language });
    if (Number.isFinite(args.lat as number) && Number.isFinite(args.lon as number)) { p.set('lat', String(args.lat)); p.set('lon', String(args.lon)); }
    const res = await fetch(getApiUrl(`/api/museums/suggest?${p.toString()}`), { signal: args.signal });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.suggestions) ? data.suggestions : [];
  } catch {
    return [];
  }
}

/**
 * MAPPA INTERATTIVA (12/09/2026, regola fissa): la pianta del museo dal sito
 * ufficiale con i pin delle sale; il client abbina le tappe della guida al
 * pin della loro sala. Senza pianta torna vuoto e resta la lista.
 */
export type MuseumMapPin = { sala: string; x: number; y: number; origine?: string; piano?: string; etichetta?: string };
export type MuseumMap = { indice: number; titolo: string | null; url: string; fonteUrl: string | null; larghezza: number | null; altezza: number | null; pins: MuseumMapPin[]; pinsOrigine: string | null };
export type MuseumMapLink = { url: string; titolo: string; tipo: 'pagina' | 'pdf' };

export async function fetchMuseumMap(poiId: string | null | undefined, venueKey?: string | null): Promise<{ maps: MuseumMap[]; links: MuseumMapLink[] }> {
  // Anche per chiave di libreria: le visite avviate per nome («nome_louvre»)
  // non hanno un POI, ma hanno fonti e piante sotto quella chiave.
  if (!poiId && !venueKey) return { maps: [], links: [] };
  try {
    const p = new URLSearchParams();
    if (poiId) p.set('poiId', poiId);
    if (venueKey) p.set('key', venueKey);
    const res = await fetch(getApiUrl(`/api/museums/map?${p.toString()}`));
    if (!res.ok) return { maps: [], links: [] };
    const data = await res.json();
    return { maps: Array.isArray(data?.maps) ? data.maps : [], links: Array.isArray(data?.links) ? data.links : [] };
  } catch {
    return { maps: [], links: [] };
  }
}

/** «Sala 10», «Room 10», «Salle 10» → «10»: la stessa sala scritta in due lingue. */
export const normSalaMappa = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(sala|room|salle|saal|galleria|gallery|galerie|hall|zaal)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

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
  // SECONDA VISITA (12/09/2026): si torna in un museo già visitato. Dall'archivio
  // si sa cosa si è visto e cosa si è messo fra le preferite: le tappe si
  // marcano, e la scheda potrà proporre «solo le nuove, più le preferite».
  const prec = leggiVisitaPrecedente(key, resp.guide.language);
  const v: MuseumVisit = {
    venueKey: key,
    venue: resp.venue,
    guide: {
      ...resp.guide,
      tappe: resp.guide.tappe.map(t => ({
        ...t,
        seenCardId: null,
        seenAt: null,
        ...(prec && prec.viste.has(normalize(t.nome)) ? { vistaInPassato: true } : {}),
        ...(prec && prec.preferite.has(normalize(t.nome)) ? { preferita: true } : {}),
      })),
    },
    ...(resp.venuePhoto ? { venuePhoto: resp.venuePhoto } : {}),
    ...(resp.venuePhotoIcon ? { venuePhotoIcon: resp.venuePhotoIcon } : {}),
    ...(prec && prec.viste.size > 0 ? { visitaPrecedente: { quando: prec.quando, viste: prec.viste.size, preferite: prec.preferite.size } } : {}),
    source: resp.source,
    startedAt: now,
    updatedAt: now,
    seen: [],
  };
  saveVisit(v);
  return v;
}

/**
 * Cosa si era visto in questo museo l'altra volta, dall'archivio permanente
 * (scritto da pacchettoMuseo.ts). Solo se la visita precedente è di almeno
 * un giorno fa: la stessa giornata è la stessa visita, non una seconda.
 */
function leggiVisitaPrecedente(venueKey: string, lang: string): { quando: number; viste: Set<string>; preferite: Set<string> } | null {
  try {
    const tutto = JSON.parse(localStorage.getItem(ARCHIVIO_MUSEI_KEY) || '{}') || {};
    const a = tutto[`${venueKey}::${String(lang).toUpperCase()}`];
    const quando = Number(a?.visitatoIl || a?.scaricatoIl || 0);
    if (!a?.guide?.tappe?.length || !quando || Date.now() - quando < 20 * 60 * 60 * 1000) return null;
    const viste = new Set<string>();
    const preferite = new Set<string>();
    for (const t of a.guide.tappe) {
      if (t?.seenCardId) viste.add(normalize(t.nome));
      if (t?.preferita) preferite.add(normalize(t.nome));
    }
    return { quando, viste, preferite };
  } catch {
    return null;
  }
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
 * IL CARTELLO DELLA SALA COME BUSSOLA (11/09/2026).
 *
 * Si inquadra il numero scritto sul muro all'ingresso della stanza e l'app
 * sa dove sei. Il percorso si riordina da lì: le opere di questa sala
 * vengono prima, e «quanto manca» smette di indovinare.
 * Non consuma il pass: sapere dove si è non è contenuto, è orientamento.
 */
export async function leggiCartelloSala(imageBase64: string, sale: string[]): Promise<{ ok: boolean; sala?: string; reason?: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, reason: 'login' };
  try {
    const res = await fetch(getApiUrl('/api/museums/read-room-sign'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ imageBase64, rooms: sale.slice(0, 60) }),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const d = await res.json();
    return d?.ok === true ? { ok: true, sala: String(d.sala) } : { ok: false, reason: String(d?.reason || 'nessun_cartello') };
  } catch {
    return { ok: false, reason: 'rete' };
  }
}

/**
 * Segna la sala in cui ci si trova. Le tappe di QUESTA sala salgono in cima
 * al percorso — non si riscrive la guida, si cambia il punto di vista: sei
 * qui, quindi queste vengono prima. Le altre restano nel loro ordine.
 */
export function impostaSalaCorrente(sala: string): MuseumVisit | null {
  const v = getVisit();
  if (!v?.guide?.tappe?.length || !sala) return null;
  const s = normalize(sala);
  const qui = v.guide.tappe.filter(t => normalize(String(t.dove || '')) === s);
  if (!qui.length) {
    // La sala letta non è fra quelle del percorso: si registra lo stesso
    // (serve a «quanto manca»), ma non si riordina niente.
    v.salaCorrente = sala;
    v.updatedAt = Date.now();
    saveVisit(v);
    return v;
  }
  const altre = v.guide.tappe.filter(t => normalize(String(t.dove || '')) !== s);
  v.guide = { ...v.guide, tappe: [...qui, ...altre] };
  v.salaCorrente = sala;
  v.updatedAt = Date.now();
  saveVisit(v);
  return v;
}

/**
 * DOVE SEI E QUANTO MANCA (11/09/2026).
 *
 * Dentro un museo il GPS non c'è e — per decisione del committente — niente
 * QR e niente beacon. Ma la posizione non serve inventarla: la si deduce da
 * quello che il visitatore ha appena fatto. L'ULTIMA OPERA INQUADRATA è un
 * check-in che finora buttavamo via: se hai appena riconosciuto la Nascita
 * di Venere, sei nella sala che la nostra stessa guida dichiara.
 *
 * Da lì la domanda che uno si fa ogni volta che finisce di ascoltare —
 * «e adesso dove vado?» — ha una risposta: la prossima tappa non vista, e
 * quante sale la separano da qui. Quando le sale hanno un numero il conto è
 * una sottrazione; quando sono nomi si contano i gruppi da attraversare.
 * Nessuna infrastruttura, nessuna chiamata: solo dati che abbiamo già.
 */
export type ProssimaTappa = {
  indice: number;
  tappa: VenueTappa;
  /** Sala di partenza dedotta dall'ultima opera vista, se si sa. */
  daSala: string;
  /** Quante sale ci sono in mezzo. 0 = stessa sala. null = non calcolabile. */
  saleDiDistanza: number | null;
};

export function prossimaTappa(v: MuseumVisit | null): ProssimaTappa | null {
  if (!v?.guide?.tappe?.length) return null;
  const tappe = v.guide.tappe;
  // La prossima è la prima non vista e non saltata, nell'ordine del percorso,
  // fra quelle del percorso su misura scelto.
  const attive = tappeAttive(v);
  const idx = tappe.findIndex((t, k) => attive.has(k) && !t.seenCardId && !t.skipped);
  if (idx < 0) return null;

  // Da dove si parte, in ordine di certezza:
  //  1. il cartello della sala appena inquadrato — è scritto sul muro;
  //  2. la sala dell'ultima opera spuntata: il check-in che il visitatore ha
  //     già fatto senza saperlo.
  let daSala = String(v.salaCorrente || '').trim();
  if (!daSala) {
    for (let i = tappe.length - 1; i >= 0; i--) {
      if (tappe[i].seenCardId && String(tappe[i].dove || '').trim()) { daSala = String(tappe[i].dove).trim(); break; }
    }
  }

  const aSala = String(tappe[idx].dove || '').trim();
  let saleDiDistanza: number | null = null;
  if (daSala && aSala) {
    if (daSala === aSala) {
      saleDiDistanza = 0;
    } else {
      const na = parseInt((daSala.match(/\d+/) || [''])[0], 10);
      const nb = parseInt((aSala.match(/\d+/) || [''])[0], 10);
      if (Number.isFinite(na) && Number.isFinite(nb)) {
        // Sale numerate: la distanza è la differenza fra i numeri.
        saleDiDistanza = Math.abs(nb - na);
      } else {
        // Sale con un nome: si contano i gruppi da attraversare nel percorso.
        const sale: string[] = [];
        for (const t of tappe) {
          const s = String(t.dove || '').trim();
          if (s && sale[sale.length - 1] !== s) sale.push(s);
        }
        const ia = sale.indexOf(daSala);
        const ib = sale.indexOf(aSala);
        saleDiDistanza = ia >= 0 && ib >= 0 ? Math.abs(ib - ia) : null;
      }
    }
  }
  return { indice: idx, tappa: tappe[idx], daSala, saleDiDistanza };
}

/**
 * DOVE SONO, SUBITO (11/09/2026, richiesta del committente: «non può
 * calcolare in base alla posizione GPS?»). Appena si apre la sezione Visite
 * si chiede al server SOLO il nome del luogo entro 200 m — niente guida,
 * niente AI, una query sull'archivio — e la scheda dice «Sei agli Uffizi»
 * con la foto, prima ancora di toccare «Inizia». Il primo minuto non è più
 * muto: la persona sa che l'app ha capito dov'è.
 */
export type DoveSono = { name: string; id: string | null; photoIcon?: string; inLibrary: boolean; distance_m: number };
export async function whereAmI(coords: { lat: number | null; lon: number | null }, language: Language): Promise<DoveSono | null> {
  if (coords.lat == null || coords.lon == null) return null;
  try {
    const res = await fetch(getApiUrl(`/api/museums/where-am-i?lat=${coords.lat}&lon=${coords.lon}&language=${language}`));
    if (!res.ok) return null;
    const d = await res.json();
    return d?.ok === true && d?.venue?.name ? {
      name: String(d.venue.name), id: d.venue.id ? String(d.venue.id) : null,
      photoIcon: d.photoIcon ? String(d.photoIcon) : undefined,
      inLibrary: !!d.inLibrary, distance_m: Number(d.distance_m || 0),
    } : null;
  } catch {
    return null;
  }
}

/**
 * RIMANDA UN'OPERA AFFOLLATA (11/09/2026): la tappa va in fondo al percorso,
 * senza perdere nulla — si tornerà a vederla quando la fila sarà più corta.
 * Non è un salto: resta nel conto delle opere da vedere.
 */
export function rimandaTappa(index: number): MuseumVisit | null {
  const v = getVisit();
  if (!v?.guide?.tappe?.[index]) return null;
  const tappe = [...v.guide.tappe];
  const [t] = tappe.splice(index, 1);
  tappe.push({ ...t, rimandata: true });
  v.guide = { ...v.guide, tappe };
  v.updatedAt = Date.now();
  saveVisit(v);
  return v;
}

/**
 * VISITA RICEVUTA DAL LEADER del tour di gruppo (11/09/2026). Il percorso
 * arriva intero via broadcast: si salva come visita in corso e si apre la
 * scheda. Il follower non chiama il server e non paga — la guida l'ha pagata
 * il leader, esattamente come per le audioguide dei POI.
 */
export function riceviVisitaDalLeader(payload: any): MuseumVisit | null {
  const guide = payload?.guide;
  if (!guide?.tappe?.length || !payload?.venue?.name) return null;
  const now = Date.now();
  const v: MuseumVisit = {
    venueKey: String(payload.venueKey || venueKeyOf(payload.venue)),
    venue: { id: payload.venue.id ?? null, name: String(payload.venue.name), lat: payload.venue.lat ?? null, lon: payload.venue.lon ?? null, category: String(payload.venue.category || 'museo') },
    guide: { ...guide, tappe: guide.tappe.map((t: any) => ({ ...t, seenCardId: null, seenAt: null })) },
    ...(payload.venuePhoto ? { venuePhoto: String(payload.venuePhoto) } : {}),
    ...(payload.venuePhotoIcon ? { venuePhotoIcon: String(payload.venuePhotoIcon) } : {}),
    source: payload.source || null,
    startedAt: now,
    updatedAt: now,
    seen: [],
    dalLeader: true,
  };
  saveVisit(v);
  try { window.dispatchEvent(new CustomEvent(OPEN_MUSEUM_VISIT_EVENT)); } catch { /* ok */ }
  return v;
}

/**
 * DOMANI (11/09/2026): orari, chiusure, biglietto — dal sito ufficiale,
 * ricopiati e messi in cache una settimana. Niente se il sito non lo dice.
 */
export type Domani = {
  domani: { chiuso: true } | { chiuso: false; apre: string; chiude: string } | null;
  /** Gli orari di OGGI, per «chiude fra 40 minuti» dentro la visita. */
  oggi?: { chiuso: true } | { chiuso: false; apre: string; chiude: string } | null;
  ultimoIngresso: string;
  chiusure: string;
  biglietto: { intero: string; ridotto: string; gratis: string };
  nota: string;
  /** Sale o sezioni chiuse in questi giorni, come le scrive il sito. */
  saleChiuse?: string;
  consiglio: '' | 'fila_ore_centrali';
  fonte: { url: string; lettoIl: string } | null;
};

/**
 * LE SALE CHIUSE OGGI, INCROCIATE COL PERCORSO (12/09/2026). Dal testo del
 * sito («sale 25-30 chiuse fino al 30 ottobre») si estraggono i numeri e
 * gli intervalli; le tappe la cui sala li contiene si marcano «chiusaOggi»
 * e escono dal percorso attivo — prima di partire, non davanti alla porta
 * chiusa. Si salva sulla visita, così vale anche senza rete.
 */
export function applicaSaleChiuse(testo: string): { segnate: number } {
  const v = getVisit();
  if (!v?.guide?.tappe?.length) return { segnate: 0 };
  const numeri = new Set<number>();
  const t = String(testo || '');
  // Gruppi «sala/room/salle… + numeri», con intervalli 25-30 / 3 a 7 / 1 to 5.
  for (const m of t.matchAll(/(?:sal[ae]|rooms?|salles?|saal|säle|salas?|galler(?:ie|ia|y|ies))\s*([\d][\d\s,.;\-–—aàtoy]{0,40})/gi)) {
    const seg = m[1];
    for (const r of seg.matchAll(/(\d{1,3})\s*(?:[-–—]|\ba\b|\bà\b|\bto\b|\bbis\b|\by\b)\s*(\d{1,3})/g)) {
      const a = parseInt(r[1], 10), b = parseInt(r[2], 10);
      if (b >= a && b - a <= 60) for (let n = a; n <= b; n++) numeri.add(n);
    }
    for (const s of seg.matchAll(/\b(\d{1,3})\b/g)) numeri.add(parseInt(s[1], 10));
  }
  if (!numeri.size) return { segnate: 0 };
  let segnate = 0;
  v.guide.tappe = v.guide.tappe.map(tp => {
    const dove = String(tp.dove || '');
    const n = dove.match(/\b(\d{1,3})\b/);
    const chiusa = !!n && numeri.has(parseInt(n[1], 10));
    if (chiusa) segnate++;
    return chiusa ? { ...tp, chiusaOggi: true } : (tp.chiusaOggi ? { ...tp, chiusaOggi: false } : tp);
  });
  v.saleChiuse = { testo: t.slice(0, 240), quando: Date.now() };
  v.updatedAt = Date.now();
  saveVisit(v);
  return { segnate };
}

/**
 * «E POI?» (12/09/2026): i musei con la visita pronta a piedi da qui, per
 * la seconda visita della giornata — la più facile da vendere.
 */
export async function museiAPiediDaQui(v: MuseumVisit, language: Language, quanti = 3): Promise<MuseumLibraryItem[]> {
  if (v.venue.lat == null || v.venue.lon == null) return [];
  const elenco = await fetchMuseumLibrary({ lat: v.venue.lat, lon: v.venue.lon, language, radiusKm: 2.5, limit: 12 });
  return elenco
    .filter(m => m.venue_key !== v.venueKey && normalize(m.venue_name) !== normalize(v.venue.name))
    .filter(m => (m.distance_m ?? 99999) <= 2500)
    .sort((a, b) => (a.distance_m ?? 99999) - (b.distance_m ?? 99999))
    .slice(0, quanti);
}
export async function fetchDomani(v: MuseumVisit, language: Language): Promise<Domani | null> {
  return fetchOrariDi(v.venue.name, v.venue.id, language);
}

/** Gli stessi orari per un museo QUALSIASI: serve a «E poi?». */
export async function fetchOrariDi(venueName: string, poiId: string | null | undefined, language: Language): Promise<Domani | null> {
  try {
    const p = new URLSearchParams({ language, venueName });
    if (poiId) p.set('poiId', poiId);
    const res = await fetch(getApiUrl(`/api/museums/tomorrow?${p.toString()}`));
    if (!res.ok) return null;
    const d = await res.json();
    return d?.ok === true ? (d as Domani) : null;
  } catch {
    return null;
  }
}

/**
 * «CHIEDI ALLA GUIDA» (12/09/2026): una domanda sull'opera, risposta dal
 * materiale di quell'opera, un credito. 402 = crediti finiti.
 */
export async function askGuide(args: { artwork: string; venueName: string; question: string; language: Language }): Promise<{ ok: boolean; risposta?: string; reason?: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, reason: 'login' };
  try {
    const res = await fetch(getApiUrl('/api/museums/ask'), { method: 'POST', headers, body: JSON.stringify(args) });
    if (res.status === 402) return { ok: false, reason: 'credits' };
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const d = await res.json();
    return d?.ok === true ? { ok: true, risposta: String(d.risposta) } : { ok: false, reason: String(d?.reason || 'no_answer') };
  } catch {
    return { ok: false, reason: 'rete' };
  }
}

/**
 * INQUADRA IL CARTELLINO (12/09/2026): si legge la didascalia dell'opera,
 * tradotta nella lingua dell'utente. Non consuma il pass.
 */
export type Cartellino = {
  titolo: string;
  autore: string;
  anno: string;
  tecnica: string;
  testoOriginale: string;
  traduzione: string;
  lingua: string;
  confidenza: number;
};
export async function leggiCartellino(imageBase64: string, venueName: string, language: Language): Promise<{ ok: true; cartellino: Cartellino } | { ok: false; reason: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, reason: 'login' };
  try {
    const res = await fetch(getApiUrl('/api/museums/read-label'), { method: 'POST', headers, body: JSON.stringify({ imageBase64, venueName, language }) });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const d = await res.json();
    return d?.ok === true ? { ok: true, cartellino: d as Cartellino } : { ok: false, reason: String(d?.reason || 'nessun_cartellino') };
  } catch {
    return { ok: false, reason: 'rete' };
  }
}

/**
 * IL CONFRONTO (12/09/2026): due opere del percorso, una accanto all'altra.
 * Le coppie si scelgono qui — stesso autore, stesso soggetto, stessa
 * epoca — fra le opere con la foto; il testo lo scrive il server dal
 * materiale delle due (pass, come un'opera; scritto una volta, resta).
 */
export type Coppia = { a: number; b: number; motivo: 'autore' | 'soggetto' | 'epoca' };
const SOGGETTI = ['venere', 'venus', 'madonna', 'annunciazione', 'annunciation', 'adorazione', 'adoration', 'crocifissione', 'crucifixion', 'ritratto', 'portrait', 'battaglia', 'battle', 'san giovanni', 'saint john', 'giuditta', 'judith', 'bacco', 'bacchus', 'sacra famiglia', 'holy family', 'natività', 'nativity', 'deposizione', 'pietà', 'pieta', 'autoritratto', 'self-portrait', 'david', 'davide', 'medusa', 'apollo', 'diana', 'santa', 'saint'];
export function coppieDaConfrontare(v: MuseumVisit, attivi?: Set<number>, quante = 3): Coppia[] {
  const tappe = v.guide.tappe;
  const idx = tappe.map((_, k) => k).filter(k => (!attivi || attivi.has(k)) && !tappe[k].soloCollezione && (tappe[k].foto || tappe[k].fotoIcona));
  const annoDi = (s: any): number | null => { const m = String(s || '').match(/\b(1[0-9]{3}|20[0-2][0-9])\b/); return m ? Number(m[1]) : null; };
  const soggettoDi = (t: VenueTappa): string => {
    const n = normalize(`${t.nome} ${t.nomeFonte || ''} ${t.nomeOriginale || ''}`);
    return SOGGETTI.find(s => n.includes(normalize(s))) || '';
  };
  const usate = new Set<number>();
  const out: Coppia[] = [];
  const prova = (motivo: Coppia['motivo'], stessa: (a: VenueTappa, b: VenueTappa) => boolean) => {
    for (let i = 0; i < idx.length && out.length < quante; i++) {
      for (let j = i + 1; j < idx.length && out.length < quante; j++) {
        const a = idx[i], b = idx[j];
        if (usate.has(a) || usate.has(b)) continue;
        if (!stessa(tappe[a], tappe[b])) continue;
        out.push({ a, b, motivo });
        usate.add(a);
        usate.add(b);
      }
    }
  };
  // 1) Stesso autore (due Botticelli): la coppia più ricca di differenze.
  prova('autore', (a, b) => !!a.autore && !!b.autore && normalize(a.autore) === normalize(b.autore));
  // 2) Stesso soggetto (due Annunciazioni, due Veneri) di autori diversi.
  prova('soggetto', (a, b) => { const s = soggettoDi(a); return !!s && s === soggettoDi(b); });
  // 3) Stessa epoca (entro 40 anni) e stesso tipo, autori diversi.
  prova('epoca', (a, b) => { const ya = annoDi(a.anno), yb = annoDi(b.anno); return ya !== null && yb !== null && Math.abs(ya - yb) <= 40 && (a.tipo || '') === (b.tipo || '') && normalize(a.autore || '') !== normalize(b.autore || ''); });
  return out;
}
export async function fetchConfronto(args: { a: VenueTappa; b: VenueTappa; venueName: string; language: Language }): Promise<{ ok: true; testo: string; cached?: boolean } | { ok: false; reason: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, reason: 'login' };
  const opera = (t: VenueTappa) => ({ nome: t.nome, nomeFonte: t.nomeFonte || t.nome, autore: t.autore || '', anno: t.anno || '' });
  try {
    const res = await fetch(getApiUrl('/api/museums/compare'), { method: 'POST', headers, body: JSON.stringify({ a: opera(args.a), b: opera(args.b), venueName: args.venueName, language: args.language }) });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const d = await res.json();
    return d?.ok === true && d.testo ? { ok: true, testo: String(d.testo), cached: !!d.cached } : { ok: false, reason: String(d?.reason || 'no_source') };
  } catch {
    return { ok: false, reason: 'rete' };
  }
}

/** LE MOSTRE IN CORSO (12/09/2026): dal sito ufficiale, cache 3 giorni. */
export type Mostra = {
  titolo: string;
  dal: string;
  al: string;
  sale: string;
  biglietto: 'compresa' | 'separato' | '';
  opere: string[];
  riga: string;
  url: string;
};
export async function fetchMostre(v: MuseumVisit, language: Language): Promise<Mostra[]> {
  try {
    const p = new URLSearchParams({ language, venueName: v.venue.name });
    if (v.venue.id) p.set('poiId', v.venue.id);
    const res = await fetch(getApiUrl(`/api/museums/exhibitions?${p.toString()}`));
    if (!res.ok) return [];
    const d = await res.json();
    return d?.ok === true && Array.isArray(d.mostre) ? d.mostre : [];
  } catch {
    return [];
  }
}

/**
 * AUDIODESCRIZIONE (12/09/2026): l'opera raccontata a chi non la vede, dalla
 * foto vera. Serve il pass; una volta generata resta (cache server + archivio
 * qui sotto, così vale anche senza rete).
 */
export async function fetchAudioDescription(args: { artwork: string; venueName: string; photo: string; language: Language }): Promise<{ ok: true; testo: string; cached?: boolean } | { ok: false; reason: string }> {
  const headers = await authHeaders();
  if (!headers) return { ok: false, reason: 'login' };
  try {
    const res = await fetch(getApiUrl('/api/museums/audio-description'), { method: 'POST', headers, body: JSON.stringify(args) });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const d = await res.json();
    return d?.ok === true && d.testo ? { ok: true, testo: String(d.testo), cached: !!d.cached } : { ok: false, reason: String(d?.reason || 'no_description') };
  } catch {
    return { ok: false, reason: 'rete' };
  }
}
const AUDIODESCR_KEY = 'wip_museo_audiodescrizioni';
const chiaveDescr = (venueKey: string, language: Language, nome: string) => `${venueKey}|${String(language).toUpperCase()}|${normalize(nome)}`;
export function descrizioneDallArchivio(venueKey: string, language: Language, nome: string): string | null {
  try {
    const tutte = JSON.parse(localStorage.getItem(AUDIODESCR_KEY) || '{}');
    const t = tutte?.[chiaveDescr(venueKey, language, nome)];
    return typeof t === 'string' && t ? t : null;
  } catch { return null; }
}
export function conservaDescrizione(venueKey: string, language: Language, nome: string, testo: string): void {
  try {
    const tutte = JSON.parse(localStorage.getItem(AUDIODESCR_KEY) || '{}');
    tutte[chiaveDescr(venueKey, language, nome)] = testo;
    // Tetto: le 300 più recenti (sono testi da 200 parole, non foto).
    const chiavi = Object.keys(tutte);
    if (chiavi.length > 300) for (const k of chiavi.slice(0, chiavi.length - 300)) delete tutte[k];
    localStorage.setItem(AUDIODESCR_KEY, JSON.stringify(tutte));
  } catch { /* spazio finito: si perde solo la copia locale */ }
}
/** Preferenza «descrizione prima di ogni opera» (accessibilità). */
const AUTO_AD_KEY = 'wip_audiodescrizione';
export function getAudiodescrizioneAuto(): boolean {
  try { return localStorage.getItem(AUTO_AD_KEY) === '1'; } catch { return false; }
}
export function setAudiodescrizioneAuto(on: boolean): void {
  try { localStorage.setItem(AUTO_AD_KEY, on ? '1' : '0'); } catch { /* ok */ }
}

/** IL CUORE (11/09/2026): un tocco e l'opera entra fra le preferite. Vive
 *  nella guida, quindi finisce nell'archivio e nella stampa da solo. */
export function togglePreferita(index: number): MuseumVisit | null {
  const v = getVisit();
  if (!v?.guide?.tappe?.[index]) return null;
  const t = v.guide.tappe[index];
  v.guide.tappe[index] = { ...t, preferita: !t.preferita };
  v.updatedAt = Date.now();
  saveVisit(v);
  return v;
}

/**
 * IL BIGLIETTO D'INGRESSO (12/09/2026): la sera prima, accanto agli orari.
 * Non è un'esperienza a pagamento — è quello che serve a chiunque per
 * entrare — quindi si mostra anche a chi il pass non l'ha.
 */
export type BigliettoIngresso = {
  titolo: string;
  prezzo: string;
  url: string;
  fonte: string;
  /** Le fasce orarie di domani (solo Tiqets): «alle 8:15 ci sono posti». */
  disponibilita?: { data: string; fasce: { ora: string; posti: boolean }[] } | null;
};
export async function fetchBigliettoIngresso(v: MuseumVisit, language: Language): Promise<BigliettoIngresso | null> {
  try {
    const p = new URLSearchParams({ language, venueName: v.venue.name });
    if (v.venue.lat != null && v.venue.lon != null) { p.set('lat', String(v.venue.lat)); p.set('lon', String(v.venue.lon)); }
    const res = await fetch(getApiUrl(`/api/museums/entrance-ticket?${p.toString()}`));
    if (!res.ok) return null;
    const d = await res.json();
    return d?.ok === true && d?.ticket?.url ? (d.ticket as BigliettoIngresso) : null;
  } catch {
    return null;
  }
}

/** Segna che le prime opere sono state prescaricate: una volta per visita. */
export function segnaPrefetchFatto(): void {
  const v = getVisit();
  if (!v || v.prefetchFatto) return;
  v.prefetchFatto = true;
  saveVisit(v);
}

/**
 * LEGGI CON CALMA (11/09/2026): caratteri grandi, voce più lenta, testo
 * sempre visibile mentre parla. Chi visita i musei ha in media più di
 * cinquant'anni: qui non è accessibilità, è la funzione principale. È una
 * preferenza della persona, non della visita: si ricorda fra un museo e
 * l'altro.
 */
const CALMA_KEY = 'wip_leggi_con_calma';
export const LEGGI_CON_CALMA_EVENT = 'wip-leggi-con-calma';
export function getLeggiConCalma(): boolean {
  try { return localStorage.getItem(CALMA_KEY) === '1'; } catch { return false; }
}
export function setLeggiConCalma(on: boolean): void {
  try { localStorage.setItem(CALMA_KEY, on ? '1' : '0'); } catch { /* ok */ }
  try { window.dispatchEvent(new CustomEvent(LEGGI_CON_CALMA_EVENT, { detail: { on } })); } catch { /* ok */ }
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
export type EsitoAvvioVisita = { ok: boolean; reason?: string; visit?: MuseumVisit; priceCredits?: number; upgradeCredits?: number; hasBasePass?: boolean; sample?: { text: string; language: string } | null; opere?: number; minOpere?: number; prezzoScansione?: number };

export async function startVisitByName(name: string, coords: { lat: number | null; lon: number | null }, language: Language): Promise<EsitoAvvioVisita> {
  const resp = await fetchVenueGuide({ lat: coords.lat, lon: coords.lon, venueHint: name, venueHintSource: 'user', language });
  if (!resp) return { ok: false, reason: 'network' };
  if (resp.ok !== true) return { ok: false, reason: resp.reason, priceCredits: resp.priceCredits, upgradeCredits: resp.upgradeCredits, hasBasePass: resp.hasBasePass, sample: resp.sample || null, opere: resp.opere, minOpere: resp.minOpere, prezzoScansione: resp.prezzoScansione };
  return { ok: true, visit: startVisitFromGuide(resp) };
}

/**
 * Visita guidata di un museo scelto sulla mappa (o dalla libreria): non serve
 * essere sul posto. Regola del committente: qualsiasi museo o chiesa con sito
 * o voce Wikipedia può avere la sua guida, generata al volo se non è già in
 * libreria.
 */
export async function startVisitByPoi(poiId: string, language: Language, fallbackCoords?: { lat: number | null; lon: number | null }): Promise<EsitoAvvioVisita> {
  const resp = await fetchVenueGuide({ lat: fallbackCoords?.lat ?? null, lon: fallbackCoords?.lon ?? null, poiId, language });
  if (!resp) return { ok: false, reason: 'network' };
  if (resp.ok !== true) return { ok: false, reason: resp.reason, priceCredits: resp.priceCredits, upgradeCredits: resp.upgradeCredits, hasBasePass: resp.hasBasePass, sample: resp.sample || null, opere: resp.opere, minOpere: resp.minOpere, prezzoScansione: resp.prezzoScansione };
  return { ok: true, visit: startVisitFromGuide(resp) };
}

/**
 * IL MIO PERCORSO, NON IL VOSTRO (11/09/2026). Tre scelte secche — tutto,
 * i capolavori, mezz'ora — e il percorso si accorcia da solo. Non si tocca
 * la guida: si decide quali tappe sono ATTIVE, e il resto (prossima tappa,
 * lettore, «prima di uscire», stampa) segue. Chi cambia idea a metà museo
 * ritrova tutto: le opere non scelte non spariscono, si mettono da parte.
 *
 * Come si sceglie: col rango di fama di Wikidata quando c'è (un dato), e
 * con l'ordine del percorso quando non c'è. Mai meno di tre opere, mai le
 * «della collezione» (senza sala non hanno un posto dove andare).
 *  - capolavori: le 6 più famose;
 *  - breve: 8 opere ≈ 30 minuti (tre minuti l'una fra ascolto e spostamento).
 */
export function tappeAttive(v: MuseumVisit | null): Set<number> {
  const tappe = v?.guide?.tappe || [];
  const tutte = new Set(tappe.map((_, k) => k));
  const p = v?.personalizzazione || PERSONALIZZAZIONE_BASE;
  // LE SALE CHIUSE escono sempre, qualunque leva sia impostata: non c'è
  // niente da vedere dietro una porta chiusa. Se restassero meno di tre
  // opere, si tiene tutto e ci pensa la scheda a dirlo.
  const chiuse = new Set(tappe.map((t, k) => (t.chiusaOggi ? k : -1)).filter(k => k >= 0));
  const senzaChiuse = new Set([...tutte].filter(k => !chiuse.has(k)));
  const basePartenza = senzaChiuse.size >= 3 ? senzaChiuse : tutte;
  const nessunaLeva = p.tempo === 'tutto' && p.interessi === 'tutto' && !p.bambini && !p.soloNuove;
  if (nessunaLeva || tappe.length <= 3) return basePartenza;

  // 0) SECONDA VISITA (12/09/2026): «l'ultima volta hai visto queste dodici;
  //    oggi le otto che ti sei perso, più le tre che avevi messo fra le
  //    preferite». Le viste in passato escono, le preferite restano sempre.
  let candidati = tappe.map((t, k) => ({ k, t })).filter(x => !x.t.soloCollezione && basePartenza.has(x.k));
  if (p.soloNuove) {
    const nuove = candidati.filter(x => !x.t.vistaInPassato || x.t.preferita);
    if (nuove.length >= 3) candidati = nuove;
  }

  // 1) INTERESSI: si scartano le opere del tipo sbagliato. Le opere senza
  //    tipo restano: non sapere che cos'è non è una ragione per toglierla.
  const tipoVoluto = p.interessi === 'dipinti' ? 'dipinto' : p.interessi === 'sculture' ? 'scultura' : p.interessi === 'altro' ? 'altro' : null;
  if (tipoVoluto) {
    const filtrati = candidati.filter(x => !x.t.tipo || x.t.tipo === tipoVoluto);
    // Se il filtro lascerebbe meno di tre opere, non si applica: un percorso
    // da due tappe non è un percorso.
    if (filtrati.length >= 3) candidati = filtrati;
  }

  // 2) TEMPO e BAMBINI: quante opere tenere. Tre minuti l'una fra ascolto e
  //    spostamento; coi bambini sei opere e non di più — reggono venti
  //    minuti, e la settima è quella che rovina le prime sei.
  const quante = p.bambini ? 6 : p.tempo === '30' ? 8 : p.tempo === '60' ? 15 : Number.POSITIVE_INFINITY;
  const scelte = new Set<number>();
  if (candidati.length <= quante) {
    for (const x of candidati) scelte.add(x.k);
  } else {
    // Prima per fama (rango basso = più famosa), poi per posizione nel percorso.
    const ordinati = [...candidati].sort((a, b) => {
      const fa = a.t.famaRank ?? Number.POSITIVE_INFINITY;
      const fb = b.t.famaRank ?? Number.POSITIVE_INFINITY;
      return fa !== fb ? fa - fb : a.k - b.k;
    });
    // Le opere già viste restano sempre: un percorso su misura non cancella
    // quello che si è fatto.
    for (const x of candidati) if (x.t.seenCardId) scelte.add(x.k);
    for (const x of ordinati) { if (scelte.size >= Math.max(quante, 3)) break; scelte.add(x.k); }
  }
  return scelte;
}

export function impostaPersonalizzazione(p: Partial<Personalizzazione>): MuseumVisit | null {
  const v = getVisit();
  if (!v) return null;
  v.personalizzazione = { ...(v.personalizzazione || PERSONALIZZAZIONE_BASE), ...p };
  v.updatedAt = Date.now();
  saveVisit(v);
  return v;
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
  /** «bambini»: la stessa opera raccontata a un bambino di otto anni. */
  stile?: 'bambini' | '';
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
        ...(args.stile ? { stile: args.stile } : {}),
        language: args.language,
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ArtworkGuideResponse;
  } catch {
    return null;
  }
}
