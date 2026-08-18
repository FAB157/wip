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
interface ListenEntry { listened_at: string; category?: string; poi_name?: string }

// «Salute del viaggio»: un giorno di passi dal plugin nativo
// (getHealthStats — CMPedometer su iOS, TYPE_STEP_COUNTER su Android).
interface HealthDay { date: string; steps: number; distanceKm: number; floors: number }

const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Comparazione simpatica generata client-side, soglie hardcoded.
 * Priorità ai km (il numero che colpisce), poi i piani saliti.
 */
function healthComparison(kmToday: number, floors: number): string | null {
  if (kmToday >= 42.2) return 'Oggi hai coperto una maratona intera! 🏅';
  if (kmToday >= 21.1) return 'Come una mezza maratona!';
  if (floors >= 96) return `≈ ${floors} piani = la Torre degli Asinelli ×3!`;
  if (floors >= 32) return `≈ ${floors} piani = come salire la Torre degli Asinelli!`;
  if (kmToday >= 10) return '10+ km a spasso: esploratore instancabile!';
  if (kmToday >= 5) return 'Come attraversare Venezia da punta a punta!';
  if (floors >= 19) return `≈ ${floors} piani = in cima alla Torre di Pisa!`;
  if (kmToday >= 2) return 'Una bella passeggiata nel centro storico!';
  if (kmToday >= 0.5) return 'Riscaldamento fatto: il prossimo POI ti aspetta!';
  return null;
}

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
  // Cache locale dei passi: null = non disponibile/errore → card nascosta.
  const [healthDays, setHealthDays] = useState<HealthDay[] | null>(null);

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
            .select('listened_at, category, poi_name')
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

  // «Salute del viaggio»: SOLO su piattaforma nativa (su web la card non
  // appare mai). Fetch via registerPlugin come dayPassService; try/catch
  // totale: available:false o qualunque errore → card nascosta, mai rotta.
  // Refresh: al mount (= focus della tab profilo, che è renderizzata
  // condizionalmente) e a ogni ritorno in primo piano dell'app.
  useEffect(() => {
    let cancelled = false;
    const fetchHealth = async () => {
      try {
        const { Capacitor, registerPlugin } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const plugin = registerPlugin<any>('ItaintaBackgroundPoiPlugin');
        const res = await plugin.getHealthStats();
        if (!cancelled && res?.available && Array.isArray(res.days)) {
          setHealthDays(res.days as HealthDay[]);
        }
      } catch { /* plugin assente su build vecchie o errore nativo: card nascosta */ }
    };
    fetchHealth();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchHealth(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
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

  // «Il tuo anno in viaggio»: aggrega SOLO i dati già caricati sopra
  // (ascolti, itinerari, vision) filtrati sull'anno corrente. Nessuna
  // query nuova: la card è uno specchio annuale della dashboard.
  const yearStats = useMemo(() => {
    const year = new Date().getFullYear();
    const listens = (stats?.listened || []).filter(e => new Date(e.listened_at).getFullYear() === year);
    const tripsYear = (stats?.trips || []).filter(t => new Date(t.created_at).getFullYear() === year);
    const cities = new Set(tripsYear.map(t => cityFromTitle(t.titolo)));
    // POI più ascoltato dell'anno (conteggio per nome)
    const byName = new Map<string, number>();
    for (const e of listens) {
      const n = String(e.poi_name || '').trim();
      if (n) byName.set(n, (byName.get(n) || 0) + 1);
    }
    let topPoi: string | null = null;
    let topCount = 0;
    for (const [n, c] of byName.entries()) {
      if (c > topCount) { topPoi = n; topCount = c; }
    }
    return { year, listens: listens.length, cities: cities.size, topPoi, topCount };
  }, [stats]);

  // Vista «Salute del viaggio»: oggi + totale 7 giorni, dai dati nativi.
  // null = niente dati significativi → card non renderizzata.
  const healthView = useMemo(() => {
    if (!healthDays || healthDays.length === 0) return null;
    const todayKey = localDayKey(new Date());
    const today = healthDays.find(d => d.date === todayKey) || healthDays[healthDays.length - 1];
    const steps = Math.max(0, Math.round(Number(today?.steps) || 0));
    const km = Math.max(0, Number(today?.distanceKm) || 0);
    const floors = Math.max(0, Math.round(Number(today?.floors) || 0));
    const weekSteps = healthDays.reduce((s, d) => s + (Math.max(0, Math.round(Number(d?.steps) || 0))), 0);
    const weekKm = healthDays.reduce((s, d) => s + Math.max(0, Number(d?.distanceKm) || 0), 0);
    if (steps <= 0 && weekSteps <= 0) return null; // niente zeri in faccia
    return { steps, km, floors, weekSteps, weekKm, comparison: healthComparison(km, floors) };
  }, [healthDays]);

  /**
   * Condividi l'anno: genera via canvas un'immagine 1080×1350 brandizzata
   * WIP (sfondo blu #1e3a8a, numeri grandi) e la passa a navigator.share
   * come file; fallback: download PNG.
   */
  const shareYearCard = async () => {
    try {
      const W = 1080; const H = 1350;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas non disponibile');

      // Sfondo: gradiente blu brand
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#1e3a8a');
      grad.addColorStop(1, '#16295e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Cerchi decorativi tenui
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.arc(W - 120, 160, 220, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(90, H - 140, 180, 0, Math.PI * 2); ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '900 44px system-ui, sans-serif';
      ctx.fillText('IL MIO ANNO IN VIAGGIO', W / 2, 170);

      // Anno gigante
      ctx.fillStyle = '#fcd34d';
      ctx.font = '900 200px system-ui, sans-serif';
      ctx.fillText(String(yearStats.year), W / 2, 400);

      // Statistiche grandi
      const rows: Array<[string, string]> = [
        [String(yearStats.listens), yearStats.listens === 1 ? 'luogo ascoltato' : 'luoghi ascoltati'],
        [String(yearStats.cities), yearStats.cities === 1 ? 'città visitata' : 'città visitate'],
      ];
      let y = 580;
      for (const [num, label] of rows) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 130px system-ui, sans-serif';
        ctx.fillText(num, W / 2, y);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '900 42px system-ui, sans-serif';
        ctx.fillText(label.toUpperCase(), W / 2, y + 62);
        y += 240;
      }

      // POI del cuore (se c'è)
      if (yearStats.topPoi) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '900 36px system-ui, sans-serif';
        ctx.fillText('IL MIO LUOGO DEL CUORE', W / 2, y + 10);
        ctx.fillStyle = '#fcd34d';
        ctx.font = '900 58px system-ui, sans-serif';
        const nome = yearStats.topPoi.length > 30 ? yearStats.topPoi.slice(0, 29) + '…' : yearStats.topPoi;
        ctx.fillText(nome, W / 2, y + 85);
      }

      // Footer brand
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '900 40px system-ui, sans-serif';
      ctx.fillText('world in pocket · wip.guide', W / 2, H - 90);

      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('generazione PNG fallita');
      const file = new File([blob], `wip-anno-${yearStats.year}.png`, { type: 'image/png' });

      const nav: any = navigator;
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          files: [file],
          title: `Il mio anno in viaggio ${yearStats.year}`,
          text: `Il mio ${yearStats.year} con WIP · world in pocket`,
        });
      } else {
        // Fallback: download diretto del PNG
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `wip-anno-${yearStats.year}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        notify('Immagine scaricata: condividila dove vuoi!');
      }
    } catch (e: any) {
      // Condivisione annullata dall'utente: nessun errore da mostrare
      if (e?.name !== 'AbortError') notify('Condivisione non riuscita.');
    }
  };

  const sharePassport = async () => {
    const lines = stamps.map(st => `🛂 ${st.city} — prima visita ${new Date(st.firstAt).toLocaleDateString('it-IT')}`);
    const text = `Il mio Passaporto WIP · ${stamps.length} ${stamps.length === 1 ? 'città' : 'città'}\n${lines.join('\n')}\n\nworld in pocket · wip.guide`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); notify('Passaporto copiato negli appunti.'); }
    } catch { /* condivisione annullata */ }
  };

  if (!stats) return null;
  const hasAnything = stats.listened.length > 0 || stats.trips.length > 0 || stats.visionCount > 0 || !!healthView;
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

      {/* «Salute del viaggio»: passi/km/piani dal contapassi nativo (solo app) */}
      {healthView && (
        <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm space-y-2.5">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
            👟 Salute del viaggio
          </span>
          <div className={`grid ${healthView.floors > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <div className="text-xl font-black tabular-nums">{healthView.steps.toLocaleString('it-IT')}</div>
              <div className="text-[8px] font-black uppercase tracking-widest opacity-60">Passi oggi</div>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <div className="text-xl font-black tabular-nums">{healthView.km.toFixed(healthView.km >= 10 ? 0 : 1)}</div>
              <div className="text-[8px] font-black uppercase tracking-widest opacity-60">Km oggi</div>
            </div>
            {healthView.floors > 0 && (
              <div className="bg-white/10 rounded-xl p-2.5 text-center">
                <div className="text-xl font-black tabular-nums">{healthView.floors}</div>
                <div className="text-[8px] font-black uppercase tracking-widest opacity-60">Piani saliti</div>
              </div>
            )}
          </div>
          <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
            <div className="text-[8px] font-black uppercase tracking-widest opacity-60">Ultimi 7 giorni</div>
            <div className="text-xs font-black tabular-nums">
              {healthView.weekSteps.toLocaleString('it-IT')} passi · {healthView.weekKm.toFixed(healthView.weekKm >= 10 ? 0 : 1)} km
            </div>
          </div>
          {healthView.comparison && (
            <div className="text-[10px] font-bold text-amber-300 text-center leading-tight">
              {healthView.comparison}
            </div>
          )}
        </div>
      )}

      {/* «Il tuo anno in viaggio»: riepilogo annuale + condivisione immagine */}
      {(yearStats.listens > 0 || yearStats.cities > 0) && (
        <div className="bg-white/10 rounded-2xl p-3 backdrop-blur-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
              ✨ Il tuo anno in viaggio · {yearStats.year}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <div className="text-xl font-black tabular-nums">{yearStats.listens}</div>
              <div className="text-[8px] font-black uppercase tracking-widest opacity-60">
                {yearStats.listens === 1 ? 'Luogo ascoltato' : 'Luoghi ascoltati'}
              </div>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5 text-center">
              <div className="text-xl font-black tabular-nums">{yearStats.cities}</div>
              <div className="text-[8px] font-black uppercase tracking-widest opacity-60">
                {yearStats.cities === 1 ? 'Città visitata' : 'Città visitate'}
              </div>
            </div>
          </div>
          {yearStats.topPoi && (
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <div className="text-[8px] font-black uppercase tracking-widest opacity-60">Il tuo luogo del cuore</div>
              <div className="text-xs font-black text-amber-300 leading-tight break-words">
                {yearStats.topPoi}{yearStats.topCount > 1 ? ` · ${yearStats.topCount} ascolti` : ''}
              </div>
            </div>
          )}
          <button
            onClick={shareYearCard}
            className="w-full flex items-center justify-center gap-2 py-2 bg-white/15 hover:bg-white/25 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" /> Condividi
          </button>
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
