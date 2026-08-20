// =====================================================================
// WIP · "📚 Libreria itinerari" (sheet a tutto schermo)
// Catalogo di itinerari GIÀ generati e verificati (rotte /api/library/*):
// ricerca per città/porto/tema, chips di tipo (crociera, scalo, cammini,
// cinema, fioriture, …), filtro durata (ore per sosta / giorni).
// Risultati: PRIMA gli itinerari in libreria (badge "✓ Verificato da
// 2 AI" + score, angolo ben visibile), POI i descrittori non ancora
// generati da src/lib/libraryDescriptors.ts (card tenue con "🪄 Genera
// ora"). Tap su una card generata → anteprima completa (stesse sezioni
// del viewer di PlanScreen: info viaggio, tappe con orari, budget) e
// "✨ Usa questo itinerario (gratis)" → il parent (PlanScreen) salva in
// user_itineraries col flusso di savePlanToSupabase e apre il viewer.
// NOTA: se libraryDescriptors.ts non è (ancora) disponibile la sheet
// NON si rompe: mostra solo ciò che è già in libreria.
// =====================================================================
import { X, Search, Loader2, ArrowLeft, Clock, MapPin, Sparkles, CheckCircle2, Wand2, BookOpen } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getApiUrl } from '../lib/api';
import { Language } from '../lib/i18n';
import TravelInfo from './itinerary/TravelInfo';
import BudgetTable from './itinerary/BudgetTable';
import LoadingQuiz from './LoadingQuiz';

// ── Tipi (locali: il contratto API è la fonte di verità) ───────────────

/** Riga di GET /api/library/search (itinerario già generato e salvato). */
export interface LibraryResult {
  slug: string;
  kind?: string;
  title?: string;
  city?: string;
  country?: string;
  theme?: string;
  angle?: string;
  hours?: number;
  days?: number;
  score?: number;
  verifiedBy?: number | string[] | null;
  createdAt?: string;
}

/** Descrittore non ancora generato (da searchDescriptors, forma libera). */
type LibraryDescriptor = Record<string, any>;

interface DetailState {
  slug: string;
  itinerary: any;
  meta: any;
  loading?: boolean;
  error?: string | null;
}

// ── Chips di tipo: allineate ai kind/theme di libraryDescriptors.ts ────
// kind ∈ port | airport | pilgrim | theme | zone; i temi hanno un id
// proprio (theme). I sinonimi nel match rendono il filtro client robusto
// anche se lato server il kind usa una variante (it/en).
const KIND_CHIPS: Array<{ id: string; label: string; kind?: string; theme?: string; match: string[] }> = [
  { id: '', label: 'Tutti', match: [] },
  { id: 'port', label: '🛳 Crociera', kind: 'port', match: ['port', 'porto', 'cruise', 'crociera'] },
  { id: 'airport', label: '✈️ Scalo', kind: 'airport', match: ['airport', 'aeroporto', 'layover', 'scalo'] },
  { id: 'pilgrim', label: '🥾 Cammini', kind: 'pilgrim', match: ['pilgrim', 'pilgrimage', 'cammino', 'cammini', 'pellegrinaggio'] },
  { id: 'cinema', label: '🎬 Cinema', kind: 'theme', theme: 'cinema', match: ['cinema'] },
  { id: 'libri', label: '📚 Libri', kind: 'theme', theme: 'libri', match: ['libri', 'libro', 'books', 'letteratura'] },
  { id: 'fioriture', label: '🌸 Fioriture', kind: 'theme', theme: 'fioriture', match: ['fioriture', 'fioritura', 'bloom'] },
  { id: 'fauna', label: '🦩 Fauna', kind: 'theme', theme: 'fauna', match: ['fauna', 'wildlife'] },
  { id: 'neve', label: '⛷ Neve', kind: 'theme', theme: 'neve', match: ['neve', 'snow', 'ski'] },
  { id: 'botteghe', label: '🏺 Botteghe', kind: 'theme', theme: 'botteghe', match: ['botteghe', 'crafts', 'artigianato'] },
  { id: 'vino', label: '🍷 Vino', kind: 'theme', theme: 'vino', match: ['vino', 'wine', 'cantine'] },
  { id: 'aperture-straordinarie', label: '🗝 Aperture', kind: 'theme', theme: 'aperture-straordinarie', match: ['aperture-straordinarie', 'aperture', 'openings'] },
  { id: 'memoria', label: '🕯 Memoria', kind: 'theme', theme: 'memoria', match: ['memoria', 'memory'] },
  { id: 'souvenir', label: '🛍 Souvenir', kind: 'theme', theme: 'souvenir', match: ['souvenir', 'souvenirs'] },
  // ── ONDATA 2: temi non-media nuovi ──────────────────────────────────
  { id: 'fabbriche-del-gusto', label: '🍴 Fabbriche del gusto', kind: 'theme', theme: 'fabbriche-del-gusto', match: ['fabbriche-del-gusto', 'fabbriche', 'gusto'] },
  { id: 'musei-impresa', label: '🏭 Musei d\'impresa', kind: 'theme', theme: 'musei-impresa', match: ['musei-impresa', 'impresa'] },
  { id: 'wellness', label: '🧖 Wellness', kind: 'theme', theme: 'wellness', match: ['wellness', 'terme', 'onsen', 'spa'] },
  { id: 'ciclovie', label: '🚲 Ciclovie', kind: 'theme', theme: 'ciclovie', match: ['ciclovie', 'ciclovia', 'bike', 'cicloturismo'] },
  { id: 'agriturismi', label: '🌾 Weekend rurale', kind: 'theme', theme: 'agriturismi', match: ['agriturismi', 'agriturismo', 'rurale'] },
  { id: 'scoperta-urbana', label: '🧭 Scoperta urbana', kind: 'theme', theme: 'scoperta-urbana', match: ['scoperta-urbana', 'street art', 'urbex'] },
  // ── "Luoghi di": nuovi media ─────────────────────────────────────────
  { id: 'musica', label: '🎵 Musica', kind: 'theme', theme: 'musica', match: ['musica', 'music'] },
  { id: 'arte', label: '🎨 Arte', kind: 'theme', theme: 'arte', match: ['arte', 'art'] },
  { id: 'storia', label: '⚔️ Storia', kind: 'theme', theme: 'storia', match: ['storia', 'history'] },
  { id: 'scienza', label: '🔬 Scienza', kind: 'theme', theme: 'scienza', match: ['scienza', 'science'] },
  { id: 'sport', label: '🏟 Sport', kind: 'theme', theme: 'sport', match: ['sport'] },
  { id: 'moda', label: '👗 Moda', kind: 'theme', theme: 'moda', match: ['moda', 'fashion'] },
  { id: 'zone', label: '📍 Zone', kind: 'zone', match: ['zone', 'zona', 'quartiere', 'district'] },
  // ── Enogastronomia: le tre famiglie del gusto ────────────────────────
  // Sono tre prodotti diversi e vanno filtrati separatamente: la STRADA ha
  // un tracciato che esiste già (Chiantigiana, Route des Grands Crus), la
  // ZONA è un territorio denso di produttori senza percorso ufficiale, la
  // FIERA vale solo nella settimana in cui si tiene.
  { id: 'strade-del-gusto', label: '🍇 Strade del gusto', kind: 'theme', theme: 'strade-del-gusto', match: ['strade-del-gusto', 'strada del vino', 'wine route'] },
  { id: 'zone-del-gusto', label: '🍽 Zone del gusto', kind: 'theme', theme: 'zone-del-gusto', match: ['zone-del-gusto', 'zona del gusto', 'enogastronomia'] },
  { id: 'fiere-del-gusto', label: '🎪 Sagre e fiere', kind: 'theme', theme: 'fiere-del-gusto', match: ['fiere-del-gusto', 'fiera', 'sagra', 'festival'] },
];

