import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { BarChart3, Users, Globe, Smartphone, RefreshCw, MapPin, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Conteggio { nome: string; conteggio: number; }
interface VisiteData {
  generatoIl: string;
  totali: { oggi24h: number; ultimi7gg: number; ultimi30gg: number };
  sessioniUniche30gg: number;
  paginePiuViste: Conteggio[];
  provenienza: Conteggio[];
  dispositivi: Conteggio[];
  browser: Conteggio[];
  paesi: Conteggio[];
  serieGiornaliera: { giorno: string; visite: number }[];
  postHog: any;
}

const adminHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function TabellaConteggi({ titolo, icona, righe, etichettaColonna }: { titolo: string; icona: React.ReactNode; righe: Conteggio[]; etichettaColonna: string }) {
  const totale = righe.reduce((s, r) => s + r.conteggio, 0) || 1;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center gap-2">
        {icona}
        <h3 className="font-black text-sm text-primary uppercase tracking-wider">{titolo}</h3>
      </div>
      {righe.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">Ancora nessun dato.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{etichettaColonna}</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">Visite</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {righe.map((r) => (
                <tr key={r.nome}>
                  <td className="px-4 py-2.5 text-sm text-gray-700 truncate max-w-[260px]">{r.nome}</td>
                  <td className="px-4 py-2.5 text-sm font-bold text-gray-900">{r.conteggio.toLocaleString('it-IT')}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">{Math.round((r.conteggio / totale) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminVisits() {
  const [dati, setDati] = useState<VisiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carica = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/admin/visits'), { headers: await adminHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDati(data);
    } catch (e: any) {
      setError(e?.message || 'Errore nel caricamento delle visite');
    }
    setLoading(false);
  };

  useEffect(() => { carica(); }, []);

  const maxSerie = Math.max(1, ...(dati?.serieGiornaliera.map(g => g.visite) || [1]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Solo pagine del sito wip.guide (non le view dei singoli POI). Dati raccolti da noi + conferma incrociata su PostHog.
        </p>
        <button
          onClick={carica}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-bold text-primary/70 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-primary/5 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Aggiorna
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {loading && !dati ? (
        <div className="p-10 text-center text-sm text-gray-500">Caricamento visite...</div>
      ) : dati && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100/40 border border-blue-200/60 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-black uppercase tracking-widest text-blue-600">Ultime 24 ore</span>
              </div>
              <div className="text-3xl font-black text-blue-800">{dati.totali.oggi24h.toLocaleString('it-IT')}</div>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/40 border border-emerald-200/60 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-black uppercase tracking-widest text-emerald-600">Ultimi 7 giorni</span>
              </div>
              <div className="text-3xl font-black text-emerald-800">{dati.totali.ultimi7gg.toLocaleString('it-IT')}</div>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-amber-100/40 border border-amber-200/60 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-black uppercase tracking-widest text-amber-600">Ultimi 30 giorni</span>
              </div>
              <div className="text-3xl font-black text-amber-800">{dati.totali.ultimi30gg.toLocaleString('it-IT')}</div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100/40 border border-purple-200/60 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-purple-500" />
                <span className="text-xs font-black uppercase tracking-widest text-purple-600">Sessioni uniche (30gg)</span>
              </div>
              <div className="text-3xl font-black text-purple-800">{dati.sessioniUniche30gg.toLocaleString('it-IT')}</div>
            </div>
          </div>

          {/* Grafico a barre semplice, 30 giorni */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="font-black text-sm text-primary uppercase tracking-wider mb-3">Andamento — ultimi 30 giorni</h3>
            <div className="flex items-end gap-1 h-32">
              {dati.serieGiornaliera.map(g => (
                <div key={g.giorno} className="flex-1 flex flex-col items-center justify-end group relative">
                  <div
                    className="w-full bg-primary/70 hover:bg-primary rounded-t-sm transition-colors"
                    style={{ height: `${Math.max(2, (g.visite / maxSerie) * 100)}%` }}
                    title={`${g.giorno}: ${g.visite} visite`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>{dati.serieGiornaliera[0]?.giorno}</span>
              <span>{dati.serieGiornaliera[dati.serieGiornaliera.length - 1]?.giorno}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TabellaConteggi titolo="Pagine più viste" icona={<MapPin className="w-4 h-4 text-primary" />} righe={dati.paginePiuViste} etichettaColonna="Pagina" />
            <TabellaConteggi titolo="Provenienza (referrer)" icona={<Globe className="w-4 h-4 text-primary" />} righe={dati.provenienza} etichettaColonna="Da dove" />
            <TabellaConteggi titolo="Dispositivi" icona={<Smartphone className="w-4 h-4 text-primary" />} righe={dati.dispositivi} etichettaColonna="Tipo" />
            <TabellaConteggi titolo="Browser" icona={<Globe className="w-4 h-4 text-primary" />} righe={dati.browser} etichettaColonna="Browser" />
          </div>

          {dati.paesi.length > 0 && (
            <TabellaConteggi titolo="Paesi" icona={<Globe className="w-4 h-4 text-primary" />} righe={dati.paesi} etichettaColonna="Paese" />
          )}

          {/* Conferma incrociata PostHog */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              {dati.postHog?.stato === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              )}
              <h3 className="font-black text-sm text-primary uppercase tracking-wider">Conferma incrociata — PostHog</h3>
            </div>
            {dati.postHog?.stato === 'ok' ? (
              <p className="text-sm text-gray-600">
                PostHog conta <strong>{Number(dati.postHog.pageview7gg).toLocaleString('it-IT')}</strong> pageview negli ultimi 7 giorni e{' '}
                <strong>{Number(dati.postHog.pageview30gg).toLocaleString('it-IT')}</strong> negli ultimi 30 — numero indipendente dal nostro, utile per verificare che i due tracciamenti coincidano a grandi linee.
              </p>
            ) : (
              <p className="text-sm text-gray-500">{dati.postHog?.nota || dati.postHog?.errore || 'PostHog non disponibile al momento.'}</p>
            )}
          </div>

          <p className="text-[11px] text-gray-400">Generato il {new Date(dati.generatoIl).toLocaleString('it-IT')}</p>
        </>
      )}
    </div>
  );
}
