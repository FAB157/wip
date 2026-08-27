import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Loader2, Info, X, Bot, User, Mic, Coins, Volume2, VolumeX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PRICING_LIST, getWalletBalance } from '../lib/pricing';
import { notify } from '../lib/toast';
import CreditConfirmationModal from './CreditConfirmationModal';
import { getTranslation, type Language } from '../lib/i18n';
import { speakAudioguide, stopSpeech } from '../services/ttsService';
import { getGuideCharacter } from '../lib/guideSettings';

interface AgentControlsProps {
  itineraryId: string;
  userId?: string;
  status: string; // 'active', 'optimizing'
  chatHistory?: { role: 'user' | 'assistant', content: string }[];
  language?: string;
  onClose?: () => void;
  initialMessage?: string;
}

export default function AgentControls({ itineraryId, userId, status, chatHistory, language = 'IT', onClose, initialMessage }: AgentControlsProps) {
  // Tutte le stringhe visibili passano dal dizionario (23/08/2026: la chat
  // era in italiano cablato per gli utenti EN/FR/ES/DE/RU/ZH).
  const tr = (k: string) => getTranslation(k, String(language || 'IT').toUpperCase() as Language);
  const [customEvent, setCustomEvent] = useState(initialMessage || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Credit & Message Limit Logic
  // L'AUTORITÀ è il server (/api/optimize-itinerary): contatore e addebito
  // vivono lì (metadata itinerario / user_chat_sessions) e ogni risposta
  // riporta `messagesLeft`, che qui viene solo specchiato per la UI.
  // Ogni itinerario include 10 messaggi gratis; la chat POI/generale parte
  // dal pacchetto da 3 crediti / 10 messaggi.
  const [messagesLeft, setMessagesLeft] = useState(() => {
    const stored = localStorage.getItem(`wip_chat_limit_${itineraryId}`);
    if (stored !== null) return parseInt(stored, 10) || 0;
    return itineraryId !== 'general' ? 10 : 0;
  });
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [currentBalance, setCurrentBalance] = useState(0);

  useEffect(() => {
    localStorage.setItem(`wip_chat_limit_${itineraryId}`, messagesLeft.toString());
  }, [messagesLeft, itineraryId]);

  // WIP RISPONDE A VOCE (23/08/2026: "wip non parla, scrive"). Due modi:
  // - la domanda e' stata DETTATA col microfono → la risposta si legge da sola;
  // - interruttore 🔊 nell'header → si leggono tutte le risposte.
  // Stesso canale delle audioguide (speakAudioguide: Azure neural, ripiego
  // sulla voce di sistema; su nativo passa dal TTS nativo).
  const [voceAttiva, setVoceAttiva] = useState(() => {
    try { return localStorage.getItem('wip_chat_voce') === '1'; } catch { return false; }
  });
  const voceAttivaRef = useRef(voceAttiva);
  useEffect(() => {
    voceAttivaRef.current = voceAttiva;
    try { localStorage.setItem('wip_chat_voce', voceAttiva ? '1' : '0'); } catch { /* pieno */ }
  }, [voceAttiva]);
  /** L'ultimo messaggio e' arrivato dal microfono: la risposta va letta. */
  const dettatoRef = useRef(false);

  const leggiRisposta = (testo: string) => {
    if (!dettatoRef.current && !voceAttivaRef.current) return;
    // Via markdown e link: "**" e URL letti ad alta voce sono rumore.
    const pulito = String(testo)
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[*_#`>]/g, '')
      .replace(/\s+/g, ' ').trim();
    if (pulito) void speakAudioguide(pulito, (language || 'IT').toLowerCase(), getGuideCharacter());
  };

  // MICROFONO: UN'ISTANZA SOLA, in un ref. Prima `new SpeechRecognition()`
  // stava nel corpo del componente: ogni render ne creava una nuova, e lo
  // "stop" finiva sull'istanza dell'ultimo render — mai avviata — mentre
  // quella avviata restava viva col microfono occupato (l'icona "in uso"
  // che non si spegne, 23/08/2026).
  const recRef = useRef<any>(null);
  const getRecognition = () => {
    if (recRef.current) return recRef.current;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) {
        dettatoRef.current = true; // la risposta a una domanda dettata si legge
        setCustomEvent((prev) => prev ? `${prev} ${transcript}` : transcript);
      }
      setIsListening(false);
    };
    r.onerror = (event: any) => {
      console.error('Speech recognition error', event?.error);
      setIsListening(false);
    };
    r.onend = () => setIsListening(false);
    recRef.current = r;
    return r;
  };

  // Alla chiusura del componente il riconoscimento va ABORTITO e la voce
  // fermata, o il microfono resta occupato a chat chiusa.
  useEffect(() => () => {
    try { recRef.current?.abort?.(); } catch { /* gia' fermo */ }
    stopSpeech();
  }, []);

  const SPEECH_LANGS: Record<string, string> = { it: 'it-IT', en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', ru: 'ru-RU', zh: 'zh-CN' };

  const handleMicrophoneClick = () => {
    const recognition = getRecognition();
    if (!recognition) {
      notify(tr('chat_mic_unsupported'));
      return;
    }

    if (isListening) {
      // stop() consegna l'eventuale parlato gia' captato (onresult), poi onend.
      try { recognition.stop(); } catch { /* gia' fermo */ }
      setIsListening(false);
      return;
    }

    // La lingua del riconoscimento segue la UI (prima era it-IT fisso).
    recognition.lang = SPEECH_LANGS[(language || 'IT').toLowerCase().slice(0, 2)] || 'it-IT';
    setIsListening(true);
    if (!isExpanded) setIsExpanded(true);
    try {
      recognition.start();
    } catch {
      // start() su un'istanza gia' avviata lancia: si riparte pulito.
      try { recognition.abort(); } catch { /* niente */ }
      setIsListening(false);
    }
  };
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>(
    chatHistory && chatHistory.length > 0 ? chatHistory : [
      { 
        role: 'assistant', 
        content: getTranslation(itineraryId === 'general' ? 'chat_welcome_general' : 'chat_welcome_itinerary', String(language || 'IT').toUpperCase() as Language)
      }
    ]
  );

  useEffect(() => {
    if (initialMessage && messages.length === 1 && itineraryId === 'general') {
      handleSendEvent(initialMessage);
    }
  }, [initialMessage]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatHistory && chatHistory.length > 0) {
      setMessages(chatHistory);
    }
  }, [chatHistory]);

  const isOptimizing = status === 'optimizing' || isLoading;

  useEffect(() => {
    if (isExpanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isExpanded]);

  // skipGate: usato da confirmPurchase, che chiama subito dopo l'acquisto —
  // nella closure di quel render messagesLeft vale ancora 0 e senza il flag
  // si riapriva il modale addebitando i 3 crediti una seconda volta.
  const handleSendEvent = async (eventMessage: string, skipGate = false) => {
    if (!eventMessage.trim() || isOptimizing) return;

    // Check if we have messages left or need to buy a new session
    if (messagesLeft <= 0 && !skipGate) {
      if (!userId) {
        // Prima: return silenzioso — la chat sembrava morta per gli anonimi
        setMessages(prev => [...prev, { role: 'assistant', content: tr('chat_login_required') }]);
        return;
      }
      const bal = await getWalletBalance(userId);
      setCurrentBalance(bal.total);
      setShowCreditModal(true);
      return;
    }

    const userMsg = { role: 'user' as const, content: eventMessage.trim() };
    setMessages(prev => [...prev, userMsg]);
    setCustomEvent('');
    setIsExpanded(true);
    setIsLoading(true);
    // Il messaggio si consuma solo quando la risposta arriva davvero
    // (prima si scalava PRIMA della fetch: anche un errore di rete bruciava
    // un messaggio pagato).

    try {
      // Get current location if possible to help the agent
      let currentLocation = null;
      if (navigator.geolocation) {
         try {
           const pos = await Promise.race([
             new Promise<GeolocationPosition>((resolve, reject) => {
               navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 60000 });
             }),
             new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
           ]);
           currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
         } catch(e) {
           console.log("Location not available for agent");
         }
      }

      // Token di sessione: il server verifica la proprietà dell'itinerario
      // sull'utente autenticato, non più sullo userId dichiarato nel body
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const res = await fetch('/api/optimize-itinerary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          itineraryId,
          eventMessage,
          chatHistory: messages,
          safeUserId: userId,
          currentLocation,
          language,
          // skipGate = arrivo dalla conferma del modale: autorizza il server
          // ad addebitare i 3 crediti e ricaricare 10 messaggi
          confirmPurchase: skipGate
        })
      });

      // Cancello server: 402 = messaggi esauriti (mostra il modale) o crediti
      // insufficienti; 401 = serve il login. Il messaggio utente viene rimosso
      // dalla UI perché non è mai stato elaborato.
      if (res.status === 402) {
        const info = await res.json().catch(() => ({} as any));
        setMessages(prev => prev.slice(0, -1));
        setIsLoading(false);
        if (info?.error === 'insufficient_credits') {
          notify(tr('chat_no_credits'));
        } else if (userId) {
          setCustomEvent(eventMessage);
          const bal = await getWalletBalance(userId);
          setCurrentBalance(bal.total);
          setMessagesLeft(0);
          setShowCreditModal(true);
        }
        return;
      }
      if (res.status === 401) {
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant' as const, content: tr('chat_login_required') }]);
        setIsLoading(false);
        return;
      }
      if (!res.ok) {
        throw new Error('Server or timeout error');
      }

      const data = await res.json();
      // Il contatore vero arriva dal server
      if (typeof data.messagesLeft === 'number') {
        setMessagesLeft(Math.max(0, data.messagesLeft));
      } else {
        setMessagesLeft(prev => Math.max(0, prev - 1));
      }

      if (data.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
        leggiRisposta(data.message);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: tr('chat_updated_itinerary') }]);
        leggiRisposta(tr('chat_updated_itinerary'));
      }
      dettatoRef.current = false;

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: tr('chat_error_connection') }]);
      try {
        if (itineraryId !== 'general') {
          await supabase.from('itineraries').update({ status: 'active' }).eq('id', itineraryId);
        }
      } catch (e) {}
    } finally {
      setIsLoading(false);
    }
  };

  const confirmPurchase = async () => {
    if (!userId) return;
    // L'ADDEBITO avviene sul SERVER (RPC atomica consume_credits) quando il
    // messaggio riparte con confirmPurchase=true: qui si chiude solo il modale.
    // Prima il client scalava i crediti da solo e il server non controllava
    // nulla: un client modificato chattava gratis.
    setShowCreditModal(false);
    if (customEvent) handleSendEvent(customEvent, true);
  };

  return (
    <>
      <CreditConfirmationModal
        isOpen={showCreditModal}
        onClose={() => setShowCreditModal(false)}
        onConfirm={confirmPurchase}
        cost={PRICING_LIST.chat_session}
        currentBalance={currentBalance}
        serviceName={tr('chat_service_name')}
        onBuyCredits={() => {}}
        language={language as any}
      />

      {/* Overlay Modal for Info */}
      <AnimatePresence>
        {showInfo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowInfo(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setShowInfo(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-black flex items-center justify-center overflow-hidden">
                  <img src="/avatar.png" alt="WIP" className="w-full h-full object-cover p-1" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">{tr('chat_info_title')}</h3>
              </div>
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>{tr('chat_info_b1t')}</strong> {tr('chat_info_b1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>{tr('chat_info_b2t')}</strong> {tr('chat_info_b2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>{tr('chat_info_b3t')}</strong> {tr('chat_info_b3')}</span>
                </li>
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Bar / Expanded Chat */}
      {/* bottom: BottomNav è alta 4rem + safe-area (vedi BottomNav.tsx) — qui
          serve un margine reale sopra, non 8px: con la tastiera software o
          differenze di viewport mobile la barra finiva nascosta sotto il
          menu, mic e invio inclusi (non cliccabili). */}
      <motion.div
        layout
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`fixed left-1/2 -translate-x-1/2 w-[95%] max-w-md rounded-3xl border border-gray-100/50 z-[1000] overflow-hidden flex flex-col transition-all duration-300 ${
        isExpanded ? 'bg-white shadow-2xl bottom-[calc(6rem+env(safe-area-inset-bottom))] h-[65vh]' : 'bg-white/60 backdrop-blur-xl shadow-lg bottom-[calc(6rem+env(safe-area-inset-bottom))] p-1.5'
      }`}
      >
        {/* Expanded Header */}
        {isExpanded && (
          <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center overflow-hidden">
                <img src="/avatar.png" alt="WIP" className="w-full h-full object-cover p-0.5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-gray-800 leading-none">WIP</span>
                <span className="text-[9px] font-black text-primary uppercase tracking-widest mt-1">
                  {messagesLeft > 0
                    ? tr('chat_messages_left').replace('{n}', String(messagesLeft))
                    : itineraryId !== 'general'
                      ? tr('chat_included_exhausted').replace('{c}', String(PRICING_LIST.chat_session))
                      : tr('chat_price_for_messages').replace('{c}', String(PRICING_LIST.chat_session))}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* 🔊 = WIP legge OGNI risposta; spento, legge solo quelle a domande dettate. */}
              <button
                onClick={() => { const on = !voceAttiva; setVoceAttiva(on); if (!on) stopSpeech(); }}
                className={voceAttiva ? 'text-primary' : 'text-gray-400 hover:text-primary'}
                title={voceAttiva ? tr('chat_voice_replies_on') : tr('chat_voice_replies_off')}
              >
                {voceAttiva ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <button onClick={() => setShowInfo(true)} className="text-primary hover:text-primary/80">
                <Info className="w-5 h-5" />
              </button>
              <button onClick={() => { setIsExpanded(false); stopSpeech(); try { recRef.current?.abort?.(); } catch { /* fermo */ } setIsListening(false); if (onClose) onClose(); }} className="text-gray-400 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {/* Chat Messages Area (only visible when expanded) */}
        {isExpanded && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
            {messages.length === 0 && !isOptimizing && (
              <div className="text-center text-gray-500 text-sm mt-10">
                {tr('chat_empty_hint')}
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-primary text-white rounded-tr-sm' 
                    : 'bg-white border border-gray-100 text-gray-800 shadow-sm rounded-tl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {isOptimizing && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2 text-primary text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="animate-pulse">{tr('chat_thinking')}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input Area (always visible, style changes based on expansion) */}
        <div className={`flex items-center gap-2 ${isExpanded ? 'bg-white p-3 border-t border-gray-100' : 'bg-transparent pl-1'}`}>
          {!isExpanded && (
            <div className="flex items-center pl-1 gap-2 cursor-pointer" onClick={() => setIsExpanded(true)}>
              <div className="w-9 h-9 rounded-full bg-black flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg border border-white/20">
                <img src="/avatar.png" alt="WIP" className="w-full h-full object-cover p-0.5" />
              </div>
            </div>
          )}
          
          <div className="flex-1 relative flex items-center">
            <input 
              type="text" 
              value={customEvent}
              onChange={(e) => {
                setCustomEvent(e.target.value);
                dettatoRef.current = false; // riscritto a mano: niente lettura automatica
                if (!isExpanded) setIsExpanded(true);
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendEvent(customEvent); }}
              onFocus={() => !isExpanded && setIsExpanded(true)}
              placeholder={isListening ? tr('chat_listening') : isExpanded ? tr('chat_write_message') : tr('chat_ask_wip')}
              className={`w-full ${isExpanded ? 'bg-gray-50' : 'bg-white/50 placeholder-gray-600'} border-none rounded-full py-2 pl-4 ${isExpanded ? 'pr-20' : 'pr-10'} text-sm focus:ring-2 focus:ring-primary transition-colors ${isListening ? 'ring-2 ring-red-400 bg-red-50 placeholder-red-500' : ''}`}
            />
            
            <div className="absolute right-1 flex items-center gap-1">
              {!customEvent && !isListening && (
                <button 
                  onClick={handleMicrophoneClick}
                  className="w-8 h-8 rounded-full text-gray-400 hover:text-primary hover:bg-gray-100 flex items-center justify-center transition-colors"
                  title={tr('chat_speak_btn')}
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
              
              {isListening && (
                <button 
                  onClick={handleMicrophoneClick}
                  className="w-8 h-8 rounded-full bg-red-100 text-red-500 flex items-center justify-center animate-pulse"
                  title={tr('chat_stop_listening')}
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}

              {!customEvent && !isExpanded && !isListening && (
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowInfo(true); }}
                  className="w-8 h-8 rounded-full text-gray-400 hover:text-primary hover:bg-gray-100 flex items-center justify-center transition-colors"
                >
                  <Info className="w-5 h-5" />
                </button>
              )}

              {customEvent && (
                <button 
                  onClick={() => handleSendEvent(customEvent)}
                  disabled={isOptimizing}
                  className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition disabled:opacity-50"
                >
                  <Send className="w-4 h-4 ml-0.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
