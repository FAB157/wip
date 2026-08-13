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
import { getApiUrl } from '../lib/api';
import type { GuideCharacter } from '../types/poi';

/** Numero massimo di livelli "Chiedi di piu'" (poi bottone grigio). */
export const MAX_ASK_MORE_LEVEL = 3;

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
}): Promise<string | null> {
  try {
    // getApiUrl: sull'app nativa il path relativo non raggiunge le API Vercel.
    const res = await fetch(getApiUrl('/api/regenerate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
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
export async function getOrCreateAudioguideText(
  poi: EnrichInput,
  language: string,
  character: GuideCharacter,
): Promise<string | null> {
  // 1. cache (la SELECT su poi_audioguides resta consentita dalla RLS)
  const cached = await getAudioguide(poi.id, language, character);
  if (cached?.audio_text) {
    await incrementAudioguidePlay(cached.id);
    return cached.audio_text;
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
    const res = await fetch(getApiUrl('/api/poi/audioguide'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poiId: poi.id, lang: language, character }),
    });
    if (res.ok) {
      const data = await res.json();
      const serverText = typeof data?.text === 'string' ? data.text.trim() : '';
      if (serverText) return serverText;
    }
  } catch (e) {
    console.warn('[audioguideService] get-or-create server fallito, fallback client:', e);
  }

  // 5. FALLBACK (server irraggiungibile): genera lato client per NON lasciare
  //    l'utente in silenzio, ma SENZA persistere (la persistenza è server-owned).
  const baseInfo =
    details?.summary ||
    details?.wiki_extract ||
    `${poi.name}${poi.category ? ` (${poi.category})` : ''}`;
  const text = await regenerate({
    text: baseInfo,
    poiName: poi.name,
    mode: character,
    lang: language,
  });
  return text || baseInfo;
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
  const details = await getAudioguide(poi.id, language, character);
  const baseInfo =
    details?.audio_text ||
    `${poi.name}${poi.category ? ` (${poi.category})` : ''}`;

  return regenerate({
    text: `${baseInfo}\n\nApprofondisci in particolare: ${focus}. Massimo 200 parole.`,
    poiName: poi.name,
    mode: character,
    lang: language,
    previousText,
  });
}
