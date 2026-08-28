// =====================================================================
// ITAINTA · PoiCard — scheda POI sulla mappa
// Mostra la scheda (cache-first) e i tre comandi: PLAY · NAVIGA · CHIEDI DI PIU'.
// PLAY: genera/riusa l'audioguida e la legge (Azure), resettando l'anti-ripetizione.
// CHIEDI DI PIU': 3 livelli di approfondimento (non cachati), poi bottone grigio.
// =====================================================================

import { useEffect, useRef, useState } from 'react';
import { getTranslation } from "../lib/i18n";
import NavChoiceSheet from "./NavChoiceSheet";
import { Play, Navigation, Sparkles, Loader2, X } from 'lucide-react';
import { ensurePoiDetails } from '../services/enrichmentService';
import { fotoPrincipale } from '../lib/fotoUrl';
import AttribuzioneFoto from './AttribuzioneFoto';
import {
  getAudioguideForPlayback,
  askMore,
  MAX_ASK_MORE_LEVEL,
} from '../services/audioguideService';
import { notify } from '../lib/toast';
import { possiedePoi, possiedePoiSync, segnaPoiPosseduto } from '../services/dayPassService';
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
  const [fotoRotta, setFotoRotta] = useState(false);
  const [attribuzione, setAttribuzione] = useState<string | null>(null);
  const [loadingCard, setLoadingCard] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [showNavChoice, setShowNavChoice] = useState(false);   // 🚶 WIP Nav / 🚗 Maps

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
      // Il credito dell'autore, se l'arricchimento lo porta: CC BY-SA lo
      // impone, e la scheda mostra la foto quanto le altre.
      setAttribuzione((d as any)?.images?.[0]?.attribution ?? (d as any)?.image_attribution ?? null);
      setLoadingCard(false);
    });
    return () => {
      alive = false;
    };
  }, [poi.id, lang]);

  // Paywall deciso dal SERVER (28/08/2026): senza diritto /api/poi/audioguide
  // risponde 402 con anteprima e costo; qui si mostra l'anteprima e il tasto
  // «Ascolta per N crediti», che ritenta con charge:true. L'addebito lo fa il
  // server: nessun consume_credits lato client.
  // UNA GUIDA ACQUISTATA E' TUA PER SEMPRE (29/08/2026): se il POI risulta
  // gia' acquistato non si mostra nessun prezzo e non si chiede consenso.
  const [paywall, setPaywall] = useState<{ cost: number; preview: string } | null>(null);
  const [giaTua, setGiaTua] = useState(() => possiedePoiSync(poi.id));
  useEffect(() => {
    let vivo = true;
    setGiaTua(possiedePoiSync(poi.id));
    possiedePoi(poi.id).then((v) => { if (vivo && v) setGiaTua(true); }).catch(() => {});
    return () => { vivo = false; };
  }, [poi.id]);
  const uiLang = String(language || 'IT').toUpperCase() as any;

  const handlePlay = async (charge = false) => {
    unlockSpeech();
    resetPlayedOne(poi.id); // PLAY esplicito riabilita il geofencing per questo POI
    setPlaying(true);
    try {
      const esito = await getAudioguideForPlayback(
        { id: poi.id, name: poi.name, lat: poi.lat, lon: poi.lon, category: poi.category },
        lang,
        character,
        { charge },
      );
      if (esito.status === 'ok' || (esito.status === 'error' && esito.text)) {
        const text = esito.text as string;
        setPaywall(null);
        // Ha pagato adesso (o l'aveva gia'): da ora e' suo per sempre, e la
        // scheda non deve piu' chiedere crediti per questo POI.
        if (charge) segnaPoiPosseduto(poi.id);
        setGiaTua(true);
        heardRef.current = text;
        await speakAudioguide(text, lang, character);
      } else if (esito.status === 'credits_required') {
        setPaywall({ cost: esito.cost, preview: esito.preview });
      } else if (esito.status === 'insufficient_credits') {
        setPaywall(prev => prev ?? { cost: esito.cost, preview: '' });
        notify(getTranslation('sk_crediti_insufficienti_audio', uiLang));
      } else if (esito.status === 'auth_required') {
        notify(getTranslation('auth_richiesta', uiLang));
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
      {/* Se la foto vera non si carica NON si mette una foto di repertorio al
          suo posto (corretto 24/08/2026): qui c'era un fallback a un'immagine
          Unsplash, cioe' la fotografia di un altro luogo mostrata come se
          fosse questo. E' la regola non negoziabile del progetto — nessuna
          foto e' meglio della foto sbagliata — e il riquadro semplicemente
          sparisce. Larghezza su misura: 480 px per un riquadro alto 160. */}
      {image && !fotoRotta && (
        <div className="relative h-40 w-full overflow-hidden bg-[#f8f5f0]">
          <AttribuzioneFoto testo={attribuzione} />
          <img
            src={fotoPrincipale(image) || undefined}
            alt={poi.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setFotoRotta(true)}
          />
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
          {giaTua && !paywall && (
            <p className="mt-3 text-[11px] font-bold text-emerald-700">
              ✓ {getTranslation('audio_gia_tua', uiLang)}
            </p>
          )}
          {paywall && !giaTua && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              {paywall.preview && (
                <>
                  <p className="text-[10px] font-black uppercase tracking-wide text-amber-700">{getTranslation('audio_anteprima_label', uiLang)}</p>
                  <p className="mt-1 italic text-[#1e3a8a]">{paywall.preview}…</p>
                </>
              )}
              <button
                onClick={() => handlePlay(true)}
                disabled={playing}
                className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {playing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {getTranslation('audio_ascolta_per_crediti', uiLang).replace('{n}', String(paywall.cost))}
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => handlePlay(false)}
            disabled={playing}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-secondary disabled:opacity-60"
          >
            {playing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Play
          </button>

          <button
            // Doppia scelta (22/08/2026): a piedi con WIP Nav, in auto con
            // Google Maps / Mappe. NavChoiceSheet punta alla porta (puntoArrivo).
            onClick={() => setShowNavChoice(true)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#f8f5f0] border border-outline-variant px-3 py-2.5 text-sm font-semibold text-[#1e3a8a]"
          >
            <Navigation size={16} />
            Naviga
          </button>
        </div>
        <NavChoiceSheet poi={showNavChoice ? poi : null} language={language} onClose={() => setShowNavChoice(false)} />

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

