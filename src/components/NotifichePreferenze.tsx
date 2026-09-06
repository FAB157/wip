/**
 * Preferenze notifiche push (06/09/2026), nel Setup del profilo.
 * Due interruttori: avvisi di servizio (guida pronta, rimborsi, tour di
 * gruppo) e novita'/offerte (consenso esplicito, massimo una a settimana —
 * GDPR). Lette da `user_profiles` (push_servizio, push_promo), salvate via
 * /api/notifiche/preferenze. Il permesso del sistema operativo si chiede a
 * parte (PermissionsModal / registraPush).
 */
import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getTranslation, type Language } from '../lib/i18n';
import { salvaPreferenzePush } from '../services/generazioniService';
import { notify } from '../lib/toast';

export default function NotifichePreferenze({ language }: { language: Language }) {
  const [servizio, setServizio] = useState(true);
  const [promo, setPromo] = useState(false);
  const [caricato, setCaricato] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const uid = s?.session?.user?.id;
        if (!uid) return;
        const { data } = await supabase.from('user_profiles').select('push_servizio, push_promo').eq('id', uid).maybeSingle();
        if (data) { setServizio(data.push_servizio !== false); setPromo(data.push_promo === true); }
      } catch { /* resta il default */ }
      setCaricato(true);
    })();
  }, []);

  const cambia = async (campo: 'push_servizio' | 'push_promo', valore: boolean) => {
    if (campo === 'push_servizio') setServizio(valore); else setPromo(valore);
    try { await salvaPreferenzePush({ [campo]: valore }); }
    catch { notify(getTranslation('oops', language)); if (campo === 'push_servizio') setServizio(!valore); else setPromo(!valore); }
  };

  const Riga = ({ testo, attivo, onChange }: { testo: string; attivo: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-[13px] font-bold text-gray-900 leading-snug">{testo}</span>
      <button
        type="button"
        role="switch"
        aria-checked={attivo}
        disabled={!caricato}
        onClick={() => onChange(!attivo)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${attivo ? 'bg-primary' : 'bg-gray-300'} disabled:opacity-50`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${attivo ? 'left-0.5 translate-x-5' : 'left-0.5'}`} />
      </button>
    </label>
  );

  return (
    <div className="w-full rounded-2xl border border-primary/10 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3 mb-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary"><Bell className="w-5 h-5" /></span>
        <span className="text-[13px] font-black text-gray-900">{getTranslation('notif_titolo', language)}</span>
      </div>
      <Riga testo={getTranslation('notif_servizio', language)} attivo={servizio} onChange={(v) => cambia('push_servizio', v)} />
      <Riga testo={getTranslation('notif_promo', language)} attivo={promo} onChange={(v) => cambia('push_promo', v)} />
    </div>
  );
}
