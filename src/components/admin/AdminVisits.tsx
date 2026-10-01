import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { BarChart3, Users, Globe, Smartphone, RefreshCw, MapPin, CheckCircle2, AlertTriangle, LogIn, LogOut, Link2, Megaphone, Clock, Route, Activity, Coins, Gauge, Languages, Search } from 'lucide-react';

interface Conteggio { nome: string; conteggio: number; }
interface Dettaglio {
  giorni: number; colonneNuove: boolean; pagine: number; eventi: number; sessioni: number;
  durataMedianaSec: number; rimbalzi: number; sessioniRegistrate: number;
  servizi: Conteggio[]; entrata: Conteggio[]; uscita: Conteggio[]; sitiEntrata: Conteggio[]; dominiEntrata: Conteggio[];
  pagineAtterraggio: Conteggio[]; campagne: Conteggio[]; paroleCercate?: Conteggio[]; paroleCampagna?: Conteggio[]; citta: Conteggio[]; regioni: Conteggio[]; paesi: Conteggio[];
  piattaforme: Conteggio[]; versioniApp: Conteggio[]; lingue: Conteggio[]; dispositivi: Conteggio[]; browser: Conteggio[];
  percorsi: Conteggio[]; perOra: { ora: number; visite: number }[];
  tempiCaricamento: Record<string, { mediana: number; p90: number; campioni: number } | null>;
  usoServizi: (Conteggio & { dettagli: Conteggio[] })[];
  crediti: { spesiPerServizio: { nome: string; crediti: number; volte: number }[]; entrati: { nome: string; crediti: number; volte: number }[]; utentiPaganti: number } | null;
  affiliati: Conteggio[] | null;
}
interface VisiteData {
  generatoIl: string;
  totali: { oggi24h: number; ultimi7gg: number; ultimi30gg: number };
  sessioniUniche30gg: number;
  serieGiornaliera: { giorno: string; visite: number }[];
  postHog: any;
  dettaglio?: Dettaglio;
}

const adminHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Scelte del pannello ricordate fra un'apertura e l'altra (26/09/2026, committente: «i servizi siano selezionabili
// e rimane la selezione tutte le volte che apro tab visite»). Solo in questo browser.
const leggi = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const scrivi = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* niente */ } };

const SEZIONI: { id: string; nome: string }[] = [
  { id: 'entrata', nome: "Entrata e uscita" }, { id: 'provenienza', nome: 'Siti d\'entrata' }, { id: 'campagne', nome: 'Campagne' }, { id: 'parole', nome: 'Parole cercate' },
  { id: 'luoghi', nome: 'Città e paesi' }, { id: 'servizi', nome: 'Uso dei servizi' }, { id: 'percorsi', nome: 'Percorsi e durata' },
  { id: 'orari', nome: 'Ore del giorno' }, { id: 'app', nome: 'App, lingue, dispositivi' }, { id: 'soldi', nome: 'Crediti e affiliati' },
  { id: 'velocita', nome: 'Velocità' }, { id: 'andamento', nome: 'Andamento 30 giorni' },
];
const NOMI_EVENTI: Record<string, string> = {
  pin_aperto: 'Pin aperti', scheda_aperta: 'Schede aperte', audioguida_avvio: 'Audioguide avviate', teaser: 'Teaser ascoltati',
  nav_avviata: 'Navigazioni avviate', nav_arrivo: 'Arrivi a destinazione', chat_aperta: 'Chat WIP AI', percorso_avviato: 'Percorsi avviati',
  visita_museo: 'Visite museo', itinerario_generato: 'Itinerari generati', download_aperto: 'Download aperti', esperienze_aperte: 'Esperienze aperte',
  negozio_aperto: 'Negozio crediti aperto', daypass_aperto: 'Day Pass aperto', login_richiesto: 'Accesso richiesto', categoria_scelta: 'Categorie scelte',
  radar_aperto: 'Radar aperto', notifica_aperta: 'Notifiche aperte', livello_acceso: 'Livelli mappa accesi', ricerca_aperta: 'Ricerche aperte', ricerca: 'Ricerche fatte',
  pdf_salvato: 'PDF salvati', apertura_da: 'Aperture da notifica/widget/link',
};