/** Medium "luoghi di" con ricerca on-demand (POST /api/library/<medium>):
 *  chip id → medium API, emoji e nome del soggetto cercato. Coerente col
 *  registro LIB_MEDIA lato server (server.ts, regione LIBRERIA). */
const ON_DEMAND_MEDIA: Array<{ chipId: string; medium: string; emoji: string; noun: string }> = [
  { chipId: 'cinema', medium: 'film', emoji: '🎬', noun: 'film' },
  { chipId: 'libri', medium: 'book', emoji: '📚', noun: 'libro' },
  { chipId: 'musica', medium: 'music', emoji: '🎵', noun: 'artista o brano' },
  { chipId: 'arte', medium: 'art', emoji: '🎨', noun: 'opera o artista' },
  { chipId: 'storia', medium: 'history', emoji: '⚔️', noun: 'evento storico' },
  { chipId: 'sport', medium: 'sport', emoji: '🏟', noun: 'luogo sportivo' },
];

const norm = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** true se kind/theme dell'item sono compatibili col chip scelto. */
function chipMatches(chip: { kind?: string; theme?: string; match: string[] } | undefined, item: { kind?: any; theme?: any }): boolean {
  if (!chip || (!chip.kind && !chip.theme)) return true;
  if (chip.theme) {
    const t = norm(item?.theme);
    // Tema esplicito: deve combaciare; senza tema sul dato si accetta il
    // match sul kind/testo (dato parziale ≠ dato sbagliato).
    if (t) return t === norm(chip.theme) || chip.match.includes(t);
  }
  const k = norm(item?.kind);
  if (!k) return true; // niente kind sul dato: non lo nascondiamo
  if (chip.theme) return k === 'theme' || chip.match.some(m => k.includes(m));
  return chip.match.some(m => k === m || k.includes(m));
}

type KindChip = typeof KIND_CHIPS[number];

/** true se l'item combacia con ALMENO uno dei chip passati (OR). Lista
 *  vuota = nessun filtro attivo → combacia sempre (stesso comportamento
 *  di chipMatches(undefined, …)). Usata quando è selezionata un'intera
 *  macro-categoria (CHIP_GROUPS) invece di un singolo chip. */
function anyChipMatches(chips: KindChip[], item: { kind?: any; theme?: any }): boolean {
  if (!chips || chips.length === 0) return true;
  return chips.some(c => chipMatches(c, item));
}

// ── Livello 1: macro-categorie che raggruppano i chip di KIND_CHIPS ────
// Nessuna perdita di filtro: ogni chip esistente resta raggiungibile,
// solo organizzato in 4 gruppi + "Tutti". `allLabel` è il chip "torna a
// tutto il gruppo" mostrato per primo in riga 2.
const CHIP_GROUPS: Array<{ id: string; label: string; emoji: string; allLabel: string; chipIds: string[] }> = [
  {
    id: 'trasporti', emoji: '🧭', label: 'Viaggio & trasporti', allLabel: 'Tutti i viaggi & trasporti',
    chipIds: ['port', 'airport', 'pilgrim', 'ciclovie'],
  },
  {
    id: 'citta', emoji: '📍', label: 'Città', allLabel: 'Tutte le città',
    chipIds: ['zone'],
  },
  {
    // L'enogastronomia era sparsa fra "esperienze a tema" (vino, fabbriche
    // del gusto, agriturismi) e non aveva casa: qui diventa una macro-
    // categoria sua, che è anche il modo in cui la cerca chi parte per
    // mangiare bene.
    id: 'gusto', emoji: '🍷', label: 'Mangiare e bere', allLabel: 'Tutto il gusto',
    chipIds: ['strade-del-gusto', 'zone-del-gusto', 'fiere-del-gusto', 'vino', 'fabbriche-del-gusto', 'agriturismi'],
  },
  {
    id: 'cultura', emoji: '🎭', label: 'Ispirazioni culturali', allLabel: 'Tutte le ispirazioni culturali',
    chipIds: ['cinema', 'libri', 'musica', 'arte', 'storia', 'scienza', 'sport', 'moda'],
  },
  {
    id: 'esperienze', emoji: '🌿', label: 'Esperienze a tema', allLabel: 'Tutte le esperienze a tema',
    chipIds: [
      // vino, fabbriche-del-gusto e agriturismi sono passati al gruppo
      // "Mangiare e bere": un chip sta in un gruppo solo, altrimenti la
      // riga 2 lo mostra due volte.
      'fioriture', 'fauna', 'neve', 'botteghe', 'wellness',
      'scoperta-urbana', 'musei-impresa', 'aperture-straordinarie',
      'memoria', 'souvenir',
    ],
  },
];

