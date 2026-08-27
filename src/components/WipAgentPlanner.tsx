// =====================================================================
// WIP · "🧭 Parla con WIP" — l'itinerario si costruisce conversando.
//
// WIP è l'agente di viaggio dell'app — lo stesso nome che l'utente vede in
// tutte le altre modalità e nella chat dei POI: un'identità sola, nessun
// personaggio nuovo (decisione utente 23/08/2026). Qui si parla o si
// scrive: WIP ascolta, chiede quello che manca — una domanda per volta —
// e quando ha capito restituisce i PARAMETRI DEL FORM STANDARD. La
// generazione vera NON avviene in questo componente: `onReady` li consegna
// a PlanScreen, che riempie il form "Itinerario su misura" e lancia lo
// stesso flusso di sempre (geocodifica, conferma crediti, cache condivisa,
// streaming, verifica anti-allucinazione). Così l'agente non è un
// generatore parallelo da tenere allineato: è una bocca diversa per lo
// stesso motore.
//
// Voce: microfono con la Web Speech API (come AgentControls), e WIP legge
// le sue risposte con speechSynthesis quando il browser ce l'ha. Niente
// costi TTS cloud per una chat: la voce nativa basta.
// =====================================================================
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, Mic, Send, Loader2, Volume2, VolumeX, Sparkles, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { Language, getTranslation } from '../lib/i18n';
import { notify } from '../lib/toast';
import { pickVoice } from '../services/ttsService';

/** I parametri che l'agente consegna: sono ESATTAMENTE gli stati del form. */
export interface WipAgentParams {
  destination: string;
  days: number;
  month: string;
  interests: string[];
  budget: 'economico' | 'standard' | 'lusso';
  ritmo: 'rilassato' | 'standard' | 'intenso';
  viaggiatori: 'solo' | 'coppia' | 'famiglia' | 'gruppo';
  soloGratis: boolean;
  startTime: string;
  endTime: string;
  specialRequests: string;
}

interface Msg { role: 'user' | 'assistant'; content: string }

/** BCP-47 per riconoscimento e sintesi: la lingua UI è a due lettere. */
const SPEECH_LANG: Record<string, string> = {
  IT: 'it-IT', EN: 'en-US', FR: 'fr-FR', ES: 'es-ES', DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN',
};

