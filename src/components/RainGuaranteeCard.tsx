// ─── Garanzia pioggia ────────────────────────────────────────────────────────
// Link discreto sotto gli itinerari recenti (ultimi 7 giorni): se nel giorno
// del viaggio è piovuto quasi tutto il giorno (≥6 ore o ≥20 mm), il server
// verifica il meteo REALE su Open-Meteo e restituisce i crediti del giorno.
// Tono onesto: anche a esito negativo mostriamo i mm/ore effettivi.
import React, { useMemo, useState } from 'react';
import { CloudRain, Loader2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getApiUrl } from '../lib/api';
import { Language, getTranslation } from '../lib/i18n';

// Deve restare allineato alle costanti RAIN_GUARANTEE_* in server.ts
// (/api/rain-guarantee/claim): qui serve solo per il testo esplicativo.
const RAIN_MIN_HOURS = 6;
const RAIN_MIN_MM = 20;
const RAIN_WINDOW_DAYS = 7;

interface RainGuaranteeCardProps {
  /** Riga di user_itineraries (id, titolo, created_at, dati_itinerario). */
  itinerary: any;
  language: Language;
}

type ClaimResult = {
  kind: 'ok' | 'no' | 'pending' | 'error';
  message: string;
};

const DATE_LOCALE: Record<string, string> = {
  IT: 'it-IT', EN: 'en-GB', FR: 'fr-FR', ES: 'es-ES', DE: 'de-DE', RU: 'ru-RU', ZH: 'zh-CN',
};

export default function RainGuaranteeCard({ itinerary, language }: RainGuaranteeCardProps) {
  const t = (key: string) => getTranslation(key, language);
  const [open, setOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);

  // Giorni reclamabili: ultimi 7 giorni, mai prima della creazione
  // dell'itinerario (stesse regole del server, che comunque riverifica tutto).
  const eligibleDays = useMemo(() => {
    try {
      if (!itinerary?.id || itinerary?.isOffline) return [];
      const createdDay = String(itinerary.created_at || '').slice(0, 10);
      if (!createdDay) return [];
      const days: string[] = [];
      for (let i = 0; i < RAIN_WINDOW_DAYS; i++) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        if (d >= createdDay) days.push(d);
      }
      return days;
    } catch { return []; }
  }, [itinerary]);

  // Itinerario troppo vecchio (o offline/mock): nessuna garanzia da mostrare.
  if (eligibleDays.length === 0) return null;

  const destName: string = itinerary?.dati_itinerario?.destinazione
    || itinerary?.dati_itinerario?.destination
    || String(itinerary?.titolo || '').split(':')[0].trim()
    || t('vr_b_rg_dest_fallback');

  const fmtDay = (iso: string) => {
    try {
      return new Date(`${iso}T12:00:00`).toLocaleDateString(DATE_LOCALE[language] || 'en-GB', { day: '2-digit', month: '2-digit' });
    } catch { return iso; }
  };

  const handleClaim = async () => {
    const day = selectedDay || eligibleDays[0];
    setLoading(true);
    setResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setResult({ kind: 'error', message: t('vr_b_rg_login') });
        return;
      }
      const res = await fetch(getApiUrl('/api/rain-guarantee/claim'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itineraryId: itinerary.id, dayDate: day })
      });
      const data = await res.json().catch(() => ({}));
      const w = data?.weather;
      const wTxt = w ? t('vr_b_rg_wtxt').replace('{mm}', String(w.mm)).replace('{h}', String(w.ore)) : '';

      if (res.ok && data?.refunded) {
        // Il wallet è cambiato: stesso evento usato dal resto dell'app.
        window.dispatchEvent(new CustomEvent('wip-credits-updated'));
        setResult({
          kind: 'ok',
          message: t('vr_b_rg_ok').replace('{w}', wTxt).replace('{d}', fmtDay(day)).replace('{c}', String(data.credits))
        });
      } else if (data?.reason === 'pioggia_insufficiente') {
        setResult({
          kind: 'no',
          message: t('vr_b_rg_no').replace('{d}', fmtDay(day)).replace('{dest}', destName).replace('{w}', wTxt)
        });
      } else if (data?.reason === 'dati_meteo_non_ancora_disponibili') {
        setResult({
          kind: 'pending',
          message: t('vr_b_rg_pending').replace('{d}', fmtDay(day))
        });
      } else if (data?.reason === 'gia_richiesto') {
        setResult({ kind: 'no', message: t('vr_b_rg_already') });
      } else if (data?.reason === 'limite_garanzia_raggiunto') {
        setResult({
          kind: 'no',
          message: t('vr_b_rg_limit')
        });
      } else if (res.status === 401) {
        setResult({ kind: 'error', message: t('vr_b_rg_login') });
      } else {
        setResult({ kind: 'error', message: t('vr_b_rg_fail') });
      }
    } catch {
      setResult({ kind: 'error', message: t('vr_b_rg_offline') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Link discreto nella card dell'itinerario */}
      <button
        onClick={() => { setResult(null); setSelectedDay(eligibleDays[0]); setOpen(true); }}
        className="self-start text-[10px] font-black uppercase tracking-widest text-sky-600 hover:text-sky-800 transition-colors flex items-center gap-1"
        title={t('vr_b_rg_link_title')}
      >
        🌧 {t('vr_b_rg_link')}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6" onClick={() => !loading && setOpen(false)}>
          <div
            className="bg-white rounded-[2rem] p-6 max-w-sm w-full shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              disabled={loading}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
              aria-label={t('close')}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 bg-sky-100 rounded-2xl flex items-center justify-center text-sky-600">
                <CloudRain className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-lg leading-tight">{t('vr_b_rg_title')}</h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  {t('vr_b_rg_included')}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed mb-4">
              {t('vr_b_rg_expl')
                .replace('{h}', String(RAIN_MIN_HOURS))
                .replace('{mm}', String(RAIN_MIN_MM))
                .replace('{dest}', destName)}
            </p>

            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
              {t('vr_b_rg_which_day')}
            </label>
            <div className="flex flex-wrap gap-2 mb-5">
              {eligibleDays.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDay(d)}
                  disabled={loading}
                  className={`px-3 py-2 rounded-xl text-xs font-black transition-colors border ${
                    (selectedDay || eligibleDays[0]) === d
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {fmtDay(d)}
                </button>
              ))}
            </div>

            {result && (
              <div className={`mb-4 p-4 rounded-2xl text-xs font-bold leading-relaxed ${
                result.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                : result.kind === 'no' ? 'bg-amber-50 text-amber-800 border border-amber-100'
                : result.kind === 'pending' ? 'bg-sky-50 text-sky-800 border border-sky-100'
                : 'bg-rose-50 text-rose-700 border border-rose-100'
              }`}>
                {result.message}
              </div>
            )}

            <button
              onClick={handleClaim}
              disabled={loading}
              className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
              {loading
                ? (<><Loader2 className="w-4 h-4 animate-spin" /> {t('vr_b_rg_checking')}</>)
                : t('vr_b_rg_claim')}
            </button>

            <p className="mt-3 text-[10px] text-gray-400 leading-relaxed text-center">
              {t('vr_b_rg_valid').replace('{n}', String(RAIN_WINDOW_DAYS))}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