/** Chip di KIND_CHIPS appartenenti al gruppo (nell'ordine di CHIP_GROUPS). */
function groupChipsOf(groupId: string): KindChip[] {
  const g = CHIP_GROUPS.find(x => x.id === groupId);
  if (!g) return [];
  return g.chipIds
    .map(id => KIND_CHIPS.find(c => c.id === id))
    .filter((c): c is KindChip => !!c);
}

/** Macro-categoria a cui appartiene un chip id (per pre-selezionare la
 *  riga 1 quando la sheet si apre con un initialKind già impostato). */
function groupForChipId(chipId: string): string {
  if (!chipId) return '';
  const g = CHIP_GROUPS.find(x => x.chipIds.includes(chipId));
  return g?.id || '';
}

/** Etichetta leggibile per l'id di un angolo/tema (es. 'arte-storia' →
 *  "Arte storia"); se il modulo descrittori è carico usa le label vere. */
function prettyAngle(id: any, labelMap: Record<string, string>): string {
  const raw = String(id ?? '').trim();
  if (!raw) return '';
  if (labelMap[raw]) return labelMap[raw];
  const s = raw.replace(/[-_]+/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Distanza in km fra due coordinate (emisenoverso). */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function formatKm(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return '';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/**
 * Porta un itinerario della libreria ESATTAMENTE nella forma che il viewer
 * di PlanScreen e le feature a valle (Guida Premium, podcast, PDF,
 * calendario, racconto) si aspettano: `titolo`, `destinazione`, `giorni`
 * come ARRAY di { giorno, tappe[] } con id_tappa/ora/titolo_tappa/attivita/
 * tipo/coordinate{lat,lng}. Restituisce null se non ci sono tappe.
 */
export function normalizeLibraryItinerary(raw: any, meta?: any): any | null {
  if (!raw || typeof raw !== 'object') return null;
  const giorniRaw = raw.giorni || raw.days || [];
  const lista = Array.isArray(giorniRaw) ? giorniRaw : Object.values(giorniRaw || {});
  const giorni = lista
    .map((g: any, gi: number) => ({
      ...g,
      giorno: Number(g?.giorno) || gi + 1,
      tappe: (Array.isArray(g?.tappe) ? g.tappe : []).map((t: any, ti: number) => ({
        ...t,
        id_tappa: t?.id_tappa || `lib_${gi + 1}_${ti + 1}_${Math.random().toString(36).slice(2, 8)}`,
        ora: t?.ora || '',
        titolo_tappa: t?.titolo_tappa || t?.titolo || t?.nome || 'Tappa',
        attivita: t?.attivita || t?.descrizione || '',
        consiglio_guida: t?.consiglio_guida || '',
        tipo: t?.tipo || 'visita',
        coordinate: {
          lat: Number(t?.coordinate?.lat) || 0,
          lng: Number(t?.coordinate?.lng ?? t?.coordinate?.lon) || 0,
        },
      })),
    }))
    .filter((g: any) => g.tappe.length > 0);
  if (giorni.length === 0) return null;
  return {
    ...raw,
    titolo: raw.titolo || raw.title || meta?.title || 'Itinerario dalla libreria',
    // `destinazione` è letto da savePlanToSupabase (città dei POI condivisi),
    // dalla Guida Premium e dal podcast: senza, quelle feature degradano.
    destinazione: raw.destinazione || raw.destination || meta?.city || '',
    giorni,
  };
}

/**
 * Carica il modulo dei descrittori (di un altro stream di lavoro) SENZA
 * rompere la sheet se il modulo manca o ha errori: in quel caso si mostra
 * solo ciò che è già in libreria.
 */
let libModCache: any | null | undefined;
async function getLibraryModule(): Promise<any | null> {
  if (libModCache !== undefined) return libModCache;
  try {
    // @ts-ignore — modulo esterno a questo stream: se assente o rotto si
    // degrada in silenzio (catch sotto).
    libModCache = await import('../lib/libraryDescriptors');
  } catch {
    libModCache = null;
  }
  return libModCache;
}

/** id → label leggibile per angoli (ANGLES) e temi (THEMES). */
function buildAngleLabels(mod: any): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    for (const arr of Object.values(mod?.ANGLES || {})) {
      if (Array.isArray(arr)) for (const a of arr) if (a?.id && a?.label) map[a.id] = a.label;
    }
    if (Array.isArray(mod?.THEMES)) {
      for (const t of mod.THEMES) if (t?.id && t?.label) map[t.id] = `${t.emoji ? `${t.emoji} ` : ''}${t.label}`;
    }
    // ONDATA 2 "luoghi di" (musica/arte/storia/scienza/sport/moda): non
    // sono in THEMES, vivono nel loro registro MEDIA_SEEDS dedicato.
    if (Array.isArray(mod?.MEDIA_SEEDS)) {
      for (const m of mod.MEDIA_SEEDS) if (m?.theme && m?.label) map[m.theme] = `${m.emoji ? `${m.emoji} ` : ''}${m.label}`;
    }
    if (!map.ciclovie) map.ciclovie = '🚲 Ciclovie';
  } catch { /* best effort */ }
  return map;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Componente ─────────────────────────────────────────────────────────
export default function ItineraryLibrarySheet({
  language,
  userId,
  initialQuery = '',
  initialKind = '',
  initialGroup = '',
  initialCity = '',
  onClose,
  onUse,
}: {
  language: Language;
  /** Per il quiz durante l'attesa di "Genera ora" (crediti/XP di gamification). */
  userId?: string;
  /** Testo di ricerca pre-compilato (es. città del porto). */
  initialQuery?: string;
  /** Chip di tipo pre-selezionato (es. 'cruise' dalla sheet Sosta breve). */
  initialKind?: string;
  /** Macro-categoria pre-selezionata (id di CHIP_GROUPS, es. 'cultura') SENZA
   *  un chip preciso — usata dalla card "Ispirazioni & temi" di PlanScreen.
   *  Se initialKind è già impostato, la sua macro-categoria vince comunque. */
  initialGroup?: string;
  /** Filtro città passato all'API (chip rimovibile). */
  initialCity?: string;
  onClose: () => void;
  /**
   * "✨ Usa questo itinerario (gratis)": il parent salva in user_itineraries
   * con lo stesso flusso di savePlanToSupabase e apre il viewer.
   */
  onUse: (itinerary: any, meta: any) => Promise<void> | void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState(initialKind);
  // Macro-categoria selezionata in riga 1 (UI a due livelli). Se la sheet
  // si apre con un chip preciso già impostato, la macro-categoria giusta
  // risulta già attiva e la riga 2 già visibile su quel chip.
  const [group, setGroup] = useState<string>(() => groupForChipId(initialKind) || initialGroup);
  const [cityFilter, setCityFilter] = useState(initialCity);
  const [maxHours, setMaxHours] = useState('');   // '' = qualsiasi
  const [daysFilter, setDaysFilter] = useState(''); // '' = qualsiasi
  const [results, setResults] = useState<LibraryResult[]>([]);
  const [descriptors, setDescriptors] = useState<LibraryDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [using, setUsing] = useState(false);
  // Generazione on-demand di un descrittore: slug → messaggio di stato
  const [genState, setGenState] = useState<Record<string, string>>({});
  const [genError, setGenError] = useState<string | null>(null);
  // Destinazione dell'itinerario in generazione (per il quiz durante
  // l'attesa) e dismiss: si resetta a ogni nuova attesa così il quiz
  // torna a comparire anche se l'utente l'aveva chiuso la volta prima.
  const [genDestination, setGenDestination] = useState<string | null>(null);
  const [quizDismissed, setQuizDismissed] = useState(false);
  // Label leggibili per gli id di angolo/tema (dal modulo descrittori)
  const [angleLabels, setAngleLabels] = useState<Record<string, string>>({});
  const searchSeq = useRef(0);

  useEffect(() => {
    let vivo = true;
    getLibraryModule().then(mod => { if (vivo && mod) setAngleLabels(buildAngleLabels(mod)); });
    return () => { vivo = false; };
  }, []);

  // Tap su una pillola di riga 1: seleziona (o azzera, per "Tutti") la
  // macro-categoria e riparte da "Tutti i <categoria>" (nessun chip preciso
  // ancora scelto) — la riga 2 compare per affinare dentro il gruppo.
  const selectGroup = (gId: string) => {
    setGroup(gId);
    setKind('');
  };

  const runSearch = useCallback(async () => {
    const seq = ++searchSeq.current;
    setLoading(true);
    setSearchError(null);
    const q = query.trim();
    // Chip attivo/i: un chip preciso (riga 2) filtra da solo; con SOLO la
    // macro-categoria selezionata (riga 1, senza chip preciso) il filtro è
    // l'OR di tutti i chip del gruppo — il server riceve kind/theme solo
    // nel primo caso, nel secondo la query resta larga e il filtro fine
    // avviene lato client con anyChipMatches.
    const chip = kind ? KIND_CHIPS.find(c => c.id === kind) : undefined;
    const activeChips = chip ? [chip] : (group ? groupChipsOf(group) : []);

    // 1. Itinerari già in libreria (server)
    let generated: LibraryResult[] = [];
    let serverOk = true;
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (chip?.kind) params.set('kind', chip.kind);
      if (chip?.theme) params.set('theme', chip.theme);
      if (cityFilter.trim()) params.set('city', cityFilter.trim());
      if (maxHours) params.set('maxHours', maxHours);
      if (daysFilter) params.set('days', daysFilter);
      const res = await fetch(getApiUrl(`/api/library/search?${params.toString()}`), {
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      // Il contratto server è { items, total }; si accetta anche l'eventuale
      // forma { results } per compatibilità.
      const rows = Array.isArray(data?.items) ? data.items : data?.results;
      generated = Array.isArray(rows) ? rows.filter((r: any) => r?.slug) : [];
    } catch {
      serverOk = false;
    }

    // Filtro client difensivo (kind/theme + durata): protegge la UI anche
    // se il server interpreta i parametri in modo diverso.
    generated = generated.filter(r => {
      if (!anyChipMatches(activeChips, r)) return false;
      if (maxHours && Number(r.hours) > 0 && Number(r.hours) > Number(maxHours)) return false;
      if (daysFilter && Number(r.days) > 0 && Number(r.days) !== Number(daysFilter)) return false;
      return true;
    });
    generated.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

    // 2. Descrittori non ancora generati (modulo locale, best-effort)
    let descs: LibraryDescriptor[] = [];
    try {
      const mod = await getLibraryModule();
      if (typeof mod?.searchDescriptors === 'function') {
        const out = await Promise.resolve(mod.searchDescriptors(q, {
          kind: chip?.kind as any,
          theme: chip?.theme,
          city: cityFilter.trim() || undefined,
          maxHours: maxHours ? Number(maxHours) : undefined,
          days: daysFilter ? Number(daysFilter) : undefined,
        }));
        if (Array.isArray(out)) descs = out;
      }
    } catch { /* il catalogo locale non deve mai rompere la sheet */ }
    // Filtro gruppo anche sui descrittori: con solo la macro-categoria
    // selezionata, searchDescriptors non ha ricevuto kind/theme (vedi sopra).
    descs = descs.filter(d => anyChipMatches(activeChips, d));

    // Dedup: i descrittori già presenti in libreria non vanno riproposti
    const inLibrary = new Set(generated.map(r => norm(r.slug)));
    descs = descs.filter(d => {
      const slug = norm(d?.slug || d?.id);
      if (slug && inLibrary.has(slug)) return false;
      return true;
    }).slice(0, 60);

    if (seq !== searchSeq.current) return; // risposta stantia
    setResults(generated.slice(0, 100));
    setDescriptors(descs);
    if (!serverOk) {
      setSearchError(generated.length || descs.length
        ? null
        : 'La libreria non risponde in questo momento: riprova tra poco.');
    }
    setLoading(false);
  }, [query, kind, group, cityFilter, maxHours, daysFilter]);

  // Ricerca con debounce a ogni cambio di query/filtri
  useEffect(() => {
    const t = setTimeout(runSearch, 350);
    return () => clearTimeout(t);
  }, [runSearch]);

  // ── Dettaglio di un item già in libreria ──────────────────────────────
  const openItem = async (r: LibraryResult) => {
    setDetail({ slug: r.slug, itinerary: null, meta: r, loading: true, error: null });
    try {
      // review=1: l'utente sta aprendo DAVVERO questo itinerario — scatta
      // (una sola volta, poi resta marcato) il controllo finale DeepSeek.
      // Timeout più alto solo per assorbire quella prima chiamata: le
      // aperture successive dello stesso item sono già marcate e istantanee.
      const res = await fetch(getApiUrl(`/api/library/item?slug=${encodeURIComponent(r.slug)}&review=1`), {
        signal: AbortSignal.timeout(40000),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.itinerary) throw new Error(data?.error || `HTTP ${res.status}`);
      const itin = normalizeLibraryItinerary(data.itinerary, { ...r, ...(data.meta || {}) });
      if (!itin) throw new Error('itinerario vuoto');
      setDetail({ slug: r.slug, itinerary: itin, meta: { ...r, ...(data.meta || {}) }, loading: false, error: null });
    } catch (e: any) {
      setDetail({
        slug: r.slug, itinerary: null, meta: r, loading: false,
        error: 'Impossibile aprire questo itinerario ora: riprova tra poco.',
      });
    }
  };

  // ── "🪄 Genera ora": POST /api/library/request con retry sul 202 ──────
  const requestDescriptor = async (d: LibraryDescriptor) => {
    const key = String(d?.slug || d?.id || d?.title || JSON.stringify(d).slice(0, 40));
    if (genState[key]) return;
    setGenError(null);
    setGenDestination(d?.city || d?.title || null);
    setQuizDismissed(false);
    setGenState(prev => ({ ...prev, [key]: 'Genero l’itinerario…' }));
    try {
      // Max 3 tentativi: il 202 significa "in coda", si ritenta dopo ~20s.
      for (let attempt = 1; attempt <= 3; attempt++) {
        let res: Response;
        try {
          res = await fetch(getApiUrl('/api/library/request'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // live:true → l'utente è qui in attesa: il server usa DeepSeek
            // (più affidabile di Agnes) invece del motore gratuito di semina.
            body: JSON.stringify({ descriptor: d, live: true }),
            // Il server lavora fino a 270s (LIB_SYNC_BUDGET_MS) prima di
            // rispondere 202. Con l'attesa a 120s si mollava a metà strada e
            // si mostrava un errore di rete mentre la generazione stava
            // andando a buon fine: l'itinerario compariva in libreria pochi
            // secondi dopo, ma l'utente aveva già letto "riprova".
            signal: AbortSignal.timeout(150000),
          });
        } catch (netErr: any) {
          // Scaduta l'attesa NON vuol dire fallita: il server sta ancora
          // generando. Si ritenta come per il 202, e al giro dopo l'item
          // arriva dalla cache in un istante.
          const scaduta = netErr?.name === 'TimeoutError' || netErr?.name === 'AbortError';
          if (!scaduta) throw new Error('Rete assente: controlla la connessione e riprova.');
          if (attempt === 3) {
            throw new Error('Ci sto ancora lavorando: riapri la libreria tra un minuto, lo troverai pronto.');
          }
          setGenState(prev => ({ ...prev, [key]: 'Ci vuole ancora un momento, resto in attesa…' }));
          await sleep(20000);
          continue;
        }
        if (res.status === 202) {
          if (attempt === 3) {
            throw new Error('La generazione è ancora in corso: riapri la libreria tra un minuto, lo troverai pronto.');
          }
          setGenState(prev => ({ ...prev, [key]: 'Sto preparando l’itinerario, ~1 minuto…' }));
          await sleep(20000);
          continue;
        }
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.itinerary) {
          throw new Error(data?.error || 'Generazione non riuscita: riprova tra poco.');
        }
        const meta = { ...d, ...(data.meta || {}) };
        const itin = normalizeLibraryItinerary(data.itinerary, meta);
        if (!itin) throw new Error('L’itinerario generato è vuoto: riprova.');
        setDetail({ slug: String(meta.slug || key), itinerary: itin, meta, loading: false, error: null });
        runSearch(); // ora è in libreria: la lista si aggiorna
        return;
      }
    } catch (e: any) {
      setGenError(e?.message || 'Generazione non riuscita: riprova tra poco.');
    } finally {
      setGenState(prev => {
        const next = { ...prev };
        delete next[key];
        if (Object.keys(next).length === 0) setGenDestination(null);
        return next;
      });
    }
  };

  // ── "🎬 Cerca come film" / "📚 Cerca come libro" / "🎵 Cerca come
  //    musica" / … : POST /api/library/<medium> (luoghi delle opere
  //    on-demand per QUALSIASI titolo/nome), stesso spinner/retry di
  //    "Genera ora". Generalizzato a tutti i medium di ON_DEMAND_MEDIA.
  const [filmBusy, setFilmBusy] = useState<string | null>(null);
  const [filmError, setFilmError] = useState<string | null>(null);

  const searchAsWork = async (medium: string) => {
    const t = query.trim();
    const info = ON_DEMAND_MEDIA.find(m => m.medium === medium);
    const noun = info?.noun || medium;
    if (t.length < 2 || filmBusy) return;
    setFilmError(null);
    setGenDestination(t);
    setQuizDismissed(false);
    setFilmBusy(`Cerco "${noun}" e i suoi luoghi…`);
    try {
      // Max 3 tentativi: il 202 significa "generazione in corso".
      for (let attempt = 1; attempt <= 3; attempt++) {
        let res: Response;
        try {
          res = await fetch(getApiUrl(`/api/library/${medium}`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: t, lang: language }),
            signal: AbortSignal.timeout(120000),
          });
        } catch {
          throw new Error('Rete assente o server occupato: riprova tra poco.');
        }
        if (res.status === 202) {
          if (attempt === 3) {
            throw new Error('L’itinerario è ancora in lavorazione: riprova tra un minuto, lo troverai pronto.');
          }
          setFilmBusy(`Sto costruendo l’itinerario sui luoghi veri, ~1 minuto…`);
          await sleep(20000);
          continue;
        }
        const data = await res.json().catch(() => null);
        if (res.status === 404) {
          // 404 onesto del server: niente location documentate o troppo sparse.
          throw new Error(`${info?.emoji || ''} Per “${t}” i luoghi non sono documentati o sono troppo sparsi per farne un itinerario. Prova con un altro nome.`);
        }
        if (!res.ok || !data?.itinerary) {
          throw new Error(data?.error || 'Generazione non riuscita: riprova tra poco.');
        }
        const meta = data.meta || {};
        const itin = normalizeLibraryItinerary(data.itinerary, meta);
        if (!itin) throw new Error('L’itinerario generato è vuoto: riprova.');
        setDetail({ slug: String(data.slug || meta.slug || t), itinerary: itin, meta, loading: false, error: null });
        runSearch(); // ora è in libreria: la lista si aggiorna
        return;
      }
    } catch (e: any) {
      setFilmError(e?.message || 'Ricerca non riuscita: riprova.');
    } finally {
      setFilmBusy(null);
      if (Object.keys(genState).length === 0) setGenDestination(null);
    }
  };

  const handleUse = async () => {
    if (!detail?.itinerary || using) return;
    setUsing(true);
    try {
      await onUse(detail.itinerary, detail.meta);
    } finally {
      setUsing(false);
    }
  };

  // Riga meta ben visibile: "Napoli · 8h · Gastronomica"
  const metaLine = (r: { city?: string; country?: string; hours?: number; days?: number; angle?: string; theme?: string }) => {
    const parts: string[] = [];
    if (r.city) parts.push(r.city);
    else if (r.country) parts.push(r.country);
    if (Number(r.hours) > 0) parts.push(`${r.hours}h`);
    else if (Number(r.days) > 0) parts.push(`${r.days} ${Number(r.days) === 1 ? 'giorno' : 'giorni'}`);
    return parts.join(' · ');
  };

  const angleOf = (r: { angle?: string; theme?: string }) => prettyAngle(r.angle || r.theme, angleLabels);

  const verifiedBadge = (r: LibraryResult) => {
    const n = Array.isArray(r.verifiedBy) ? r.verifiedBy.length : Number(r.verifiedBy) || 0;
    if (n < 2) return null;
    return (
      <span className="shrink-0 flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-2.5 h-2.5" /> Verificato da {n} AI
      </span>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[10003] bg-white flex flex-col">
      {/* Quiz durante l'attesa di "Genera ora" / "Cerca come film/libro/…":
          entrambe le attese sono ~1 minuto, prima restava solo un piccolo
          spinner inline nella card. */}
      {genDestination && !quizDismissed && (
        <LoadingQuiz
          destination={genDestination}
          userId={userId || ''}
          language={language}
          onDismiss={() => setQuizDismissed(true)}
        />
      )}
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {detail && (
            <button
              onClick={() => setDetail(null)}
              className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition shrink-0"
              aria-label="Torna ai risultati"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <h2 className="font-black text-primary text-lg truncate">📚 Libreria itinerari</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition shrink-0" aria-label="Chiudi">
          <X className="w-4 h-4" />
        </button>
      </div>

      {detail ? (
        /* ── DETTAGLIO ITEM ─────────────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto px-4 pb-28">
          {detail.loading && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs font-bold">Apro l’itinerario…</p>
            </div>
          )}
          {!detail.loading && detail.error && (
            <p className="text-center text-xs font-bold text-red-400 py-12">{detail.error}</p>
          )}
          {!detail.loading && detail.itinerary && (
            <div className="max-w-2xl mx-auto pt-5 space-y-6">
              {/* Titolo + meta */}
              <div>
                <h3 className="text-xl font-black text-primary leading-tight">{detail.itinerary.titolo}</h3>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {metaLine(detail.meta || {}) && (
                    <span className="text-[10px] font-black bg-primary/5 text-primary px-2 py-0.5 rounded-full">
                      {metaLine(detail.meta || {})}
                    </span>
                  )}
                  {angleOf(detail.meta || {}) && (
                    <span className="text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                      {angleOf(detail.meta || {})}
                    </span>
                  )}
                  {verifiedBadge(detail.meta || {})}
                  {Number(detail.meta?.score) > 0 && (
                    <span className="text-[10px] font-black bg-primary/5 text-primary px-2 py-0.5 rounded-full">
                      ★ {Number(detail.meta.score).toFixed(1)}
                    </span>
                  )}
                </div>
              </div>

              {/* Info viaggio: STESSO componente (nomi/ordine) del viewer */}
              {detail.itinerary.info_viaggio && (
                <TravelInfo info={detail.itinerary.info_viaggio} language={language} />
              )}

              {/* Giorni e tappe con orari + distanze (niente Leaflet: basta
                  l'elenco con le distanze fra tappe consecutive) */}
              <div className="space-y-8">
                {detail.itinerary.giorni.map((giorno: any) => (
                  <div key={giorno.giorno} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                        {giorno.giorno}
                      </div>
                      <h4 className="font-black text-primary uppercase tracking-widest text-xs">Giorno {giorno.giorno}</h4>
                      <div className="flex-1 h-px bg-primary/10" />
                    </div>
                    <div className="space-y-2 pl-3 border-l border-dashed border-primary/20">
                      {giorno.tappe.map((t: any, ti: number) => {
                        const prev = ti > 0 ? giorno.tappe[ti - 1] : null;
                        const dist = prev && prev.coordinate?.lat && t.coordinate?.lat
                          ? formatKm(haversineKm(prev.coordinate.lat, prev.coordinate.lng, t.coordinate.lat, t.coordinate.lng))
                          : '';
                        return (
                          <div key={t.id_tappa} className="bg-white border border-outline-variant/20 rounded-2xl p-3">
                            {dist && (
                              <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                <MapPin className="w-2.5 h-2.5" /> {dist} dalla tappa precedente
                              </div>
                            )}
                            <div className="flex items-start gap-2">
                              {t.ora && (
                                <span className="shrink-0 text-[10px] font-black bg-primary/5 text-primary px-2 py-0.5 rounded-full mt-0.5">
                                  {t.ora}
                                </span>
                              )}
                              <div className="min-w-0">
                                <div className="text-xs font-black text-primary leading-tight">{t.titolo_tappa}</div>
                                {t.attivita && (
                                  <p className="text-[11px] text-gray-600 leading-relaxed mt-1 line-clamp-4">{t.attivita}</p>
                                )}
                                {t.consiglio_guida && (
                                  <p className="text-[10px] font-bold text-amber-700 mt-1.5">💡 {t.consiglio_guida}</p>
                                )}
                                {t.tempo_necessario && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-black text-gray-400 mt-1.5">
                                    <Clock className="w-2.5 h-2.5" /> {t.tempo_necessario}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Mini tabella budget: stesso componente del viewer */}
                    <BudgetTable giorno={giorno} language={language} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── RICERCA + RISULTATI ────────────────────────────────────────── */
        <>
          {/* Barra di ricerca */}
          <div className="px-4 pt-3 shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Cerca città, porto, tema…"
                className="w-full pl-9 pr-4 py-3 rounded-2xl bg-gray-50 border border-outline-variant/30 focus:border-primary outline-none text-sm font-medium"
              />
            </div>
            <p className="text-[10px] font-medium text-gray-400 mt-1 pl-1">
              Centinaia di itinerari pronti, già controllati da due AI indipendenti. Usarli è gratis.
            </p>
          </div>

          {/* Livello 1: "Tutti" + 4 macro-categorie (pillole grandi). Sceglierne
              una filtra per TUTTI i chip del gruppo insieme e fa apparire la
              riga 2; "Tutti" nasconde la riga 2 e toglie ogni filtro. */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-1 shrink-0 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => selectGroup('')}
              className={`shrink-0 px-4 py-2.5 rounded-2xl text-xs font-black transition-all border ${
                group === '' ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-600 border-outline-variant/30 hover:border-primary/30'
              }`}
            >
              Tutti
            </button>
            {CHIP_GROUPS.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => selectGroup(g.id)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-black transition-all border ${
                  group === g.id ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-gray-600 border-outline-variant/30 hover:border-primary/30'
                }`}
              >
                <span className="text-sm leading-none">{g.emoji}</span> {g.label}
              </button>
            ))}
          </div>

          {/* Livello 2: chip specifici del gruppo selezionato (compare solo
              se una macro-categoria ≠ "Tutti" è attiva, con transizione). La
              prima voce "Tutti i <categoria>" riporta all'intero gruppo. */}
          <AnimatePresence initial={false}>
            {group !== '' && (
              <motion.div
                key={group}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="shrink-0 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 pt-2 pb-1 overflow-x-auto no-scrollbar">
                  {(() => {
                    const gDef = CHIP_GROUPS.find(x => x.id === group);
                    if (!gDef) return null;
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => setKind('')}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
                            kind === '' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-outline-variant/30 hover:border-primary/30'
                          }`}
                        >
                          {gDef.allLabel}
                        </button>
                        {groupChipsOf(group).map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setKind(c.id)}
                            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black transition-all border ${
                              kind === c.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-outline-variant/30 hover:border-primary/30'
                            }`}
                          >
                            {c.label}
                          </button>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filtro durata + chip città */}
          <div className="flex items-center gap-2 px-4 py-2 shrink-0 overflow-x-auto no-scrollbar">
            <select
              value={maxHours}
              onChange={e => setMaxHours(e.target.value)}
              className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black bg-white text-gray-500 border border-outline-variant/30 outline-none"
              aria-label="Ore per sosta"
            >
              <option value="">⏱ Ore sosta: tutte</option>
              {[4, 6, 8, 10, 12].map(h => <option key={h} value={h}>fino a {h}h</option>)}
            </select>
            <select
              value={daysFilter}
              onChange={e => setDaysFilter(e.target.value)}
              className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black bg-white text-gray-500 border border-outline-variant/30 outline-none"
              aria-label="Giorni"
            >
              <option value="">📅 Giorni: tutti</option>
              {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{d} {d === 1 ? 'giorno' : 'giorni'}</option>)}
            </select>
            {cityFilter.trim() && (
              <button
                type="button"
                onClick={() => setCityFilter('')}
                className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-black bg-primary/10 text-primary border border-primary/20"
                title="Rimuovi il filtro città"
              >
                📍 {cityFilter.trim()} <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Risultati */}
          <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-3">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs font-bold">Sfoglio la libreria…</span>
              </div>
            )}

            {!loading && searchError && results.length === 0 && descriptors.length === 0 && (
              <p className="text-center text-xs font-bold text-red-400 py-10">{searchError}</p>
            )}

            {/* PRIMA: itinerari già in libreria */}
            {!loading && results.map(r => (
              <button
                key={r.slug}
                type="button"
                onClick={() => openItem(r)}
                className="w-full text-left bg-white border border-outline-variant/20 rounded-2xl p-3 shadow-sm hover:border-primary/40 hover:shadow-md transition-all active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-primary leading-tight">{r.title || r.slug}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {metaLine(r) && (
                        <span className="text-[10px] font-black bg-primary/5 text-primary px-2 py-0.5 rounded-full">
                          {metaLine(r)}
                        </span>
                      )}
                      {angleOf(r) && (
                        <span className="text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                          {angleOf(r)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {verifiedBadge(r)}
                    {Number(r.score) > 0 && (
                      <span className="text-[9px] font-black text-gray-400">★ {Number(r.score).toFixed(1)}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}

            {/* POI: descrittori disponibili non ancora generati (card tenue) */}
            {!loading && descriptors.length > 0 && (
              <>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pt-2 pl-1 flex items-center gap-1.5">
                  <Wand2 className="w-3 h-3" /> Da generare al volo
                </p>
                {descriptors.map((d, i) => {
                  const key = String(d?.slug || d?.id || d?.title || i);
                  const busy = genState[key];
                  return (
                    <div
                      key={key}
                      className="bg-gray-50/70 border border-dashed border-outline-variant/40 rounded-2xl p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-gray-600 leading-tight">{d?.title || d?.slug || 'Itinerario'}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {metaLine(d) && (
                              <span className="text-[10px] font-bold bg-white text-gray-500 border border-outline-variant/30 px-2 py-0.5 rounded-full">
                                {metaLine(d)}
                              </span>
                            )}
                            {angleOf(d) && (
                              <span className="text-[10px] font-bold bg-white text-amber-600 border border-amber-200/60 px-2 py-0.5 rounded-full">
                                {angleOf(d)}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => requestDescriptor(d)}
                          className="shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black bg-white border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-60 transition"
                        >
                          {busy ? (
                            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {busy}</span>
                          ) : (
                            '🪄 Genera ora (~1 min)'
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {genError && <p className="text-center text-[11px] font-bold text-red-400">{genError}</p>}

            {/* LUOGHI DELLE OPERE: nel chip di un medium con ricerca on-demand
                (cinema/libri/musica/arte/storia/sport — o quando la ricerca
                non trova nulla, tutti i medium) si può cercare la query come
                FILM/LIBRO/ARTISTA/OPERA/EVENTO/VENUE: il server trova i
                luoghi veri su Wikidata e genera l'itinerario. Generalizzato
                su ON_DEMAND_MEDIA (stesso registro LIB_MEDIA del server). */}
            {(() => {
              const activeMedium = ON_DEMAND_MEDIA.find(m => m.chipId === kind);
              const shown = activeMedium ? [activeMedium] : ON_DEMAND_MEDIA;
              if (loading || query.trim().length < 2) return null;
              if (!activeMedium && !(results.length === 0 && descriptors.length === 0)) return null;
              return (
                <div className="pt-2 space-y-2">
                  {shown.map(m => (
                    <button
                      key={m.medium}
                      type="button"
                      disabled={!!filmBusy}
                      onClick={() => searchAsWork(m.medium)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-xs font-black bg-white border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-60 transition"
                    >
                      {filmBusy ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> {filmBusy}</>
                      ) : (
                        <>{m.emoji} Cerca “{query.trim().slice(0, 40)}” come {m.noun}</>
                      )}
                    </button>
                  ))}
                  <p className="text-[10px] font-medium text-gray-400 text-center">
                    Itinerario sui luoghi veri (riprese, ambientazioni, opere, eventi o venue), verificati su Wikidata.
                  </p>
                  {filmError && <p className="text-center text-[11px] font-bold text-red-400">{filmError}</p>}
                </div>
              );
            })()}

            {!loading && !searchError && results.length === 0 && descriptors.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <BookOpen className="w-8 h-8 text-primary/20" />
                <p className="text-xs font-bold text-gray-400 max-w-xs">
                  Nessun itinerario per questa ricerca. Prova con un’altra città o togli qualche filtro.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* CTA fissa nel dettaglio */}
      {detail && !detail.loading && detail.itinerary && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur border-t border-gray-100">
          <button
            type="button"
            disabled={using}
            onClick={handleUse}
            className="w-full py-3.5 rounded-2xl bg-primary text-white text-sm font-black active:scale-[0.98] disabled:opacity-60 transition-transform flex items-center justify-center gap-2"
          >
            {using
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Lo salvo nei tuoi itinerari…</>
              : <><Sparkles className="w-4 h-4" /> Usa questo itinerario (gratis)</>}
          </button>
          <p className="text-[10px] font-bold text-gray-400 text-center mt-1.5">
            Si salva nei tuoi itinerari: guida premium, podcast e PDF funzionano come su ogni itinerario.
          </p>
        </div>
      )}
    </div>
  );
}
