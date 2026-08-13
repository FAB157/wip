import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Headphones, Map as MapIcon, Camera, TrendingUp, Stamp, Share2, ChevronDown, ChevronUp } from 'lucide-react';
import { notify } from './../lib/toast';
import type { Language } from '../lib/i18n';

/**
 * Dashboard del viaggiatore + Passaporto WIP (ondata 5).
 * Tutti i numeri vengono da dati GIÀ raccolti (cronologia ascolti, itinerari,
 * vision card): il profilo passa da menu a specchio dell'identità di
 * viaggiatore. Il passaporto timbra ogni destinazione con la prima visita.
 */

interface Stats {
  listened: ListenEntry[];
  trips: { titolo: string; created_at: string }[];
  visionCount: number;
}
interface ListenEntry { listened_at: string; category?: string }

// "Arte a Ravenna: Un Itinerario di 3 Giorni" → "Ravenna"
function cityFromTitle(titolo: string): string {
  const m = String(titolo || '').match(/\sa\s+([^:]{2,40}):/i);
  if (m) return m[1].trim();
  const short = String(titolo || '').split(':')[0].trim();
  return short || 'Viaggio';
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

export default function TravelerDashboard({ language }: { language: Language }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [passportOpen, setPassportOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const uid = s?.session?.user?.id;

        // Cronologia ascolti: Supabase se loggato, mirror locale come fallback
        let listened: ListenEntry[] = [];
        if (uid) {
          const { data } = await supabase
            .from('user_listening_history')
            .select('listened_at, category')
            .eq('user_id', uid)
            .order('listened_at', { ascending: false })
            .limit(1000);
          listened = data || [];
        }
        if (listened.length === 0) {
          try { listened = JSON.parse(localStorage.getItem('mock_db_listening_history') || '[]'); } catch { /* ok */ }
        }

        let trips: { titolo: string; created_at: string }[] = [];
        if (uid) {
          const { data } = await supabase
            .from('user_itineraries')
            .select('titolo, created_at')
            .eq('user_id', uid)
            .order('created_at', { ascending: true })
            .limit(200);
          trips = data || [];
        }

        let visionCount = 0;
        if (uid) {
          const { count } = await supabase
            .from('vision_cards')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', uid);
          visionCount = count || 0;
        }

        setStats({ listened, trips, visionCount });
      } catch {
        setStats({ listened: [], trips: [], visionCount: 0 });
      }
    })();
  }, []);

  // Trend ascolti degli ultimi 6 mesi + confronto col mese scorso
  const trend = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: monthKey(d), label: MONTH_LABELS[d.getMonth()], count: 0 });
    }
    for (const e of stats?.listened || []) {
      const k = monthKey(new Date(e.listened_at));
      const slot = months.find(m => m.key === k);
      if (slot) slot.count++;
    }
    const thisMonth = months[5]?.count || 0;
    const lastMonth = months[4]?.count || 0;
    return { months, thisMonth, lastMonth };
  }, [stats]);

  // Passaporto: un timbro per destinazione, con la data della PRIMA visita
  const stamps = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of stats?.trips || []) {
      const city = cityFromTitle(t.titolo);
      if (!map.has(city)) map.set(city, t.created_at);
    }
    return [...map.entries()].map(([city, firstAt]) => ({ city, firstAt }));
  }, [stats]);

  const sharePassport = async () => {
    const lines = stamps.map(st => `🛂 ${st.city} — prima visita ${new Date(st.firstAt).toLocaleDateString('it-IT')}`);
    const text = `Il mio Passaporto WIP · ${stamps.length} ${stamps.length === 1 ? 'città' : 'città'}\n${lines.join('\n')}\n\nworld in pocket · wip.guide`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); notify('Passaporto copiato negli appunti.'); }
    } catch { /* condivisione annullata */ }
  };

  if (!stats) return null;
  const hasAnything = stats.listened.length > 0 || stats.trips.length > 0 || stats.visionCount > 0;
  if (!hasAnything) return null; // profilo nuovo: niente numeri a zero in faccia

  const maxCount = Math.max(1, ...trend.months.map(m => m.count));
  const delta = trend.thisMonth - trend.lastMonth;

  return (
    <div className="bg-gradient-to-br from-primary to-[#16295e] rounded-[2rem] p-5 text-white shadow-lg space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white/10 rounded-2xl p-3 text-center backdrop-blur-sm">
          <Headphones className="w-4 h-4 mx-auto mb-1 opacity-70" />
          <div className="text-2xl font-black tabular-nums">{stats.listened.length}</div>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-60">Luoghi ascoltati</div>
        </div>
        <div className="bg-white/10 rounded-2xl p-3 text-center backdrop-blur-sm">
          <MapIcon className="w-4 h-4 mx-auto mb-1 opacity-70" />
          <div className="text-2xl font-black tabular-nums">{stamps.length}</div>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-60">Città nel passaporto</div>
        </div>
        <div className="bg-white/10 rounded-2xl p-3 text-center backdrop-blur-sm">
          <Camera className="w-4 h-4 mx-auto mb-1 opacity-70" />
          <div className="text-2xl font-black tabular-nums">{stats.visionCount}</div>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-60">Scatti Vision</div>
        </div>
      </div>

      {/* Trend 6 mesi */}
      {stats.listened.length > 0 && (
        <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Ascolti ultimi 6 mesi
            </span>
            <span className={`text-[10px] font-black ${delta >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
              {delta >= 0 ? '+' : ''}{delta} vs mese scorso
            </span>
          </div>
          <div className="flex items-end justify-between gap-2 h-16">
            {trend.months.map(m => (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1" title={`${m.count} ascolti`}>
                <div
                  className={`w-full rounded-t-md ${m.key === trend.months[5].key ? 'bg-amber-300' : 'bg-white/40'}`}
                  style={{ height: `${m.count > 0 ? Math.max(12, (m.count / maxCount) * 100) : 6}%` }}
                />
                <span className="text-[8px] font-black opacity-50 uppercase">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Passaporto WIP */}
      {stamps.length > 0 && (
        <div className="bg-white/10 rounded-2xl backdrop-blur-sm overflow-hidden">
          <button onClick={() => setPassportOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2.5">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-80 flex items-center gap-1.5">
              <Stamp className="w-3.5 h-3.5" /> Passaporto WIP · {stamps.length} {stamps.length === 1 ? 'timbro' : 'timbri'}
            </span>
            {passportOpen ? <ChevronUp className="w-4 h-4 opacity-60" /> : <ChevronDown className="w-4 h-4 opacity-60" />}
          </button>
          {passportOpen && (
            <div className="px-3 pb-3 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {stamps.map((st, i) => (
                  <div
                    key={st.city}
                    className="border-2 border-dashed border-white/40 rounded-xl p-2.5 text-center bg-white/5"
                    style={{ transform: `rotate(${(i % 3) - 1}deg)` }}
                  >
                    <div className="text-[9px] font-black uppercase tracking-widest opacity-50">Visitato</div>
                    <div className="text-sm font-black leading-tight break-words">{st.city}</div>
                    <div className="text-[9px] font-bold opacity-60 mt-0.5">
                      {new Date(st.firstAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={sharePassport}
                className="w-full flex items-center justify-center gap-2 py-2 bg-white/15 hover:bg-white/25 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" /> Condividi il passaporto
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
