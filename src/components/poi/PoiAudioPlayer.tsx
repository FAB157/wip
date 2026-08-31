import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Megaphone, Loader2, Sparkles, Headphones,
  RotateCcw, Pause, Play, RotateCw, Square, Moon, History, Mic, X, Send
} from 'lucide-react';
import { getTranslation, Language } from '../../lib/i18n';
import { useAudioState } from '../../hooks/useAudioState';
import { locationService, parseDuetLines } from '../../services/locationService';
import { getApiUrl, apiFetch } from '../../lib/api';
import { notify } from '../../lib/toast';

export type GuideRegister = 'standard' | 'breve' | 'bambini' | 'duetto';

interface PoiAudioPlayerProps {
  localGuideMode: "nicky" | "dante";
  setLocalGuideMode: (mode: "nicky" | "dante") => void;
  guideRegister: GuideRegister;
  setGuideRegister: (r: GuideRegister) => void;
  isLoading: boolean;
  isRegenerating: boolean;
  generatedText: string | null;
  poi: any;
  wikiData: any;
  language: Language;
  onToggleSpeech: () => void;
  onRegenerate: () => void;
}

// Ritratti dei due narratori. Sono personaggi, non luoghi: qui l'immagine
// generica è ammessa (la regola sulle foto vere vale per i POI e le guide di
// un posto). Restano comunque due fetch remote per scheda — se un giorno si
// vuole togliere la dipendenza da Unsplash, sono questi due valori.
const AVATAR_NICKY = "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop";
const AVATAR_DANTE = "/Portrait_de_Dante.jpg";

// Lingue del riconoscimento vocale per «Chiedi mentre ascolti»
const SPEECH_LANGS: Record<string, string> = {
  IT: 'it-IT', EN: 'en-US', FR: 'fr-FR', ES: 'es-ES', DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN',
};

// Nome della lingua UI per il prompt di /api/regenerate: la risposta della
// guida deve arrivare nella lingua dell'utente, non in italiano.
const LANG_NAMES: Record<string, string> = {
  IT: 'italiano', EN: 'inglese', FR: 'francese', ES: 'spagnolo', DE: 'tedesco', RU: 'russo', ZH: 'cinese semplificato',
};

