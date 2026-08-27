import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Radio, Users, CheckCircle, Copy, AlertTriangle, ArrowRight, Gift } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useLiveTour } from '../hooks/useLiveTour';
import { supabase } from '../lib/supabase';
import { getTranslation, linguaCorrente } from '../lib/i18n';

export default function LiveTourPanel() {
  // Nessuna prop `language`: si legge la stessa chiave localStorage di App.tsx.
  const lingua = linguaCorrente();
  const t = (k: string) => getTranslation(k, lingua);
  // Il broadcast del leader e il canale realtime vivono dentro useLiveTour a
  // livello di modulo: il tour resta attivo anche uscendo da questo tab.
  const { activeSession, isLeader, participantCount, loading, error, createSession, joinSession, leaveSession } = useLiveTour();
  const [pinInput, setPinInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [sessionUser, setSessionUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSessionUser(data.user));

    const params = new URLSearchParams(window.location.search);
    const urlPin = params.get('pin');
    if (urlPin) {
      setPinInput(urlPin);
      // Arrivo da link condiviso (?pin=XXXXXX): join automatico, senza
      // costringere l'ospite a ricopiare il PIN già presente nell'URL.
      if (!activeSession && urlPin.length >= 6) {
        joinSession(urlPin);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyLink = () => {
    if (!activeSession) return;
    // Su app nativa window.location.origin è capacitor://localhost: il link
    // condiviso non aprirebbe nulla per gli amici. Sempre l'URL pubblico.
    const base = Capacitor.isNativePlatform() ? 'https://wip.guide' : window.location.origin;
    const url = `${base}/?pin=${activeSession.pin}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (activeSession) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4">
            <Radio className="w-8 h-8 animate-pulse" />
          </div>
          <h2 className="text-xl font-black text-gray-900 mb-1">
            {isLeader ? t('vr_a_lt_leader_title') : t('vr_a_lt_follower_title')}
          </h2>
          <p className="text-sm font-bold text-gray-500 max-w-xs mb-6">
            {isLeader
              ? t('vr_a_lt_leader_desc')
              : t('vr_a_lt_follower_desc')}
          </p>

          <div className="bg-gray-50 p-4 rounded-2xl w-full flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">{t('vr_a_lt_group_pin')}</p>
              <p className="text-3xl font-black tracking-[0.2em] text-gray-900">{activeSession.pin}</p>
            </div>
            <button
              onClick={copyLink}
              className="w-12 h-12 bg-white rounded-xl shadow-sm text-gray-500 hover:text-blue-600 flex items-center justify-center transition-colors"
            >
              {copied ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>

          {/* Conteggio partecipanti reale via presence Realtime */}
          <div className="mt-4 flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full">
            <Users className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-wider" aria-live="polite">
              {participantCount <= 1
                ? t('vr_a_lt_only_you')
                : `${participantCount} ${t('vr_a_lt_participants')}`}
            </span>
          </div>

          {isLeader && (
            <p className="mt-3 text-[11px] font-bold text-gray-500 max-w-xs">
              {t('vr_a_lt_leader_note')}
            </p>
          )}

          <button 
            onClick={leaveSession}
            className="mt-6 px-6 py-3 bg-red-50 text-red-600 font-black text-xs uppercase tracking-widest rounded-full hover:bg-red-100 transition-colors"
          >
            {isLeader ? t('vr_a_lt_end_session') : t('vr_a_lt_leave_group')}
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-[2rem] text-white shadow-lg shadow-blue-900/20">
        <h2 className="text-2xl font-black mb-2 flex items-center gap-2">
          <Users className="w-6 h-6" /> Live Tour
        </h2>
        <p className="text-sm font-medium opacity-90 mb-8 max-w-sm">
          {t('vr_a_lt_intro')}
        </p>

        {/* Errore visibile: prima un PIN sbagliato non dava alcun feedback */}
        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-300/40 text-white p-3 rounded-2xl text-xs font-bold flex items-center gap-2" aria-live="polite">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="bg-white/10 p-5 rounded-3xl backdrop-blur-md">
            <h3 className="font-black text-sm mb-1 uppercase tracking-widest">{t('vr_a_lt_are_guide')}</h3>
            <p className="text-xs opacity-80 mb-4">{t('vr_a_lt_create_desc')}</p>
            <button 
              onClick={createSession}
              disabled={loading}
              className="w-full py-3 bg-white text-blue-600 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? t('vr_a_lt_creating') : t('vr_a_lt_create_btn')}
            </button>
          </div>

          <div className="bg-black/20 p-5 rounded-3xl backdrop-blur-md">
            <h3 className="font-black text-sm mb-1 uppercase tracking-widest">{t('vr_a_lt_are_follower')}</h3>
            <p className="text-xs opacity-80 mb-4">{t('vr_a_lt_join_desc')}</p>
            <div className="flex gap-2">
              <input 
                type="text" 
                maxLength={6}
                placeholder="PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.toUpperCase())}
                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 text-white font-black tracking-widest uppercase placeholder:text-white/30 focus:outline-none focus:border-white/50"
              />
              <button 
                onClick={() => joinSession(pinInput)}
                disabled={loading || pinInput.length < 6}
                className="w-12 h-12 bg-white text-blue-600 rounded-xl flex items-center justify-center disabled:opacity-50 hover:bg-gray-50"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {!sessionUser && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-3xl flex items-start gap-4">
          <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
            <Gift className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h4 className="font-black text-amber-900 text-sm">{t('vr_a_lt_guest_title')}</h4>
            <p className="text-xs font-bold text-amber-700/80 mt-1">
              {t('vr_a_lt_guest_pre')} <strong>{t('vr_a_lt_guest_credits')}</strong> {t('vr_a_lt_guest_post')}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
