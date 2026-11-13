// =====================================================================
// WIP · Racconto del viaggio, in UN posto (20/09/2026). Era dentro
// ProfileScreen (tab Itinerari) e basta: ora il tasto «Racconto» sta anche
// sulle voci di «I miei download» / «I miei itinerari», con la stessa rotta
// (/api/trip-story, login obbligatorio), gli stessi testi e la stessa modale.
// =====================================================================

import React, { useState } from 'react';
import { getTranslation, type Language } from '../lib/i18n';
import { getApiUrl, apiFetch } from '../lib/api';
import { notify } from '../lib/toast';

/** `itinerario`: { id, titolo, dati_itinerario: { giorni } } — la riga di user_itineraries o equivalente. */
export function useRaccontoViaggio(language: Language) {
  const [racconto, setRacconto] = useState<{ titolo: string; story: string } | null>(null);
  const [inCorsoId, setInCorsoId] = useState<string | null>(null);

  const genera = async (itinerario: any) => {
    const giorniRaw = itinerario?.dati_itinerario?.giorni || [];
    const lista = Array.isArray(giorniRaw) ? giorniRaw : Object.values(giorniRaw);
    const giorni = lista.map((g: any, i: number) => ({
      giorno: g.giorno || i + 1,
      tappe: (g.tappe || []).map((t: any) => t.titolo_tappa || t.nome).filter(Boolean),
    })).filter((g: any) => g.tappe.length > 0);
    if (giorni.length === 0) { notify(getTranslation('pf_story_no_stops', language)); return; }
    setInCorsoId(String(itinerario.id));
    try {
      // apiFetch: Bearer automatico (rotta a login obbligatorio) + timeout.
      const res = await apiFetch(getApiUrl('/api/trip-story'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titolo: itinerario.titolo, giorni, lang: language }),
      }, 90000);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.story) throw new Error(data?.error || 'generazione fallita');
      setRacconto({ titolo: itinerario.titolo || getTranslation('pf_nostro_viaggio', language), story: data.story });
    } catch (e: any) {
      notify(getTranslation('pf_story_fail', language).replace('{x}', e?.message || getTranslation('pf_riprova', language)));
    } finally {
      setInCorsoId(null);
    }
  };

  const condividi = async () => {
    if (!racconto) return;
    const text = `${racconto.titolo}\n\n${racconto.story}\n\n— raccontato da WIP · wip.guide`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); notify(getTranslation('pf_story_copied', language)); }
    } catch { /* condivisione annullata */ }
  };

  const modale = racconto ? (
    <div className="fixed inset-0 z-[1350] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setRacconto(null)}>
      <div className="w-full max-w-lg bg-white rounded-3xl p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-black text-primary text-lg leading-tight">📖 {racconto.titolo}</h3>
          <button onClick={() => setRacconto(null)} className="p-1 text-gray-400 hover:text-gray-600 shrink-0">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto text-[15px] leading-relaxed text-gray-700 whitespace-pre-line italic border-l-4 border-amber-200 pl-4">
          {racconto.story}
        </div>
        <button
          onClick={condividi}
          className="w-full py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest"
        >
          {getTranslation('pf_condividi_racconto', language)}
        </button>
      </div>
    </div>
  ) : null;

  return { genera, inCorsoId, modale };
}