// ── Riprendi da dove eri (ondata 3) ──────────────────────────────────────
// Posizioni di ascolto per POI in localStorage: sopravvivono a chiusure e
// giorni di distanza. Si salvano ogni ~3s durante l'ascolto e si cancellano
// a riproduzione quasi completata.
const POS_KEY = 'wip_audio_positions';
const loadPositions = (): Record<string, { t: number; d: number; at: number }> => {
  try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}') || {}; } catch { return {}; }
};
const savePosition = (poiId: string, t: number, d: number) => {
  try {
    const all = loadPositions();
    all[poiId] = { t: Math.floor(t), d: Math.floor(d), at: Date.now() };
    // Tetto a 80 voci: si scartano le più vecchie
    const keys = Object.keys(all);
    if (keys.length > 80) {
      keys.sort((a, b) => (all[a].at || 0) - (all[b].at || 0)).slice(0, keys.length - 80).forEach(k => delete all[k]);
    }
    localStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch { /* storage bloccato: niente ripresa, non è un errore */ }
};
const clearPosition = (poiId: string) => {
  try {
    const all = loadPositions();
    if (all[poiId]) { delete all[poiId]; localStorage.setItem(POS_KEY, JSON.stringify(all)); }
  } catch { /* best effort */ }
};

export default function PoiAudioPlayer({
  localGuideMode,
  setLocalGuideMode,
  guideRegister,
  setGuideRegister,
  isLoading,
  isRegenerating,
  generatedText,
  poi,
  wikiData,
  language,
  onToggleSpeech,
  onRegenerate
}: PoiAudioPlayerProps) {
  const audioState = useAudioState();

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleSpeedToggle = () => {
    const next = audioState.playbackSpeed === 1 ? 1.5 : audioState.playbackSpeed === 1.5 ? 2 : 1;
    locationService.setPlaybackSpeed(next);
  };

  const isCurrentPoi = audioState.poiId === String(poi.id);

  // ── Testo mostrato + trascrizione sincronizzata ───────────────────────
  const displayText: string = isLoading || isRegenerating
    ? ''
    : (localGuideMode === "nicky"
        ? (generatedText || poi?.audioScript || (wikiData?.extract ? getTranslation('sk_nicky_intro', language).replace('{text}', wikiData.extract) : getTranslation('sk_nicky_ciao', language)))
        : (generatedText || poi?.audioScript || wikiData?.extract || getTranslation('sk_descrizione_non_disponibile', language)));

  // Frasi + posizione cumulativa in caratteri: senza timestamp reali del TTS
  // la sincronia è proporzionale (tempo/durata ≈ caratteri letti). Non è
  // karaoke perfetto ma segue il filo del discorso ed è leggibile a volume 0.
  const sentences = useMemo(() => {
    const parts: string[] = String(displayText || '').match(/[^.!?…]+[.!?…]+["»']?\s*|[^.!?…]+$/g) || [];
    let cum = 0;
    const total = parts.reduce((s, p) => s + p.length, 0) || 1;
    return parts.map(p => {
      const start = cum / total;
      cum += p.length;
      return { text: p, start, end: cum / total };
    });
  }, [displayText]);

  // 🎭 Duetto: se il testo è un dialogo NICKY:/DANTE: la trascrizione mostra
  // le battute col nome del parlante in grassetto; la battuta in riproduzione
  // (audioState.duetIndex, aggiornata da locationService) resta evidenziata.
  const duetLines = useMemo(() => parseDuetLines(displayText), [displayText]);
  const activeDuetLine = isCurrentPoi ? audioState.duetIndex : -1;

  const playRatio = isCurrentPoi && audioState.duration > 0 ? audioState.currentTime / audioState.duration : -1;
  const activeSentence = playRatio >= 0 ? sentences.findIndex(s => playRatio >= s.start && playRatio < s.end) : -1;
  const activeRef = useRef<HTMLSpanElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Auto-scroll della frase corrente dentro il riquadro (mai della pagina)
    if (activeRef.current && transcriptRef.current) {
      const el = activeRef.current, box = transcriptRef.current;
      const target = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
      box.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }
  }, [activeSentence, activeDuetLine]);

  // ── Riprendi: salvataggio posizione + chip ────────────────────────────
  const [savedPos, setSavedPos] = useState<{ t: number; d: number } | null>(() => {
    const p = loadPositions()[String(poi.id)];
    return p ? { t: p.t, d: p.d } : null;
  });
  useEffect(() => {
    if (!isCurrentPoi || !audioState.isPlaying || !audioState.duration) return;
    if (audioState.currentTime / audioState.duration >= 0.97) {
      clearPosition(String(poi.id));
      setSavedPos(null);
    } else if (audioState.currentTime > 5) {
      savePosition(String(poi.id), audioState.currentTime, audioState.duration);
    }
    // Il "tick" ogni ~3s: currentTime cambia di continuo, il floor lo campiona
  }, [isCurrentPoi, audioState.isPlaying, Math.floor(audioState.currentTime / 3)]);

  const showResume = !!savedPos && savedPos.t > 20 &&
    isCurrentPoi && audioState.duration > 0 &&
    savedPos.t < audioState.duration * 0.95 &&
    (savedPos.t - audioState.currentTime) > 10;

  const doResume = () => {
    if (!savedPos) return;
    // seek è relativo (web e nativo): il delta porta alla posizione salvata
    locationService.seek(savedPos.t - audioState.currentTime);
  };

  // ── «Chiedi mentre ascolti» (ondata 4) ────────────────────────────────
  // Pausa, domanda (a voce dove il browser lo consente, altrimenti testo),
  // risposta generata da /api/regenerate col personaggio attivo e letta dal
  // TTS. La posizione dell'ascolto resta salvata: si riprende col chip.
  const [askOpen, setAskOpen] = useState(false);
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState('');
  const [askBusy, setAskBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const speechSupported = typeof window !== 'undefined' && !!((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);

  const openAsk = () => {
    if (audioState.isPlaying && isCurrentPoi) onToggleSpeech(); // pausa
    setAskAnswer('');
    setAskQuestion('');
    setAskOpen(true);
  };

  const startListening = () => {
    try {
      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SR) return;
      const rec = new SR();
      recognitionRef.current = rec;
      rec.lang = SPEECH_LANGS[String(language)] || 'it-IT';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e: any) => {
        const said = e.results?.[0]?.[0]?.transcript || '';
        setAskQuestion(prev => (prev ? `${prev} ${said}` : said));
        setListening(false);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      setListening(true);
      rec.start();
    } catch { setListening(false); }
  };

  const doAsk = async () => {
    const q = askQuestion.trim();
    if (q.length < 3 || askBusy) return;
    setAskBusy(true);
    setAskAnswer('');
    try {
      // apiFetch: Bearer automatico (/api/regenerate esige il login) + timeout.
      const res = await apiFetch(getApiUrl('/api/regenerate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${displayText}\n\nDOMANDA DEL VISITATORE mentre ascolta la guida (rispondi SOLO e direttamente a questa domanda, massimo 120 parole): "${q}"\n\nRispondi in ${LANG_NAMES[String(language)] || 'italiano'}.`,
          poiName: poi?.name,
          mode: localGuideMode,
          previousText: displayText || undefined,
          lang: language,
        }),
      }, 45000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const answer = String(data?.result || '').trim();
      if (!answer) throw new Error('Risposta vuota');
      setAskAnswer(answer);
      // La risposta viene letta con la voce del personaggio; id dedicato per
      // non sporcare la posizione salvata dell'audioguida principale.
      locationService.playAudio(answer, getTranslation('sk_risposta_suffisso', language).replace('{name}', String(poi?.name || '')), poi?.category, `${String(poi?.id)}_ask`, localGuideMode, undefined, poi?.photo_url || poi?.image_url);
    } catch {
      setAskAnswer(getTranslation('sk_risposta_errore', language));
    } finally {
      setAskBusy(false);
    }
  };

  // ── Sleep timer ───────────────────────────────────────────────────────
  const [sleepMin, setSleepMin] = useState(0);
  const sleepArmedAt = useRef(0);
  const cycleSleep = () => {
    const next = sleepMin === 0 ? 10 : sleepMin === 10 ? 20 : sleepMin === 20 ? 30 : 0;
    setSleepMin(next);
    sleepArmedAt.current = Date.now();
  };
  useEffect(() => {
    if (!sleepMin) return;
    const id = setInterval(() => {
      if (Date.now() - sleepArmedAt.current >= sleepMin * 60000) {
        locationService.stopGuideAudio();
        setSleepMin(0);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [sleepMin]);

  // ── 🎧 Audio direzionale + 🤫 Modalità silenziosa (persistenti) ────────
  const [directionalOn, setDirectionalOn] = useState(() => {
    try { return localStorage.getItem('wip_directional_audio') === '1'; } catch { return false; }
  });
  const [silentOn, setSilentOn] = useState(() => {
    try { return localStorage.getItem('wip_silent_mode') === '1'; } catch { return false; }
  });
  const toggleDirectional = () => {
    const next = !directionalOn;
    setDirectionalOn(next);
    // Chiamata NEL gesto: su iOS il permesso bussola si chiede solo qui.
    locationService.setDirectionalAudio(next).catch(() => { /* fail-safe */ });
  };
  const toggleSilent = () => {
    const next = !silentOn;
    setSilentOn(next);
    locationService.setSilentMode(next);
  };

  // ── ⏱ Feedback trigger geofencing (barra a un tap, max 1 ogni 30 min) ──
  // locationService emette 'wip-trigger-feedback-request' a fine/chiusura di
  // un'audioguida partita da trigger (o subito, in modalità silenziosa).
  const [feedbackReq, setFeedbackReq] = useState<{ poiId: string; lat: number | null; lon: number | null } | null>(null);
  useEffect(() => {
    const onReq = (e: any) => {
      const d = e?.detail || {};
      if (d.poiId && String(d.poiId) === String(poi?.id)) {
        setFeedbackReq({ poiId: String(d.poiId), lat: d.lat ?? null, lon: d.lon ?? null });
      }
    };
    window.addEventListener('wip-trigger-feedback-request', onReq);
    return () => window.removeEventListener('wip-trigger-feedback-request', onReq);
  }, [poi?.id]);

  const sendTriggerFeedback = (verdict: 'ok' | 'early' | 'wrong') => {
    const req = feedbackReq;
    setFeedbackReq(null);
    if (!req) return;
    // Best-effort: la rotta può non esistere ancora — ogni errore è silenzioso
    try {
      fetch(getApiUrl('/api/telemetry/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poiId: req.poiId, verdict, lat: req.lat, lon: req.lon,
          platform: 'web', ts: Date.now(),
        }),
      }).catch(() => { /* rotta assente/offline: nessun rumore */ });
    } catch { /* ignore */ }
    notify(getTranslation('sk_feedback_grazie', language), 'success');
  };

  // ── Chi parla ──────────────────────────────────────────────────────────
  // Tre scelte, non due assi incrociati (24/08/2026). Prima c'erano «Voce»
  // (Nicky/Dante) e «Versione» (standard/breve/bimbi/duetto): due file di chip
  // che si contendevano la stessa striscia di schermo, e il duetto — che NON è
  // una versione del testo ma un terzo modo di raccontare, a due voci — stava
  // nella fila sbagliata. Breve e Bimbi sono usciti dall'interfaccia; il tipo
  // GuideRegister li conserva perché restano nelle chiavi di cache già scritte.
  const isDuetto = guideRegister === 'duetto';
  const nomeNarratore = isDuetto ? 'Nicky & Dante' : (localGuideMode === 'nicky' ? 'Nicky' : 'Dante');
  const scegliVoce = (v: 'nicky' | 'dante' | 'duetto') => {
    if (v === 'duetto') { setGuideRegister('duetto'); return; }
    setLocalGuideMode(v);
    // Tornando a una voce sola si esce dal duetto (e da qualunque registro
    // vecchio rimasto in sessione), altrimenti si chiederebbe un dialogo a un
    // solo narratore.
    if (guideRegister !== 'standard') setGuideRegister('standard');
  };
  const VOCI: [('nicky' | 'dante' | 'duetto'), string, boolean][] = [
    ['nicky', 'Nicky', !isDuetto && localGuideMode === 'nicky'],
    ['dante', 'Dante', !isDuetto && localGuideMode === 'dante'],
    ['duetto', getTranslation('sk_duetto', language), isDuetto],
  ];

  return (
    <div className="relative bg-white rounded-[2rem] p-6 mb-8 border border-secondary shadow-xl shadow-secondary/5 overflow-hidden">
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-secondary/10 blur-[80px] rounded-full" />

      <div className="relative z-10">
        {/* Intestazione: chi parla a sinistra, i due comandi a destra.
            I comandi stanno in una RIGA PROPRIA rispetto alle chip della voce:
            prima erano nella stessa riga di flex, e su schermo stretto le chip
            (larghezza fissa, `w-fit`) sfuggivano dalla colonna che si
            restringeva e finivano SOTTO i bottoni — CHIEDI copriva «Dante» e
            lo rendeva non cliccabile (visto su iPhone, 24/08/2026). */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-4">
          <h3 className="text-xl font-black text-primary flex items-center gap-3 min-w-0">
            {isDuetto ? (
              <span className="flex shrink-0 -space-x-2">
                <img src={AVATAR_NICKY} alt="Nicky" className="w-8 h-8 rounded-full object-cover object-top border-2 border-secondary shadow-sm bg-white" />
                <img src={AVATAR_DANTE} alt="Dante" className="w-8 h-8 rounded-full object-cover object-top border-2 border-primary shadow-sm bg-white" />
              </span>
            ) : (
              <img
                src={localGuideMode === 'nicky' ? AVATAR_NICKY : AVATAR_DANTE}
                className={`w-8 h-8 rounded-full object-cover border-2 shadow-sm shrink-0 ${localGuideMode === 'nicky' ? 'border-secondary' : 'border-primary'} bg-white object-top`}
                alt={nomeNarratore}
              />
            )}
            {/* Niente `truncate` e niente nome del POI qui dentro: il titolo
                era «Nicky: <nome del POI> Vibes» e su schermo stretto si
                riduceva a «N.» — il narratore spariva proprio dove serviva
                dire chi sta parlando. Il nome del luogo è già in cima alla
                scheda, non va ripetuto. */}
            <span>{nomeNarratore}</span>
          </h3>
          <div className="flex gap-2 items-center">
            <button
              onClick={openAsk}
              disabled={isLoading || isRegenerating || !displayText}
              className="px-3 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 bg-primary text-white shadow-sm disabled:opacity-50"
              title={getTranslation('sk_chiedi_title', language)}
            >
              <Mic className="w-4 h-4" />
              {getTranslation('sk_chiedi', language)}
            </button>
            <button
              onClick={() => locationService.setMegaphone(!audioState.isMegaphone)}
              className={`px-3 py-2 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 ${audioState.isMegaphone ? "bg-secondary text-white shadow-sm" : "bg-surface-warm/60 hover:bg-surface-warm"}`}
            >
              <Megaphone className="w-4 h-4" />
              {getTranslation('sk_megafono', language)}
            </button>
          </div>
        </div>

        {/* VOCE — una sola fila, tre scelte. `max-w-full` + `flex-wrap`: se
            non c'entrano, vanno a capo dentro la loro pillola invece di
            uscire dal riquadro. */}
        <p className="text-[9px] font-black uppercase tracking-wider text-primary/40 mb-1">{getTranslation('sk_voce', language)}</p>
        <div className="flex items-center flex-wrap gap-1 mb-6 bg-background p-1 rounded-2xl w-fit max-w-full">
          {VOCI.map(([key, label, attiva]) => (
            <button
              key={key}
              onClick={() => scegliVoce(key)}
              disabled={isLoading || isRegenerating}
              aria-pressed={attiva}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 ${
                attiva
                  ? (key === 'nicky' ? 'bg-secondary text-white shadow-md' : 'bg-primary text-white shadow-md')
                  : 'text-primary/60 hover:text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ⏱ Feedback trigger: barra leggera a un tap, una volta sola e
            throttlata (30 min) — appare a fine/chiusura di una guida partita
            dal geofencing. L'invio è best-effort e sempre silenzioso. */}
        <AnimatePresence>
          {feedbackReq && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex items-center flex-wrap gap-1.5 mb-4 bg-surface-warm/60 border border-secondary/20 rounded-2xl px-3 py-2"
            >
              <span className="text-[10px] font-black text-primary/70 uppercase tracking-wide mr-1">
                {getTranslation('sk_feedback_momento', language)}
              </span>
              <button
                onClick={() => sendTriggerFeedback('ok')}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
              >
                {getTranslation('sk_momento_giusto', language)}
              </button>
              <button
                onClick={() => sendTriggerFeedback('early')}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
              >
                {getTranslation('sk_troppo_presto', language)}
              </button>
              <button
                onClick={() => sendTriggerFeedback('wrong')}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
              >
                {getTranslation('sk_non_ero_qui', language)}
              </button>
              <button
                onClick={() => setFeedbackReq(null)}
                aria-label={getTranslation('sk_chiudi_feedback', language)}
                className="ml-auto -my-2 -mr-2 min-w-11 min-h-11 flex items-center justify-center text-primary/60 hover:text-primary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Trascrizione sincronizzata: la frase in ascolto si evidenzia e
            resta centrata nel riquadro; a volume zero si legge come un libro */}
        <div
          ref={transcriptRef}
          className="text-[14px] text-primary/90 leading-relaxed font-medium mb-8 bg-surface-warm/5 p-4 rounded-2xl italic border-l-4 border-secondary/20 max-h-56 overflow-y-auto scroll-smooth"
        >
          {isLoading || isRegenerating ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="w-5 h-5 animate-spin text-secondary" />
              <span className="font-bold">
                {isRegenerating ? getTranslation("regenerating_label", language) : getTranslation("loading_dots", language)}
              </span>
            </div>
          ) : duetLines ? (
            /* 🎭 Duetto: battute col parlante in grassetto; quella in
               riproduzione (voce corrispondente) resta evidenziata */
            <div className="not-italic space-y-2">
              {duetLines.map((l, i) => (
                <p key={i} className={i === activeDuetLine ? "bg-secondary/15 rounded-lg px-1.5 py-0.5 transition-colors" : "transition-colors"}>
                  <strong className={l.speaker === 'nicky' ? 'text-secondary' : 'text-primary'}>
                    {l.speaker === 'nicky' ? 'Nicky' : 'Dante'}:
                  </strong>{' '}
                  <span ref={i === activeDuetLine ? activeRef : undefined} className={i === activeDuetLine ? 'font-bold text-primary' : ''}>
                    {l.text}
                  </span>
                </p>
              ))}
            </div>
          ) : sentences.length > 0 ? (
            sentences.map((s, i) => (
              <span
                key={i}
                ref={i === activeSentence ? activeRef : undefined}
                className={i === activeSentence
                  ? "bg-secondary/15 text-primary font-bold not-italic rounded px-0.5 transition-colors"
                  : "transition-colors"}
              >
                {s.text}
              </span>
            ))
          ) : (
            displayText
          )}
        </div>

        {/* Riprendi da dove eri: appare se c'è una posizione salvata più avanti */}
        {showResume && savedPos && (
          <button
            onClick={doResume}
            className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary/10 hover:bg-secondary/20 text-primary rounded-xl text-xs font-black transition-colors"
          >
            <History className="w-4 h-4" />
            {getTranslation('sk_riprendi_da', language).replace('{time}', formatTime(savedPos.t))}
          </button>
        )}

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="relative h-2 bg-on-surface-variant/10 rounded-full overflow-hidden mb-2">
            <motion.div
              className="absolute inset-y-0 left-0 bg-secondary"
              animate={{ width: `${isCurrentPoi ? audioState.progress : 0}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-black text-primary">
            <span>{isCurrentPoi ? formatTime(audioState.currentTime) : "00:00"}</span>
            <span className="flex items-center gap-2">
              {!isCurrentPoi && savedPos && savedPos.t > 20 && (
                <span className="text-primary/50 font-bold normal-case">{getTranslation('sk_eri_a', language).replace('{time}', formatTime(savedPos.t))}</span>
              )}
              {isCurrentPoi && audioState.duration ? formatTime(audioState.duration) : "00:00"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mb-4 text-primary/70 bg-primary/5 py-2 px-4 rounded-xl border border-primary/10">
          <Headphones className="w-4 h-4 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-center">{getTranslation('sk_usa_cuffie', language)}</span>
        </div>

        {/* Preferenze audio persistenti: 🎧 pan direzionale verso il POI (web,
            fail-safe totale senza sensori) e 🤫 modalità silenziosa (i trigger
            geofencing vibrano e mostrano il testo invece di parlare) */}
        <div className="flex items-center justify-center flex-wrap gap-2 mb-4">
          <button
            onClick={toggleDirectional}
            aria-pressed={directionalOn}
            title={getTranslation('sk_audio_direzionale_title', language)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide transition-colors ${
              directionalOn ? "bg-secondary text-white shadow-sm" : "bg-surface-warm/60 text-primary/60 hover:bg-surface-warm"
            }`}
          >
            {getTranslation('sk_audio_direzionale', language)}{directionalOn ? " · ON" : ""}
          </button>
          <button
            onClick={toggleSilent}
            aria-pressed={silentOn}
            title={getTranslation('sk_silenziosa_title', language)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide transition-colors ${
              silentOn ? "bg-primary text-white shadow-sm" : "bg-surface-warm/60 text-primary/60 hover:bg-surface-warm"
            }`}
          >
            {getTranslation('sk_silenziosa', language)}{silentOn ? " · ON" : ""}
          </button>
        </div>

        <div className="flex items-center justify-center gap-6 mb-8">
          <button onClick={() => locationService.restart()} className="text-primary hover:text-secondary flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <RotateCcw className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold uppercase">{getTranslation("restart_btn", language)}</span>
          </button>

          <button
            onClick={onToggleSpeech}
            disabled={(!wikiData?.extract && !generatedText) || isLoading || isRegenerating}
            aria-label={(audioState.isPlaying && isCurrentPoi) ? getTranslation('a11y_pausa', language) : getTranslation('a11y_riproduci', language)}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-xl active:scale-90 ${
              (audioState.isPlaying && isCurrentPoi) ? "bg-red-500 shadow-red-200" : "bg-secondary shadow-secondary/30"
            }`}
          >
            {(audioState.isPlaying && isCurrentPoi) ? <Pause className="w-10 h-10 text-white fill-current" /> : <Play className="w-10 h-10 text-white fill-current translate-x-1" />}
          </button>

          <button onClick={() => locationService.seek(10)} className="text-primary hover:text-secondary flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <RotateCw className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-bold uppercase">{getTranslation("forward_10s", language)}</span>
          </button>

          {/* Velocità tra i controlli principali: il vecchio "1x" in alto a
              destra era piccolo e fuori dalla zona dei comandi di ascolto. */}
          <button
            onClick={handleSpeedToggle}
            aria-label={getTranslation('sk_velocita_aria', language).replace('{n}', String(audioState.playbackSpeed))}
            className="text-primary hover:text-secondary flex flex-col items-center gap-1"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-black transition-all active:scale-95 ${
              audioState.playbackSpeed !== 1 ? "bg-secondary text-white shadow-md" : "bg-blue-50"
            }`}>
              {audioState.playbackSpeed}x
            </div>
            <span className="text-[11px] font-bold uppercase">{getTranslation('sk_velocita', language)}</span>
          </button>

          {/* Sleep timer: off → 10' → 20' → 30' → off. Allo scadere l'audio
              si ferma da solo (standard dei player, comodo in hotel la sera). */}
          <button
            onClick={cycleSleep}
            aria-label={sleepMin ? getTranslation('sk_sleep_attivo', language).replace('{n}', String(sleepMin)) : getTranslation('sk_sleep_spento', language)}
            className="text-primary hover:text-secondary flex flex-col items-center gap-1"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-95 ${
              sleepMin ? "bg-primary text-white shadow-md" : "bg-blue-50"
            }`}>
              {sleepMin ? <span className="text-xs font-black">{sleepMin}'</span> : <Moon className="w-6 h-6" />}
            </div>
            <span className="text-[11px] font-bold uppercase">{getTranslation('sk_sleep', language)}</span>
          </button>
        </div>

        <div className="flex justify-center mb-6">
          <button
            onClick={() => locationService.stopGuideAudio()}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-100 hover:bg-red-200 text-red-700 font-black rounded-xl transition-all"
          >
            <Square className="w-4 h-4 fill-current" />
            {getTranslation("stop_audio", language)}
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 pt-4 border-t border-amber-100/50">
          <button
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="flex items-center gap-2 text-secondary font-black text-xs hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {isRegenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {getTranslation("listen_deep", language)}
          </button>
          {/* Dicitura di trasparenza AI: sempre visibile ma discreta */}
          <p className="text-[9px] text-primary/40 font-bold uppercase tracking-wide text-center">
            {getTranslation("ai_content_notice", language)}
          </p>
        </div>
      </div>

      {/* «Chiedi mentre ascolti»: domanda a voce o testo, risposta parlata */}
      <AnimatePresence>
        {askOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1400] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
            onClick={() => setAskOpen(false)}
          >
            <div
              className="w-full max-w-md bg-white rounded-3xl p-5 space-y-3 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h4 className="font-black text-primary text-sm">
                  {getTranslation('sk_chiedi_a_su', language).replace('{guide}', localGuideMode === 'nicky' ? 'Nicky' : 'Dante').replace('{name}', String(poi?.name || ''))}
                </h4>
                <button onClick={() => setAskOpen(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
              </div>

              <div className="flex gap-2">
                <input
                  value={askQuestion}
                  onChange={e => setAskQuestion(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doAsk(); }}
                  placeholder={listening ? getTranslation('sk_ti_ascolto', language) : getTranslation('sk_es_domanda', language)}
                  className="flex-1 bg-surface-warm border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800"
                />
                {speechSupported && (
                  <button
                    onClick={startListening}
                    disabled={listening}
                    className={`p-2.5 rounded-xl transition-colors ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-primary text-white'}`}
                    title={getTranslation('sk_domanda_voce', language)}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={doAsk}
                  disabled={askBusy || askQuestion.trim().length < 3}
                  className="p-2.5 rounded-xl bg-secondary text-white disabled:opacity-50"
                  title={getTranslation('sk_invia_domanda', language)}
                >
                  {askBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>

              {askAnswer && (
                <div className="bg-surface-warm rounded-2xl p-3 text-sm text-primary/90 leading-relaxed max-h-48 overflow-y-auto">
                  {askAnswer}
                </div>
              )}
              <p className="text-[10px] text-gray-500">
                {getTranslation('sk_risposta_letta', language)}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
