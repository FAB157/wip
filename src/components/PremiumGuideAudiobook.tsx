import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Headphones, Play, Pause, Loader2, ChevronDown, ChevronUp, Square } from 'lucide-react';
import { getApiUrl } from '../lib/api';
import { postForAudioBlob } from '../lib/audioFetch';
import { notify } from '../lib/toast';
import type { PremiumGuideContent } from '../services/premiumGuideService';
import type { Language } from '../lib/i18n';

/**
 * Audio-libro della Guida d'Autore (ondata 4): la guida letta capitolo per
 * capitolo col motore TTS già esistente (/api/tts/smart, cache MD5 su
 * storage: il primo ascolto genera, i successivi sono gratis e istantanei).
 * I capitoli lunghi vengono spezzati in blocchi da ~2.300 caratteri letti in
 * sequenza, per restare nei limiti della sintesi vocale.
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

export default function PremiumGuideAudiobook({ content, language }: { content: PremiumGuideContent; language: Language }) {
  const chapters = useMemo(() => buildChapters(content), [content]);
  const [open, setOpen] = useState(false);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [blockIdx, setBlockIdx] = useState(0);
  const [blockCount, setBlockCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionRef = useRef(0); // invalida le riproduzioni superate

  const stop = () => {
    sessionRef.current++;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setPlaying(false);
    setLoading(false);
    setActiveChapter(null);
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
        if (sessionRef.current === session) {
          notify('Lettura interrotta: riprova tra qualche istante.');
          stop();
        }
        return;
      }
    }
    if (sessionRef.current === session) {
      setPlaying(false);
      setActiveChapter(null);
    }
  };

  const togglePause = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play().catch(() => {}); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
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
        </div>
      )}
    </div>
  );
}
