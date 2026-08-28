// =====================================================================
// ITAINTA · Audioguide on-demand (cache-first) + "Chiedi di piu'"
// GET-OR-CREATE server-side via /api/poi/audioguide (chiave poi_id+lingua+
// personaggio): genera e PERSISTE in poi_audioguides con service role (la RLS
// blocca ora la scrittura client). L'approfondimento NON si cacha.
// =====================================================================

import {
  getAudioguide,
  incrementAudioguidePlay,
  ensureSharedPoi,
} from './poiRepository';
import { ensurePoiDetails, type EnrichInput } from './enrichmentService';
import { getApiUrl, apiFetch } from '../lib/api';
import { bearerHeaders } from '../lib/audioFetch';
import type { GuideCharacter } from '../types/poi';

// Timeout delle rotte di generazione testo: il server fa LLM + persistenza,
// 25 s bastano al 99%; oltre, meglio il fallback che uno spinner eterno.
const AUDIOGUIDE_TIMEOUT_MS = 25000;

/** Numero massimo di livelli "Chiedi di piu'" (poi bottone grigio). */
export const MAX_ASK_MORE_LEVEL = 3;

// Euristica economica (nessuna chiamata AI) gemella di quella server-side
// (server.ts::sembraItaliano) — un'audioguida IT cachata in inglese per
// errore (fonte Wikipedia inglese, fast-mode) restava sbagliata per sempre:
// il client la trovava in cache e la restituiva subito, senza mai passare
// dal server che l'avrebbe corretta. Dubbio/pareggio -> considerata
// italiana (fail-safe, non tocca).
function sembraItaliano(testo: string): boolean {
  const t = ` ${String(testo || '').toLowerCase()} `;
  const itWords = [' il ', ' la ', ' di ', ' che ', ' non ', ' con ', ' una ', ' del ', ' della ', ' sono ', ' è ', ' anche ', ' nel ', ' per '];
  const enWords = [' the ', ' and ', ' of ', ' is ', ' was ', ' with ', ' this ', ' that ', ' from ', ' were ', ' its ', ' which '];
  let itScore = 0, enScore = 0;
  for (const w of itWords) if (t.includes(w)) itScore++;
  for (const w of enWords) if (t.includes(w)) enScore++;
  return itScore >= enScore;
}

const LEVEL_FOCUS: Record<number, string> = {
  1: 'dettagli storici approfonditi',
  2: 'curiosita\' e aneddoti nascosti',
  3: 'connessioni con arte, cultura e personaggi famosi',
};

/** Chiamata base a /api/regenerate. */
async function regenerate(params: {
  text: string;
  poiName: string;
  mode: GuideCharacter;
  lang: string;
  previousText?: string;
  /**
   * Istruzione di focus FIDATA (es. "Chiedi di piu'"): il server la tratta
   * fuori dal blocco <materiale> non fidato, cosi' non rischia di essere
   * ignorata insieme a un eventuale tentativo di prompt-injection dentro `text`.
   */
  focusInstruction?: string;
}): Promise<string | null> {
  try {
    // getApiUrl: sull'app nativa il path relativo non raggiunge le API Vercel.
    const res = await apiFetch(getApiUrl('/api/regenerate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await bearerHeaders()) },
      body: JSON.stringify(params),
    }, AUDIOGUIDE_TIMEOUT_MS);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.result === 'string' ? data.result : null;
  } catch (e) {
    console.warn('[audioguideService] regenerate failed:', e);
    return null;
  }
}

/**
 * Ritorna il testo dell'audioguida per poi+lingua+personaggio.
 * Cache-first: se esiste lo riusa (e incrementa play_count); altrimenti lo
 * genera (a partire dalla scheda arricchita), lo salva e lo ritorna.
 */
export interface AudioguideTextOptions {
  /**
   * false = PREFETCH (avvicinamento, pre-scaricamento del giro): il testo
   * si prepara ma non e' un ascolto, e play_count non deve crescere.
   * Default true (ascolto vero).
   */
  incrementPlay?: boolean;
  /**
   * CONSENSO A SPENDERE ORA (28/08/2026). L'addebito lo decide il SERVER
   * (/api/poi/audioguide, chiave idempotente audiocharge_<user>_<poi>_<lang>
   * per 24 h): `charge: true` dice solo «se serve pagare, paga adesso».
   * Va mandato SOLO quando l'utente ha gia' scelto di pagare (tasto
   * «Ascolta per N crediti»): chi lo manda NON deve chiamare anche
   * consume_credits per la stessa guida, sarebbe un doppio addebito.
   * Ignorato in prefetch (il server non addebita mai un prefetch).
   */
  charge?: boolean;
}

