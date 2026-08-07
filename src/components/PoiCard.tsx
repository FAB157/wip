// =====================================================================
// ITAINTA · PoiCard — scheda POI sulla mappa
// Mostra la scheda (cache-first) e i tre comandi: PLAY · NAVIGA · CHIEDI DI PIU'.
// PLAY: genera/riusa l'audioguida e la legge (Azure), resettando l'anti-ripetizione.
// CHIEDI DI PIU': 3 livelli di approfondimento (non cachati), poi bottone grigio.
// =====================================================================

import { useEffect, useRef, useState } from 'react';
import { getTranslation } from "../lib/i18n";
import { Play, Navigation, Sparkles, Loader2, X } from 'lucide-react';
import { ensurePoiDetails } from '../services/enrichmentService';
import {
  getOrCreateAudioguideText,
  askMore,
  MAX_ASK_MORE_LEVEL,
} from '../services/audioguideService';
import { speakAudioguide, unlockSpeech } from '../services/ttsService';
import { resetPlayedOne } from '../lib/guideSettings';
import { CATEGORY_LABELS_IT, CATEGORY_EMOJI } from '../lib/poiCategories';
import type { GuideCharacter, PoiCategory } from '../types/poi';

export interface PoiCardData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: PoiCategory | null;
  distance_meters?: number;
}

interface PoiCardProps {
  poi: PoiCardData;
  language: string;
  character: GuideCharacter;
  onClose?: () => void;
}

export default function PoiCard({ poi, language, character, onClose }: PoiCardProps) {
  const lang = (language || 'it').toLowerCase();

  const [summary, setSummary] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [loadingCard, setLoadingCard] = useState(true);
  const [playing, setPlaying] = useState(false);

  const [askLevel, setAskLevel] = useState(0);          // 0 = nessun approfondimento ancora
  const [extraTexts, setExtraTexts] = useState<string[]>([]);
  const [askLoading, setAskLoading] = useState(false);
  const heardRef = useRef<string>('');                  // tutto cio' gia' ascoltato (anti-ripetizione)

  // Carica la scheda (cache-first) e resetta lo stato al cambio POI
  useEffect(() => {
    let alive = true;
    setLoadingCard(true);
    setAskLevel(0);
    setExtraTexts([]);
    heardRef.current = '';
    ensurePoiDetails(
      { id: poi.id, name: poi.name, lat: poi.lat, lon: poi.lon, category: poi.category },
      lang,
    ).then((d) => {
      if (!alive) return;
      setSummary(d?.summary ?? d?.wiki_extract ?? null);
      setImage(d?.images?.[0]?.url ?? null);
      setLoadingCard(false);
    });
    return () => {
      alive = false;
    };
  }, [poi.id, lang]);

  const handlePlay = async () => {
    unlockSpeech();
    resetPlayedOne(poi.id); // PLAY esplicito riabilita il geofencing per questo POI
    setPlaying(true);
    try {
      const text = await getOrCreateAudioguideText(
        { id: poi.id, name: poi.name, lat: poi.lat, lon: poi.lon, category: poi.category },
        lang,
        character,
      );
      if (text) {
        heardRef.current = text;
        await speakAudioguide(text, lang, character);
      }
    } finally {
      setPlaying(false);
    }
  };

  const handleAskMore = async () => {
    if (askLevel >= MAX_ASK_MORE_LEVEL) return;
    unlockSpeech();
    const nextLevel = askLevel + 1;
    setAskLoading(true);
    try {
      const text = await askMore(
        { id: poi.id, name: poi.name, lat: poi.lat, lon: poi.lon, category: poi.category },
        lang,
        character,
        nextLevel,
        heardRef.current,
      );
      if (text) {
        heardRef.current = `${heardRef.current}\n${text}`;
        setExtraTexts((prev) => [...prev, text]);
        setAskLevel(nextLevel);
        await speakAudioguide(text, lang, character);
      }
    } finally {
      setAskLoading(false);
    }
  };

  const charName = character === 'nicky' ? 'Nicky' : 'Dante';
  const askExhausted = askLevel >= MAX_ASK_MORE_LEVEL;
  const categoryLabel = poi.category ? CATEGORY_LABELS_IT[poi.category] : '';
  const emoji = poi.category ? CATEGORY_EMOJI[poi.category] : '📍';

  return (
    <div className="bg-[#fcfaf8] rounded-2xl shadow-xl overflow-hidden w-full max-w-md border border-outline-variant">
      {image && (
        <div className="h-40 w-full overflow-hidden bg-[#f8f5f0]">
          <img src={image} alt={poi.name} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1522083111811-0985223abac3?auto=format&fit=crop&q=80&w=400'; }} />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-[#1e3a8a]">
              {emoji} {poi.name}
            </h3>
            <p className="text-xs text-[#1e3a8a]">
              {categoryLabel}
              {typeof poi.distance_meters === 'number'
                ? ` · ${Math.round(poi.distance_meters)} m`
                : ''}
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} aria-label={getTranslation("poi_close", language as any)} className="text-[#1e3a8a] hover:text-[#1e3a8a]">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="mt-3 text-sm text-[#1e3a8a] min-h-[2.5rem]">
          {loadingCard ? (
            <span className="inline-flex items-center gap-2 text-[#1e3a8a]">
              <Loader2 size={14} className="animate-spin" /> Carico la scheda…
            </span>
          ) : (
            <p>{summary || 'Nessuna descrizione disponibile.'}</p>
          )}
          {extraTexts.map((t, i) => (
            <p key={i} className="mt-2 border-l-2 border-secondary pl-2 text-[#1e3a8a]">
              {t}
            </p>
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={handlePlay}
            disabled={playing}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-secondary disabled:opacity-60"
          >
            {playing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Play
          </button>

          <button
            onClick={() => {
              window.open(`https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lon}`, '_blank');
            }}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#f8f5f0] border border-outline-variant px-3 py-2.5 text-sm font-semibold text-[#1e3a8a]"
          >
            <Navigation size={16} />
            Naviga
          </button>
        </div>

        <button
          onClick={handleAskMore}
          disabled={askExhausted || askLoading}
          className={`mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold ${
            askExhausted
              ? 'bg-[#f8f5f0] text-[#1e3a8a] cursor-default'
              : 'bg-secondary text-primary'
          }`}
        >
          {askLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {askExhausted
            ? `${charName} ha condiviso tutto su questo luogo`
            : `Chiedi di più a ${charName}`}
        </button>
      </div>
    </div>
  );
}