export default function WipAgentPlanner({
  language,
  onClose,
  onReady,
}: {
  language: Language;
  onClose: () => void;
  /** WIP ha capito: ecco i parametri. PlanScreen genera col flusso standard. */
  onReady: (params: WipAgentParams) => void;
}) {
  const t = (k: string) => getTranslation(k, language);
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', content: t('wip_agent_intro') }]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<WipAgentParams | null>(null);
  // WIP parla di default: è il senso della modalità. Si può spegnere, e la
  // scelta resta (chi è in treno non vuole la voce ogni volta).
  const [voiceOn, setVoiceOn] = useState<boolean>(() => {
    try { return localStorage.getItem('wip_agent_voice') !== '0'; } catch { return true; }
  });
  const listRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try { localStorage.setItem('wip_agent_voice', voiceOn ? '1' : '0'); } catch { /* niente */ }
  }, [voiceOn]);

  // Scroll in fondo a ogni messaggio nuovo.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  // WIP legge ad alta voce le proprie risposte (non l'intro al montaggio:
  // partire a parlare da soli all'apertura è invadente, e alcuni browser
  // bloccano comunque l'audio senza un gesto dell'utente).
  const speak = (text: string) => {
    if (!voiceOn) return;
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH_LANG[language] || 'it-IT';
      const v = pickVoice(language.toLowerCase(), 'nicky');
      if (v) u.voice = v;
      u.rate = 1.0;
      window.speechSynthesis.speak(u);
    } catch { /* la voce è un di più: mai rompere la chat */ }
  };
  const stopSpeaking = () => {
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch { /* niente */ }
  };
  useEffect(() => () => stopSpeaking(), []);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || thinking) return;
    setError(null);
    setReady(null);
    stopSpeaking();
    const next: Msg[] = [...messages, { role: 'user', content: clean }];
    setMessages(next);
    setInput('');
    setThinking(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) { setError(t('wip_agent_login_required')); return; }
      const res = await fetch(getApiUrl('/api/itinerary/converse'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // L'intro è testo nostro, non serve al modello: si manda solo il
        // dialogo vero.
        body: JSON.stringify({ messages: next.slice(1), language }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) { setError(t('wip_agent_login_required')); return; }
      if (!res.ok || typeof data?.reply !== 'string') { setError(data?.error || t('wip_agent_error')); return; }
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      speak(data.reply);
      if (data.ready && data.params) setReady(data.params as WipAgentParams);
    } catch {
      setError(t('wip_agent_error'));
    } finally {
      setThinking(false);
    }
  };

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { notify(t('wip_agent_mic_unsupported')); inputRef.current?.focus(); return; }
    if (listening) {
      try { recognitionRef.current?.stop(); } catch { /* niente */ }
      setListening(false);
      return;
    }
    stopSpeaking(); // WIP tace quando l'utente parla
    const rec = new SR();
    rec.lang = SPEECH_LANG[language] || 'it-IT';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (ev: any) => {
      const transcript = String(ev.results?.[0]?.[0]?.transcript || '').trim();
      setListening(false);
      // Quello che si dice a voce parte subito: il microfono è già la
      // conferma, chiedere anche "invio" è un passo in più.
      if (transcript) void send(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  return (
    <motion.div
      key="wip-agent"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col bg-white rounded-3xl border border-outline-variant/30 shadow-sm overflow-hidden"
      style={{ minHeight: '60vh', maxHeight: '78vh' }}
    >
      {/* Testata */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/20 bg-gradient-to-r from-amber-50 to-orange-50 shrink-0">
        <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center overflow-hidden shrink-0">
          {/* Stesso avatar della chat dei POI: è lo stesso agente. */}
          <img src="/avatar.png" alt="WIP" className="w-full h-full object-cover p-0.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-black text-primary text-base leading-tight">{t('wip_agent_title')}</h3>
          <p className="text-[11px] font-bold text-gray-500 truncate">{t('wip_agent_subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => { if (voiceOn) stopSpeaking(); setVoiceOn(v => !v); }}
          aria-pressed={voiceOn}
          aria-label={voiceOn ? t('wip_agent_voice_on') : t('wip_agent_voice_off')}
          title={voiceOn ? t('wip_agent_voice_on') : t('wip_agent_voice_off')}
          className={`p-2 rounded-full border transition ${voiceOn ? 'bg-primary text-white border-primary' : 'bg-white text-gray-400 border-outline-variant/30'}`}
        >
          {voiceOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
        <button type="button" onClick={() => { stopSpeaking(); onClose(); }} aria-label={getTranslation('close', language)} className="p-2 rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Conversazione */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-snug ${
              m.role === 'user'
                ? 'bg-primary text-white rounded-br-md'
                : 'bg-surface-container-low text-gray-800 rounded-bl-md'
            }`}>
              {m.content}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-surface-container-low text-gray-500 text-xs font-bold flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('wip_agent_thinking')}
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-[11px] font-bold text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
        )}
        {ready && !thinking && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => { stopSpeaking(); onReady(ready); }}
              className="flex items-center gap-2 px-5 py-3 min-h-[44px] bg-primary text-white rounded-2xl font-black text-sm shadow-md hover:shadow-lg transition"
            >
              <Sparkles className="w-4 h-4" /> {t('wip_agent_ready_cta')}
            </button>
            <button
              type="button"
              onClick={() => { setReady(null); inputRef.current?.focus(); }}
              className="flex items-center gap-2 px-4 py-3 min-h-[44px] bg-white text-primary border border-outline-variant/40 rounded-2xl font-black text-sm"
            >
              <Pencil className="w-4 h-4" /> {t('wip_agent_ready_edit')}
            </button>
          </div>
        )}
      </div>

      {/* Input: microfono + testo */}
      <form
        onSubmit={(e) => { e.preventDefault(); void send(input); }}
        className="flex items-center gap-2 px-3 py-3 border-t border-outline-variant/20 bg-white shrink-0"
      >
        <button
          type="button"
          onClick={toggleMic}
          aria-pressed={listening}
          aria-label={t('wip_agent_listening')}
          className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 border transition ${
            listening ? 'bg-red-500 text-white border-red-500 animate-pulse' : 'bg-white text-primary border-outline-variant/40 hover:border-primary/50'
          }`}
        >
          <Mic className="w-5 h-5" />
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={listening ? t('wip_agent_listening') : t('wip_agent_placeholder')}
          disabled={thinking}
          className={`flex-1 min-w-0 px-4 py-3 rounded-2xl border text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 ${
            listening ? 'border-red-300 bg-red-50 placeholder-red-400' : 'border-outline-variant/30 bg-surface-container-low'
          }`}
        />
        <button
          type="submit"
          disabled={thinking || !input.trim()}
          aria-label={t('wip_agent_send')}
          className="w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shrink-0 disabled:opacity-40"
        >
          {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </motion.div>
  );
}
