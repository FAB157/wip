// =====================================================================
// ITAINTA · Audioguide on-demand (cache-first) + "Chiedi di piu'"
// Testo generato da Gemini via /api/regenerate, salvato in poi_audioguides
// (chiave poi_id+lingua+personaggio). L'approfondimento NON si cacha.
// =====================================================================

import {
  getAudioguide,
  upsertAudioguide,
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
  // 1. cache
  const cached = await getAudioguide(poi.id, language, character);
  if (cached?.audio_text) {
    await incrementAudioguidePlay(cached.id);
    return cached.audio_text;
  }

  // 2. base informativa (scheda arricchita cache-first)
  const details = await ensurePoiDetails(poi, language);
  const baseInfo =
    details?.summary ||
    details?.wiki_extract ||
    `${poi.name}${poi.category ? ` (${poi.category})` : ''}`;

  // 3. genera narrazione col personaggio scelto
  const text = await regenerate({
    text: baseInfo,
    poiName: poi.name,
    mode: character,
    lang: language,
  });
  if (!text) return baseInfo; // fallback: leggi almeno la base

  // 4. CROWDSOURCING: assicurati che il POI (spesso da OSM/Foursquare/Google)
  // esista in shared_pois, poi salva il testo. Il prossimo utente avrà
  // POI + audioguida istantanei senza consumare chiamate AI.
  await ensureSharedPoi({
    id: poi.id,
    name: poi.name,
    lat: poi.lat,
    lon: poi.lon,
    category: poi.category,
    description_short: details?.summary || null,
    description_long: details?.wiki_extract || null,
  });
  await upsertAudioguide(poi.id, language, character, text);
  return text;
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
