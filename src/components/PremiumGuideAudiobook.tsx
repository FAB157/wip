import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Headphones, Play, Pause, Loader2, ChevronDown, ChevronUp, Square, Mic, BookOpen, Globe, RefreshCw } from 'lucide-react';
import { getApiUrl } from '../lib/api';
import { postForAudioBlob } from '../lib/audioFetch';
import { notify } from '../lib/toast';
import { downloadGuideAsEpub, getAccessToken, saveGuideLocally } from '../services/premiumGuideService';
import { azureVoiceName, speakWithSystemVoice, stopSystemVoice, pauseSystemVoice, resumeSystemVoice } from '../services/ttsService';
import { PRICING_LIST, notifyCreditsChanged } from '../lib/pricing';
import type { PremiumGuideContent } from '../services/premiumGuideService';
import type { Language } from '../lib/i18n';

/**
 * Audio-libro della Guida d'Autore (ondata 4): la guida letta capitolo per
 * capitolo col motore TTS già esistente (/api/tts/smart, cache MD5 su
 * storage: il primo ascolto genera, i successivi sono gratis e istantanei).
 * I capitoli lunghi vengono spezzati in blocchi da ~2.300 caratteri letti in
 * sequenza, per restare nei limiti della sintesi vocale.
 *
 * Se il chiamante passa `hash` (guida già salvata in itinerary_guides) il
 * pannello mostra anche gli strumenti post-acquisto: export EPUB gratuito,
 * traduzione a metà prezzo, rigenerazione gratuita di un singolo giorno e il
 * podcast «Intervista impossibile» (Nicky + personaggio storico, due voci).
 */

const VOICE_BY_LANG: Record<string, string> = {
  IT: 'it-IT-ElsaNeural', EN: 'en-US-JennyNeural', FR: 'fr-FR-DeniseNeural',
  ES: 'es-ES-ElviraNeural', DE: 'de-DE-KatjaNeural', RU: 'ru-RU-SvetlanaNeural', ZH: 'zh-CN-XiaoxiaoNeural',
};

interface Chapter { title: string; text: string; }

function splitBlocks(text: string, max = 2300): string[] {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const sentences = clean.match(/[^.!?…]+[.!?…]+\s*|[^.!?…]+$/g) || [clean];
  const blocks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) { blocks.push(cur.trim()); cur = s; }
    else cur += s;
  }
  if (cur.trim()) blocks.push(cur.trim());
  return blocks;
}

function buildChapters(content: PremiumGuideContent): Chapter[] {
  const chapters: Chapter[] = [];
  const intro: string[] = [];
  if (content.introduzione) intro.push(content.introduzione);
  if (content.citta_intro?.storia) intro.push(`La storia. ${content.citta_intro.storia}`);
  if (content.citta_intro?.cultura_tradizioni) intro.push(`Cultura e tradizioni. ${content.citta_intro.cultura_tradizioni}`);
  if (content.citta_intro?.consigli_pratici) intro.push(`Consigli pratici. ${content.citta_intro.consigli_pratici}`);
  if (intro.length) chapters.push({ title: content.guida_titolo || 'Introduzione', text: intro.join('\n') });

  (content.giorni || []).forEach((giorno: any, i: number) => {
    const parts: string[] = [];
    const tema = giorno.tema_giorno || giorno.tema || '';
    parts.push(`Giorno ${giorno.giorno || i + 1}${tema ? `: ${tema}` : ''}.`);
    (giorno.pois || []).forEach((p: any) => {
      const chunk = [
        p.titolo ? `${p.titolo}.` : '',
        p.descrizione_lunga || '',
        p.dettaglio_storico_tecnico || '',
        p.consiglio_insider ? `Il consiglio della guida: ${p.consiglio_insider}` : '',
        Array.isArray(p.curiosita) && p.curiosita.length ? `Curiosità: ${p.curiosita.join('. ')}` : '',
      ].filter(Boolean).join(' ');
      if (chunk.trim()) parts.push(chunk);
    });
    if (parts.length > 1) chapters.push({ title: `Giorno ${giorno.giorno || i + 1}${tema ? ` · ${tema}` : ''}`, text: parts.join('\n') });
  });
  return chapters;
}

interface PremiumGuideAudiobookProps {
  content: PremiumGuideContent;
  language: Language;
  /** Hash della guida salvata in itinerary_guides: abilita gli strumenti post-acquisto */
  hash?: string;
  /** Il contenuto della guida è cambiato (traduzione/rigenerazione giorno): il chiamante aggiorna la vista */
  onContentUpdate?: (content: PremiumGuideContent) => void;
}