/** Esito strutturato di /api/poi/audioguide, per chi deve mostrare paywall/login. */
export type EsitoAudioguida =
  | { status: 'ok'; text: string; /** true se e' stato mandato charge:true e il server ha risposto 200: l'addebito (se dovuto) e' avvenuto lato server */ charged: boolean; cached?: boolean }
  | { status: 'credits_required'; cost: number; preview: string }
  | { status: 'insufficient_credits'; cost: number }
  | { status: 'auth_required' }
  | { status: 'error'; text: string | null };

// DEDUP IN VOLO (ITI-07): il prefetch all'avvicinamento, il trigger e il tap
// su «Ascolta» possono chiedere lo stesso testo nello stesso secondo — tre
// chiamate LLM per la stessa chiave. La seconda e la terza si agganciano
// alla promise della prima. (Se la prima era un prefetch, il play_count
// dell'ascolto vero non cresce: e' un compromesso accettato, un contatore
// contro tre generazioni pagate.) La chiave include il consenso a spendere:
// una richiesta con charge non deve agganciarsi a una senza (che darebbe 402).
const inFlight = new Map<string, Promise<EsitoAudioguida>>();

/**
 * Versione STRUTTURATA per l'ascolto vero: chi la usa puo' distinguere
 * «testo pronto» da «servono crediti» (con anteprima e costo), «saldo
 * insufficiente» e «serve il login». Mai fallback a /api/regenerate in quei
 * casi: costerebbe un LLM per aggirare il paywall.
 */