function TabellaConteggi({ titolo, icona, righe, etichettaColonna, link }: { titolo: string; icona: React.ReactNode; righe: Conteggio[]; etichettaColonna: string; link?: boolean }) {
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
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{etichettaColonna}</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">Numero</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {righe.map((r) => (
                <tr key={r.nome}>
                  <td className="px-4 py-2.5 text-sm text-gray-700 truncate max-w-[320px]" title={r.nome}>
                    {link && /^https?:\/\//.test(r.nome)
                      ? <a href={r.nome} target="_blank" rel="noopener noreferrer" className="text-primary underline">{r.nome}</a>
                      : r.nome}
                  </td>
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

// Classi scritte per intero: Tailwind non genera quelle composte a pezzi (`from-${colore}-50`).
const COLORI: Record<string, [string, string, string]> = {
  blue: ['bg-gradient-to-br from-blue-50 to-blue-100/40 border border-blue-200/60', 'text-blue-600', 'text-blue-800'],
  emerald: ['bg-gradient-to-br from-emerald-50 to-emerald-100/40 border border-emerald-200/60', 'text-emerald-600', 'text-emerald-800'],
  amber: ['bg-gradient-to-br from-amber-50 to-amber-100/40 border border-amber-200/60', 'text-amber-600', 'text-amber-800'],
  purple: ['bg-gradient-to-br from-purple-50 to-purple-100/40 border border-purple-200/60', 'text-purple-600', 'text-purple-800'],
  sky: ['bg-gradient-to-br from-sky-50 to-sky-100/40 border border-sky-200/60', 'text-sky-600', 'text-sky-800'],
  rose: ['bg-gradient-to-br from-rose-50 to-rose-100/40 border border-rose-200/60', 'text-rose-600', 'text-rose-800'],
  teal: ['bg-gradient-to-br from-teal-50 to-teal-100/40 border border-teal-200/60', 'text-teal-600', 'text-teal-800'],
  indigo: ['bg-gradient-to-br from-indigo-50 to-indigo-100/40 border border-indigo-200/60', 'text-indigo-600', 'text-indigo-800'],
};
const Riquadro = ({ colore, icona, titolo, valore }: { colore: string; icona: React.ReactNode; titolo: string; valore: string }) => {
  const [box, tit, val] = COLORI[colore] || COLORI.blue;
  return (
    <div className={`${box} rounded-2xl p-5`}>
      <div className="flex items-center gap-2 mb-1">{icona}<span className={`text-xs font-black uppercase tracking-widest ${tit}`}>{titolo}</span></div>
      <div className={`text-3xl font-black ${val}`}>{valore}</div>
    </div>
  );
};

export default function AdminVisits() {
  const [dati, setDati] = useState<VisiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [giorni, setGiorni] = useState<number>(() => leggi('wip_admin_visite_giorni', 30));
  const [sezioni, setSezioni] = useState<string[]>(() => {
    const s = leggi<string[]>('wip_admin_visite_sezioni', SEZIONI.map((x) => x.id));
    // Sezione nuova (27/09/2026): accesa una volta anche per chi aveva già salvato la sua scelta.
    if (!leggi('wip_admin_visite_parole_vista', false)) { scrivi('wip_admin_visite_parole_vista', true); if (!s.includes('parole')) return [...s, 'parole']; }
    return s;
  });
  const [serviziScelti, setServiziScelti] = useState<string[] | null>(() => leggi('wip_admin_visite_servizi', null)); // null = tutti

  useEffect(() => scrivi('wip_admin_visite_giorni', giorni), [giorni]);
  useEffect(() => scrivi('wip_admin_visite_sezioni', sezioni), [sezioni]);
  useEffect(() => scrivi('wip_admin_visite_servizi', serviziScelti), [serviziScelti]);

  const carica = async (g = giorni) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl(`/api/admin/visits?giorni=${g}`), { headers: await adminHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDati(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Errore nel caricamento delle visite');
    }
    setLoading(false);
  };

  useEffect(() => { carica(giorni); }, [giorni]); // eslint-disable-line react-hooks/exhaustive-deps

  const d = dati?.dettaglio;
  const vedi = (id: string) => sezioni.includes(id);
  const alterna = (id: string) => setSezioni((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const maxSerie = Math.max(1, ...(dati?.serieGiornaliera.map((g) => g.visite) || [1]));
  const maxOra = Math.max(1, ...(d?.perOra.map((o) => o.visite) || [1]));
  const tuttiServizi = (d?.usoServizi || []).map((s) => s.nome);
  const servizioVisibile = (n: string) => serviziScelti == null || serviziScelti.includes(n);
  const alternaServizio = (n: string) => setServiziScelti((s) => {
    const base = s == null ? tuttiServizi : s;
    return base.includes(n) ? base.filter((x) => x !== n) : [...base, n];
  });
  const periodo = giorni === 1 ? 'ultime 24 ore' : `ultimi ${giorni} giorni`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">Sito e app, sempre anonimo: niente IP, niente identità, niente cookie persistenti.</p>
        <div className="flex items-center gap-1">
          {[1, 7, 30].map((g) => (
            <button key={g} onClick={() => setGiorni(g)} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${giorni === g ? 'bg-primary text-white' : 'text-primary/70 hover:bg-primary/5'}`}>
              {g === 1 ? '24 ore' : `${g} giorni`}
            </button>
          ))}
          <button onClick={() => carica()} disabled={loading} className="flex items-center gap-1.5 text-xs font-bold text-primary/70 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-primary/5 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Aggiorna
          </button>
        </div>
      </div>

      {/* Sezioni selezionabili, ricordate fra un'apertura e l'altra */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-2">Cosa mostrare</p>
        <div className="flex flex-wrap gap-1.5">
          {SEZIONI.map((s) => (
            <button key={s.id} onClick={() => alterna(s.id)} className={`text-xs font-bold px-2.5 py-1 rounded-full border ${vedi(s.id) ? 'bg-primary text-white border-primary' : 'bg-white text-gray-500 border-gray-200'}`}>
              {vedi(s.id) ? '✓ ' : ''}{s.nome}
            </button>
          ))}
          <button onClick={() => setSezioni(SEZIONI.map((s) => s.id))} className="text-xs font-bold px-2.5 py-1 text-primary/70 underline">tutte</button>
          <button onClick={() => setSezioni([])} className="text-xs font-bold px-2.5 py-1 text-primary/70 underline">nessuna</button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}
      {d && !d.colonneNuove && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          Città, campagne, piattaforma e uso dei servizi si riempiono dopo il comando SQL <code>20260926200000_page_views_dettagli.sql</code> nella console di Supabase.
        </div>
      )}

      {loading && !dati ? (
        <div className="p-10 text-center text-sm text-gray-500">Caricamento visite...</div>
      ) : dati && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Riquadro colore="blue" icona={<BarChart3 className="w-4 h-4 text-blue-500" />} titolo="Ultime 24 ore" valore={dati.totali.oggi24h.toLocaleString('it-IT')} />
            <Riquadro colore="emerald" icona={<BarChart3 className="w-4 h-4 text-emerald-500" />} titolo="Ultimi 7 giorni" valore={dati.totali.ultimi7gg.toLocaleString('it-IT')} />
            <Riquadro colore="amber" icona={<BarChart3 className="w-4 h-4 text-amber-500" />} titolo="Ultimi 30 giorni" valore={dati.totali.ultimi30gg.toLocaleString('it-IT')} />
            <Riquadro colore="purple" icona={<Users className="w-4 h-4 text-purple-500" />} titolo={`Sessioni (${periodo})`} valore={(d?.sessioni ?? dati.sessioniUniche30gg).toLocaleString('it-IT')} />
          </div>
          {d && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Riquadro colore="sky" icona={<Clock className="w-4 h-4 text-sky-500" />} titolo="Durata mediana" valore={`${Math.floor(d.durataMedianaSec / 60)}m ${d.durataMedianaSec % 60}s`} />
              <Riquadro colore="rose" icona={<LogOut className="w-4 h-4 text-rose-500" />} titolo="Usciti subito" valore={`${d.sessioni ? Math.round((100 * d.rimbalzi) / d.sessioni) : 0}%`} />
              <Riquadro colore="teal" icona={<LogIn className="w-4 h-4 text-teal-500" />} titolo="Sessioni registrate" valore={`${d.sessioni ? Math.round((100 * d.sessioniRegistrate) / d.sessioni) : 0}%`} />
              <Riquadro colore="indigo" icona={<Activity className="w-4 h-4 text-indigo-500" />} titolo="Azioni nei servizi" valore={d.eventi.toLocaleString('it-IT')} />
            </div>
          )}

          {vedi('andamento') && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="font-black text-sm text-primary uppercase tracking-wider mb-3">Andamento — ultimi 30 giorni</h3>
              <div className="flex items-end gap-1 h-32">
                {dati.serieGiornaliera.map((g) => (
                  <div key={g.giorno} className="flex-1 flex flex-col items-center justify-end">
                    <div className="w-full bg-primary/70 hover:bg-primary rounded-t-sm" style={{ height: `${Math.max(2, (g.visite / maxSerie) * 100)}%` }} title={`${g.giorno}: ${g.visite} visite`} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>{dati.serieGiornaliera[0]?.giorno}</span><span>{dati.serieGiornaliera[dati.serieGiornaliera.length - 1]?.giorno}</span>
              </div>
            </div>
          )}

          {d && vedi('entrata') && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TabellaConteggi titolo="Servizio d'entrata" icona={<LogIn className="w-4 h-4 text-primary" />} righe={d.entrata} etichettaColonna="Primo servizio" />
              <TabellaConteggi titolo="Servizio d'uscita" icona={<LogOut className="w-4 h-4 text-primary" />} righe={d.uscita} etichettaColonna="Ultimo servizio" />
              <TabellaConteggi titolo="Servizi più usati" icona={<MapPin className="w-4 h-4 text-primary" />} righe={d.servizi} etichettaColonna="Servizio" />
            </div>
          )}

          {d && vedi('provenienza') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TabellaConteggi titolo="Sito d'entrata (link completo)" icona={<Link2 className="w-4 h-4 text-primary" />} righe={d.sitiEntrata} etichettaColonna="Link" link />
              <TabellaConteggi titolo="Sito d'entrata (dominio)" icona={<Globe className="w-4 h-4 text-primary" />} righe={d.dominiEntrata} etichettaColonna="Dominio" />
              <TabellaConteggi titolo="Pagina d'atterraggio" icona={<MapPin className="w-4 h-4 text-primary" />} righe={d.pagineAtterraggio} etichettaColonna="Pagina" />
            </div>
          )}

          {d && vedi('campagne') && (
            <TabellaConteggi titolo="Campagne (sorgente · mezzo · campagna · contenuto)" icona={<Megaphone className="w-4 h-4 text-primary" />} righe={d.campagne} etichettaColonna="Campagna" />
          )}

          {d && vedi('parole') && (
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <TabellaConteggi titolo="Parole cercate nell'app" icona={<Search className="w-4 h-4 text-primary" />} righe={d.paroleCercate || []} etichettaColonna="Parola" />
                <TabellaConteggi titolo="Parola chiave della campagna (utm_term)" icona={<Megaphone className="w-4 h-4 text-primary" />} righe={d.paroleCampagna || []} etichettaColonna="Parola" />
              </div>
              <p className="text-[11px] text-gray-400">Le parole cercate su Google non arrivano a nessun sito dal 2011 («not provided»): si vedono solo in Google Search Console.</p>
            </div>
          )}

          {d && vedi('luoghi') && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TabellaConteggi titolo="Città" icona={<MapPin className="w-4 h-4 text-primary" />} righe={d.citta} etichettaColonna="Città" />
              <TabellaConteggi titolo="Regioni" icona={<MapPin className="w-4 h-4 text-primary" />} righe={d.regioni} etichettaColonna="Regione" />
              <TabellaConteggi titolo="Paesi" icona={<Globe className="w-4 h-4 text-primary" />} righe={d.paesi} etichettaColonna="Paese" />
            </div>
          )}

          {d && vedi('servizi') && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /><h3 className="font-black text-sm text-primary uppercase tracking-wider">Uso dei servizi</h3></div>
              {/* Servizi selezionabili, ricordati */}
              <div className="flex flex-wrap gap-1.5">
                {tuttiServizi.map((n) => (
                  <button key={n} onClick={() => alternaServizio(n)} className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${servizioVisibile(n) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200'}`}>
                    {NOMI_EVENTI[n] || n}
                  </button>
                ))}
                {tuttiServizi.length > 0 && <button onClick={() => setServiziScelti(null)} className="text-[11px] font-bold px-2 py-0.5 text-primary/70 underline">tutti</button>}
                {tuttiServizi.length > 0 && <button onClick={() => setServiziScelti([])} className="text-[11px] font-bold px-2 py-0.5 text-primary/70 underline">nessuno</button>}
              </div>
              {d.usoServizi.length === 0 ? <p className="text-sm text-gray-500">Ancora nessun dato.</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {d.usoServizi.filter((s) => servizioVisibile(s.nome)).map((s) => (
                    <div key={s.nome} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex justify-between items-baseline"><span className="font-bold text-sm text-gray-800">{NOMI_EVENTI[s.nome] || s.nome}</span><span className="font-black text-lg text-indigo-700">{s.conteggio.toLocaleString('it-IT')}</span></div>
                      {s.dettagli.length > 0 && <p className="text-[11px] text-gray-500 mt-1">{s.dettagli.map((x) => `${x.nome} ${x.conteggio}`).join(' · ')}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {d && vedi('percorsi') && (
            <TabellaConteggi titolo="Percorsi più frequenti" icona={<Route className="w-4 h-4 text-primary" />} righe={d.percorsi} etichettaColonna="Sequenza di servizi" />
          )}

          {d && vedi('orari') && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="font-black text-sm text-primary uppercase tracking-wider mb-3">Ore del giorno (ora italiana, {periodo})</h3>
              <div className="flex items-end gap-1 h-24">
                {d.perOra.map((o) => (
                  <div key={o.ora} className="flex-1 flex flex-col items-center justify-end">
                    <div className="w-full bg-sky-500/70 rounded-t-sm" style={{ height: `${Math.max(2, (o.visite / maxOra) * 100)}%` }} title={`${o.ora}:00 — ${o.visite}`} />
                    <span className="text-[8px] text-gray-400">{o.ora}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {d && vedi('app') && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TabellaConteggi titolo="Sito o app" icona={<Smartphone className="w-4 h-4 text-primary" />} righe={d.piattaforme} etichettaColonna="Piattaforma" />
              <TabellaConteggi titolo="Versione app" icona={<Smartphone className="w-4 h-4 text-primary" />} righe={d.versioniApp} etichettaColonna="Versione" />
              <TabellaConteggi titolo="Lingua dell'app" icona={<Languages className="w-4 h-4 text-primary" />} righe={d.lingue} etichettaColonna="Lingua" />
              <TabellaConteggi titolo="Dispositivi" icona={<Smartphone className="w-4 h-4 text-primary" />} righe={d.dispositivi} etichettaColonna="Tipo" />
              <TabellaConteggi titolo="Browser" icona={<Globe className="w-4 h-4 text-primary" />} righe={d.browser} etichettaColonna="Browser" />
            </div>
          )}

          {d && vedi('soldi') && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TabellaConteggi titolo={`Crediti spesi per servizio${d.crediti ? ` (${d.crediti.utentiPaganti} utenti)` : ''}`} icona={<Coins className="w-4 h-4 text-primary" />}
                righe={(d.crediti?.spesiPerServizio || []).map((x) => ({ nome: `${x.nome} (${x.volte} volte)`, conteggio: x.crediti }))} etichettaColonna="Servizio" />
              <TabellaConteggi titolo="Crediti entrati" icona={<Coins className="w-4 h-4 text-primary" />}
                righe={(d.crediti?.entrati || []).map((x) => ({ nome: `${x.nome} (${x.volte} volte)`, conteggio: x.crediti }))} etichettaColonna="Tipo · canale" />
              <TabellaConteggi titolo="Click affiliati (mese)" icona={<Link2 className="w-4 h-4 text-primary" />} righe={d.affiliati || []} etichettaColonna="Partner" />
            </div>
          )}

          {d && vedi('velocita') && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2"><Gauge className="w-4 h-4 text-primary" /><h3 className="font-black text-sm text-primary uppercase tracking-wider">Tempo di caricamento della prima pagina</h3></div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {(Object.entries(d.tempiCaricamento) as [string, { mediana: number; p90: number; campioni: number } | null][]).map(([k, v]) => (
                  <div key={k} className="border border-gray-100 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-primary/60">{k}</div>
                    {v ? <div className="font-bold text-gray-800">{(v.mediana / 1000).toFixed(1)} s <span className="text-xs text-gray-500">(il 90% sotto {(v.p90 / 1000).toFixed(1)} s · {v.campioni})</span></div> : <div className="text-gray-400">—</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              {dati.postHog?.stato === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
              <h3 className="font-black text-sm text-primary uppercase tracking-wider">Conferma incrociata — PostHog</h3>
            </div>
            {dati.postHog?.stato === 'ok' ? (
              <p className="text-sm text-gray-600">
                PostHog conta <strong>{Number(dati.postHog.pageview7gg).toLocaleString('it-IT')}</strong> pageview negli ultimi 7 giorni e{' '}
                <strong>{Number(dati.postHog.pageview30gg).toLocaleString('it-IT')}</strong> negli ultimi 30 — numero indipendente dal nostro.
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