const TRANSLATE_LANGS: { code: string; label: string }[] = [
  { code: 'IT', label: 'Italiano' }, { code: 'EN', label: 'English' },
  { code: 'FR', label: 'Français' }, { code: 'ES', label: 'Español' },
  { code: 'DE', label: 'Deutsch' }, { code: 'RU', label: 'Русский' }, { code: 'ZH', label: '中文' },
];

export default function PremiumGuideAudiobook({ content, language, hash, onContentUpdate }: PremiumGuideAudiobookProps) {
  const chapters = useMemo(() => buildChapters(content), [content]);
  const [open, setOpen] = useState(false);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [blockIdx, setBlockIdx] = useState(0);
  const [blockCount, setBlockCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(0); // invalida le riproduzioni superate
  /** Il blocco corrente è letto dalla voce di sistema (server TTS giù). */
  const sysVoiceRef = useRef(false);
  const sysVoicePausedRef = useRef(false);

  /**
   * (29/08/2026) Il ripiego che non muore mai: se /api/tts/smart non risponde
   * il blocco viene letto dalla voce di sistema (TTS nativo sull'app, Web
   * Speech nel browser) invece di interrompere la lettura. Risolve a fine
   * lettura; false solo se il dispositivo non ha nessuna voce.
   */
  const leggiConVoceDiSistema = (testo: string, personaggio: 'nicky' | 'dante', session: number): Promise<boolean> =>
    new Promise<boolean>(resolve => {
      sysVoiceRef.current = true;
      speakWithSystemVoice(testo, String(language), personaggio, () => {
        sysVoiceRef.current = false;
        resolve(sessionRef.current === session);
      }).then(ok => { if (!ok) { sysVoiceRef.current = false; resolve(false); } });
    });

  // ── Strumenti post-acquisto ──
  const [ivState, setIvState] = useState<'idle' | 'confirm' | 'loading' | 'playing'>('idle');
  const [ivGuest, setIvGuest] = useState('');
  const [ivSeg, setIvSeg] = useState({ cur: 0, tot: 0 });
  const [epubBusy, setEpubBusy] = useState(false);
  const [trLang, setTrLang] = useState('EN');
  const [trState, setTrState] = useState<'idle' | 'confirm' | 'loading'>('idle');
  const [regenDay, setRegenDay] = useState(0);
  const [regenBusy, setRegenBusy] = useState(false);

  const stop = () => {
    sessionRef.current++;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (sysVoiceRef.current) { sysVoiceRef.current = false; sysVoicePausedRef.current = false; stopSystemVoice(); }
    setPlaying(false);
    setLoading(false);
    setActiveChapter(null);
    setIvState(s => (s === 'loading' || s === 'playing') ? 'idle' : s);
  };

  useEffect(() => () => stop(), []);

  const playChapter = async (ci: number) => {
    stop();
    const session = ++sessionRef.current;
    const blocks = splitBlocks(chapters[ci].text);
    if (!blocks.length) return;
    setActiveChapter(ci);
    setBlockCount(blocks.length);
    const voice = VOICE_BY_LANG[String(language)] || VOICE_BY_LANG.IT;

    for (let b = 0; b < blocks.length; b++) {
      if (sessionRef.current !== session) return; // interrotto
      setBlockIdx(b + 1);
      setLoading(true);
      try {
        // Il primo ascolto sintetizza (e paga la quota), poi è tutto in cache.
        // postForAudioBlob: su app nativa la fetch patchata da CapacitorHttp
        // decodifica il corpo binario come testo → MP3 da 0 byte; qui usa il
        // percorso CapacitorHttp con responseType 'blob'.
        const { ok, status, blob } = await postForAudioBlob(getApiUrl('/api/tts/smart'), { text: blocks[b], voice });
        if (!ok || !blob) throw new Error(`HTTP ${status}`);
        if (sessionRef.current !== session) return;
        const url = URL.createObjectURL(blob);
        const audio = audioRef.current || new Audio();
        audioRef.current = audio;
        audio.src = url;
        setLoading(false);
        setPlaying(true);
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => resolve();
          audio.onerror = () => reject(new Error('playback'));
          audio.play().catch(reject);
        });
        URL.revokeObjectURL(url);
      } catch {
        if (sessionRef.current !== session) return;
        // Server TTS giù: il blocco lo legge la voce di sistema, e si va avanti.
        setLoading(false);
        setPlaying(true);
        const letto = await leggiConVoceDiSistema(blocks[b], 'nicky', session);
        if (sessionRef.current !== session) return;
        if (!letto) {
          notify('Lettura interrotta: riprova tra qualche istante.');
          stop();
          return;
        }
      }
    }
    if (sessionRef.current === session) {
      setPlaying(false);
      setActiveChapter(null);
    }
  };

  const togglePause = () => {
    if (sysVoiceRef.current) {
      // Voce di sistema: pausa/ripresa di ttsService (il TTS nativo rilegge
      // il blocco da capo alla ripresa, Web Speech riprende dal punto).
      if (sysVoicePausedRef.current) { sysVoicePausedRef.current = false; resumeSystemVoice(); setPlaying(true); }
      else { sysVoicePausedRef.current = true; pauseSystemVoice(); setPlaying(false); }
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().catch(() => {}); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  // Riproduce un blob audio sul player condiviso, rispettando la sessione.
  const playBlob = async (blob: Blob, session: number): Promise<void> => {
    if (sessionRef.current !== session) return;
    const url = URL.createObjectURL(blob);
    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    audio.src = url;
    try {
      await new Promise<void>((resolve, reject) => {
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error('playback'));
        audio.play().catch(reject);
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // ── «Intervista impossibile»: Nicky + personaggio storico, due voci ──
  // Stesso prezzo del podcast giornaliero; la generazione (testo) è cachata
  // server-side per (città, personaggio, lingua), i segmenti TTS su storage.
  const playImpossibleInterview = async () => {
    if (ivState === 'loading' || ivState === 'playing') return;
    if (ivState === 'idle') { setIvState('confirm'); return; }
    stop();
    const session = ++sessionRef.current;
    setIvState('loading');
    try {
      const destination = content.citta_intro?.titolo || content.guida_titolo || '';
      const pois = (content.giorni || []).flatMap(g => g.pois || []).map(p => ({ name: p.titolo })).slice(0, 8);
      const res = await fetch(getApiUrl('/api/podcast/impossible-interview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({ destination, pois, language }),
      });
      if (res.status === 401) { notify('Accedi per generare l’intervista.'); setIvState('idle'); return; }
      if (res.status === 402) { notify('Crediti insufficienti per l’intervista.'); setIvState('idle'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      notifyCreditsChanged();
      const segments: { speaker: string; text: string }[] = data.segments || [];
      if (!segments.length) throw new Error('no_segments');
      setIvGuest(data.character || '');
      setIvSeg({ cur: 0, tot: segments.length });
      setIvState('playing');
      // Le due voci esistenti: Nicky (femminile) e la voce "dante" (maschile)
      const nickyVoice = azureVoiceName(String(language), 'nicky');
      const guestVoice = azureVoiceName(String(language), 'dante');
      for (let i = 0; i < segments.length; i++) {
        if (sessionRef.current !== session) return;
        setIvSeg({ cur: i + 1, tot: segments.length });
        const voice = segments[i].speaker === 'NICKY' ? nickyVoice : guestVoice;
        // Segmenti brevi (battute 1-3 frasi): un file TTS per battuta,
        // riprodotti in sequenza come già fa l'audiolibro a blocchi.
        const { ok, blob } = await postForAudioBlob(getApiUrl('/api/tts/smart'), { text: segments[i].text, voice });
        if (ok && blob && blob.size >= 500) {
          await playBlob(blob, session);
        } else {
          // Server TTS giù: la battuta la legge la voce di sistema, col
          // genere del personaggio; solo senza nessuna voce si interrompe.
          const letto = await leggiConVoceDiSistema(segments[i].text, segments[i].speaker === 'NICKY' ? 'nicky' : 'dante', session);
          if (!letto) throw new Error('tts');
        }
      }
      if (sessionRef.current === session) setIvState('idle');
    } catch (e) {
      console.error('[Intervista] errore:', e);
      if (sessionRef.current === session) {
        notify('Intervista interrotta: riprova tra qualche istante.');
        setIvState('idle');
      }
    }
  };

  // ── Export EPUB (gratuito: contenuto già pagato) ──
  const handleEpub = async () => {
    if (!hash || epubBusy) return;
    setEpubBusy(true);
    try {
      const ok = await downloadGuideAsEpub(hash, content.guida_titolo, String(language));
      if (!ok) notify('Export EPUB non riuscito. Riprova.');
    } catch {
      notify('Export EPUB non riuscito. Riprova.');
    } finally {
      setEpubBusy(false);
    }
  };

  // ── Traduzione della guida acquistata (metà prezzo) ──
  const translateCost = Math.round((PRICING_LIST.premium_guide_daily * Math.max(1, (content.giorni || []).length)) / 2);
  const handleTranslate = async () => {
    if (!hash || trState === 'loading') return;
    if (trState === 'idle') { setTrState('confirm'); return; }
    setTrState('loading');
    try {
      const res = await fetch(getApiUrl('/api/premium-guide/translate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({ hash, targetLanguage: trLang }),
      });
      if (res.status === 401) { notify('Accedi per tradurre la guida.'); setTrState('idle'); return; }
      if (res.status === 402) { notify('Crediti insufficienti per la traduzione.'); setTrState('idle'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      notifyCreditsChanged();
      if (data?.content) {
        // Copia offline della traduzione (hash derivato) + aggiornamento vista
        saveGuideLocally({ content: data.content, media_manifest: data.media_manifest || {}, hash: data.hash || `${hash}_tr_${trLang}`, fromCache: false }).catch(() => {});
        onContentUpdate?.(data.content);
        notify(data.cached ? 'Traduzione già disponibile: nessun addebito.' : 'Guida tradotta!');
      }
      setTrState('idle');
    } catch (e) {
      console.error('[Traduzione guida] errore:', e);
      notify('Traduzione non riuscita: nessun credito perso, riprova.');
      setTrState('idle');
    }
  };

  // ── Rigenerazione GRATUITA di un singolo giorno (guida già pagata) ──
  const handleRegenDay = async () => {
    if (!hash || regenBusy) return;
    setRegenBusy(true);
    try {
      const res = await fetch(getApiUrl('/api/premium-guide/regenerate-day'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getAccessToken()}` },
        body: JSON.stringify({ hash, dayIndex: regenDay, language }),
      });
      if (res.status === 401) { notify('Accedi per aggiornare la guida.'); return; }
      if (res.status === 402) { notify('Guida non trovata: usa la generazione completa.'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.content) {
        // Aggiorna anche la copia offline (IndexedDB), altrimenti la
        // prossima apertura ripescherebbe il giorno vecchio dalla cache locale.
        saveGuideLocally({ content: data.content, media_manifest: data.media_manifest || {}, hash, fromCache: false }).catch(() => {});
        onContentUpdate?.(data.content);
        notify(`Giorno ${(content.giorni?.[regenDay]?.giorno) ?? regenDay + 1} aggiornato (gratuito).`);
      }
    } catch (e) {
      console.error('[Rigenera giorno] errore:', e);
      notify('Aggiornamento del giorno non riuscito. Riprova.');
    } finally {
      setRegenBusy(false);
    }
  };

  if (chapters.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3"
      >
        <span className="flex items-center gap-2 font-black text-primary text-sm">
          <Headphones className="w-4 h-4" /> Audio-libro della guida
          <span className="text-[10px] font-bold text-gray-500">({chapters.length} capitoli)</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {chapters.map((ch, i) => {
            const isActive = activeChapter === i;
            return (
              <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${isActive ? 'bg-primary/5 border border-primary/20' : 'bg-[#f8f5f0]'}`}>
                <button
                  onClick={() => isActive ? togglePause() : playChapter(i)}
                  className="w-9 h-9 shrink-0 rounded-full bg-primary text-white flex items-center justify-center active:scale-95 transition-transform"
                  aria-label={isActive ? 'Pausa' : `Ascolta ${ch.title}`}
                >
                  {isActive && loading ? <Loader2 className="w-4 h-4 animate-spin" />
                    : isActive && playing ? <Pause className="w-4 h-4" />
                    : <Play className="w-4 h-4 translate-x-[1px]" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-primary truncate">{ch.title}</p>
                  <p className="text-[10px] text-gray-500">
                    {isActive
                      ? (loading ? `Preparo la voce… (${blockIdx}/${blockCount})` : `In ascolto · parte ${blockIdx} di ${blockCount}`)
                      : `~${Math.max(1, Math.round(ch.text.length / 900))} min`}
                  </p>
                </div>
                {isActive && (
                  <button onClick={stop} className="p-2 text-red-500 hover:text-red-600" aria-label="Ferma la lettura">
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                )}
              </div>
            );
          })}
          <p className="text-[10px] text-gray-500 px-1 pt-1">
            La prima lettura di ogni capitolo genera la voce (qualche secondo); le successive partono all'istante.
          </p>

          {/* ── «Intervista impossibile» ── */}
          <div className={`flex items-center gap-3 rounded-xl px-3 py-2 ${ivState !== 'idle' ? 'bg-amber-500/5 border border-amber-500/30' : 'bg-[#f8f5f0]'}`}>
            <button
              onClick={() => (ivState === 'playing' || ivState === 'loading') ? togglePause() : playImpossibleInterview()}
              className="w-9 h-9 shrink-0 rounded-full bg-amber-600 text-white flex items-center justify-center active:scale-95 transition-transform"
              aria-label="Intervista impossibile"
            >
              {ivState === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-primary truncate">🎙️ Intervista impossibile</p>
              <p className="text-[10px] text-gray-500">
                {ivState === 'confirm' ? `Costa ${PRICING_LIST.podcast_daily} crediti: premi di nuovo per confermare`
                  : ivState === 'loading' ? 'Cerco l’ospite e scrivo l’intervista…'
                  : ivState === 'playing' ? `In onda con ${ivGuest || 'l’ospite'} · battuta ${ivSeg.cur}/${ivSeg.tot}`
                  : 'Nicky intervista un personaggio storico della tua destinazione'}
              </p>
            </div>
            {ivState === 'playing' && (
              <button onClick={stop} className="p-2 text-red-500 hover:text-red-600" aria-label="Ferma l'intervista">
                <Square className="w-4 h-4 fill-current" />
              </button>
            )}
          </div>

          {/* ── Strumenti sulla guida salvata (solo con hash) ── */}
          {hash && (
            <div className="space-y-1.5 pt-1">
              {/* EPUB gratuito */}
              <button
                onClick={handleEpub}
                disabled={epubBusy}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-2 bg-[#f8f5f0] hover:bg-primary/5 transition-colors disabled:opacity-60"
              >
                <span className="w-9 h-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  {epubBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-xs font-black text-primary">📖 Scarica EPUB</span>
                  <span className="block text-[10px] text-gray-500">Gratuito: il contenuto è già tuo</span>
                </span>
              </button>

              {/* Traduzione a metà prezzo */}
              <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-[#f8f5f0]">
                <span className="w-9 h-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  {trState === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-primary">🌍 Traduci in…</p>
                  <p className="text-[10px] text-gray-500">
                    {trState === 'confirm' ? `Costa ${translateCost} crediti (metà prezzo): conferma`
                      : trState === 'loading' ? 'Traduco la guida a blocchi…'
                      : `Metà prezzo (${translateCost} crediti); già tradotta = gratis`}
                  </p>
                </div>
                <select
                  value={trLang}
                  onChange={e => { setTrLang(e.target.value); setTrState('idle'); }}
                  disabled={trState === 'loading'}
                  className="text-[11px] font-bold text-primary bg-white border border-gray-200 rounded-lg px-1.5 py-1"
                  aria-label="Lingua di destinazione"
                >
                  {TRANSLATE_LANGS.filter(l => l.code !== String(language)).map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
                <button
                  onClick={handleTranslate}
                  disabled={trState === 'loading'}
                  className={`text-[11px] font-black px-2.5 py-1.5 rounded-lg text-white ${trState === 'confirm' ? 'bg-amber-600' : 'bg-primary'} disabled:opacity-60`}
                >
                  {trState === 'confirm' ? 'Conferma' : 'Traduci'}
                </button>
              </div>

              {/* Rigenerazione gratuita di un giorno */}
              {(content.giorni || []).length > 0 && (
                <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-[#f8f5f0]">
                  <span className="w-9 h-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    {regenBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-primary">Hai cambiato l'itinerario?</p>
                    <p className="text-[10px] text-gray-500">Rigenera solo quel giorno: gratis, guida già pagata</p>
                  </div>
                  <select
                    value={regenDay}
                    onChange={e => setRegenDay(Number(e.target.value))}
                    disabled={regenBusy}
                    className="text-[11px] font-bold text-primary bg-white border border-gray-200 rounded-lg px-1.5 py-1"
                    aria-label="Giorno da aggiornare"
                  >
                    {(content.giorni || []).map((g, i) => (
                      <option key={i} value={i}>Giorno {g.giorno ?? i + 1}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleRegenDay}
                    disabled={regenBusy}
                    className="text-[11px] font-black px-2.5 py-1.5 rounded-lg bg-primary text-white disabled:opacity-60"
                  >
                    Aggiorna
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