export function getAudioguideForPlayback(
  poi: EnrichInput,
  language: string,
  character: GuideCharacter,
  options?: AudioguideTextOptions,
): Promise<EsitoAudioguida> {
  const charge = options?.charge === true && options?.incrementPlay !== false;
  const key = `${poi.id}|${String(language).toUpperCase()}|${character}|${charge ? 'c' : 'n'}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = getOrCreateAudioguideTextInterno(poi, language, character, { ...options, charge })
    .finally(() => { if (inFlight.get(key) === p) inFlight.delete(key); });
  inFlight.set(key, p);
  return p;
}

/**
 * Ritorna il testo o null. Compatibile con i chiamanti storici (prefetch del
 * giro, avvicinamento): senza diritto (402) o senza sessione (401) ritorna
 * null SENZA generare nulla a nostre spese.
 */
export async function getOrCreateAudioguideText(
  poi: EnrichInput,
  language: string,
  character: GuideCharacter,
  options?: AudioguideTextOptions,
): Promise<string | null> {
  const esito = await getAudioguideForPlayback(poi, language, character, options);
  if (esito.status === 'ok') return esito.text;
  if (esito.status === 'error') return esito.text;
  return null;
}

async function getOrCreateAudioguideTextInterno(
  poi: EnrichInput,
  language: string,
  character: GuideCharacter,
  options?: AudioguideTextOptions,
): Promise<EsitoAudioguida> {
  const incrementPlay = options?.incrementPlay !== false;
  const charge = options?.charge === true && incrementPlay;
  // 1. cache (la SELECT su poi_audioguides resta consentita dalla RLS).
  //    poi_audioguides.language e' scritto SEMPRE in MAIUSCOLO lato server
  //    (IT/EN/...): normalizziamo qui per non perdere la cache locale quando
  //    `language` arriva in minuscolo dal chiamante. Il valore originale
  //    (`language`) resta invariato per le chiamate HTTP piu' sotto.
  const languageDb = language.toUpperCase();
  const cached = await getAudioguide(poi.id, languageDb, character);
  const cacheSospetta = languageDb === 'IT' && cached?.audio_text && cached.audio_text.trim().length >= 30 && !sembraItaliano(cached.audio_text);
  // La cache locale (SELECT diretta) vale solo se NON si sta chiedendo un
  // ascolto a pagamento: il diritto al testo integrale lo decide il server.
  // Senza charge (prefetch, giro, avvicinamento) il testo in cache resta
  // gratis come prima — e' cio' che il server chiama "colpo di cache".
  if (cached?.audio_text && !cacheSospetta && !charge) {
    if (incrementPlay) await incrementAudioguidePlay(cached.id);
    return { status: 'ok', text: cached.audio_text, charged: false, cached: true };
  }

  // 2. base informativa (scheda arricchita cache-first; l'enrichment è
  //    persistito server-side da /api/poi/enrich).
  const details = await ensurePoiDetails(poi, language);

  // 3. CROWDSOURCING: assicurati che il POI (spesso da OSM/Foursquare/Google)
  //    esista in shared_pois con la materia prima, così che la route server
  //    trovi da cosa generare (e i prossimi utenti abbiano POI + guida pronti).
  await ensureSharedPoi({
    id: poi.id,
    name: poi.name,
    lat: poi.lat,
    lon: poi.lon,
    category: poi.category,
    description_short: details?.summary || null,
    description_long: details?.wiki_extract || null,
  });

  // 4. GET-OR-CREATE SERVER-SIDE: /api/poi/audioguide genera E PERSISTE in
  //    poi_audioguides (service role → bypassa la RLS ora chiusa al client) e
  //    ritorna il testo. Il client NON scrive più direttamente su quella tabella
  //    (RLS deny). Alla prossima apertura getAudioguide leggerà dal DB.
  try {
    // Bearer: cosi' il server sa CHI chiede e puo' fare quota/addebito per
    // utente invece di vedere una richiesta anonima.
    const res = await apiFetch(getApiUrl('/api/poi/audioguide'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await bearerHeaders()) },
      body: JSON.stringify({
        poiId: poi.id,
        lang: language,
        character,
        prefetch: !incrementPlay,
        // Consenso a spendere ORA: solo se il chiamante l'ha chiesto.
        ...(charge ? { charge: true } : {}),
      }),
    }, AUDIOGUIDE_TIMEOUT_MS);
    if (res.ok) {
      const data = await res.json();
      const serverText = typeof data?.text === 'string' ? data.text.trim() : '';
      if (serverText) {
        if (charge) {
          // Il server ha addebitato (o aveva gia' il diritto: pass, 24 h,
          // listino zero): in ogni caso il saldo mostrato va rinfrescato e
          // il chiamante NON deve chiamare consume_credits.
          try {
            const { supabase } = await import('../lib/supabase');
            const { data: sd } = await supabase.auth.getSession();
            const userId = sd?.session?.user?.id;
            if (userId) {
              const { notifyCreditsChanged } = await import('../lib/pricing');
              notifyCreditsChanged({ userId });
            }
          } catch { /* solo UI del saldo */ }
        }
        return { status: 'ok', text: serverText, charged: charge, cached: data?.cached === true };
      }
    } else if (res.status === 402) {
      // SENZA DIRITTO: niente fallback a /api/regenerate (risponderebbe 401
      // o costerebbe un LLM per aggirare il paywall). Si riporta anteprima
      // e costo: la scheda mostra il bottone di acquisto.
      const j = await res.json().catch(() => ({} as any));
      const cost = Number(j?.cost) || 0;
      if (j?.error === 'insufficient_credits') return { status: 'insufficient_credits', cost };
      return { status: 'credits_required', cost, preview: typeof j?.preview === 'string' ? j.preview : '' };
    } else if (res.status === 401) {
      // Sessione assente/scaduta: App.tsx rinnova o riporta al login.
      try { window.dispatchEvent(new CustomEvent('wip-auth-required', { detail: { route: '/api/poi/audioguide' } })); } catch { /* SSR */ }
      return { status: 'auth_required' };
    }
  } catch (e) {
    console.warn('[audioguideService] get-or-create server fallito, fallback client:', e);
  }

  // 5. FALLBACK (server irraggiungibile o 5xx): genera lato client per NON
  //    lasciare l'utente in silenzio, ma SENZA persistere (la persistenza è
  //    server-owned). Mai con charge: se si era chiesto di pagare e il
  //    server non ha risposto, non si consegna il testo integrale gratis.
  const baseInfo =
    details?.summary ||
    details?.wiki_extract ||
    `${poi.name}${poi.category ? ` (${poi.category})` : ''}`;
  if (charge) return { status: 'error', text: null };
  const text = await regenerate({
    text: baseInfo,
    poiName: poi.name,
    mode: character,
    lang: language,
  });
  return { status: 'error', text: text || baseInfo };
}

/**
 * Approfondimento "Chiedi di piu'": genera nuovo testo (NON cachato).
 * @param level 1..MAX_ASK_MORE_LEVEL; oltre -> ritorna null (niente altro).
 * @param previousText tutto cio' che l'utente ha gia' sentito (anti-ripetizione).
 */
export async function askMore(
  poi: EnrichInput,
  language: string,
  character: GuideCharacter,
  level: number,
  previousText: string,
): Promise<string | null> {
  if (level < 1 || level > MAX_ASK_MORE_LEVEL) return null;

  const focus = LEVEL_FOCUS[level];
  // language in poi_audioguides e' MAIUSCOLO lato server (vedi normalizzazione
  // in getOrCreateAudioguideText); non tocchiamo `language` originale, che qui
  // sotto va comunque a /api/regenerate.
  const details = await getAudioguide(poi.id, language.toUpperCase(), character);
  const baseInfo =
    details?.audio_text ||
    `${poi.name}${poi.category ? ` (${poi.category})` : ''}`;

  // L'istruzione di focus va in `focusInstruction`, NON concatenata dentro
  // `text`: quest'ultimo e' trattato dal server come materiale non fidato
  // (anti-prompt-injection) e delimitato/ignorato come fonte di comandi, il
  // che farebbe ignorare anche la richiesta legittima dell'app.
  return regenerate({
    text: baseInfo,
    poiName: poi.name,
    mode: character,
    lang: language,
    previousText,
    focusInstruction: `Approfondisci in particolare: ${focus}. Massimo 200 parole.`,
  });
}
