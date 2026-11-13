import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { RefreshCw, Download, Search, ChevronDown, ChevronRight, ExternalLink, AlertTriangle, CheckCircle2, XCircle, Globe, Package, Users, Wallet } from 'lucide-react';

// Scheda «Transazioni» (25/09/2026): i pagamenti reali delle tre casse —
// Apple App Store e Google Play (via RevenueCat) e Stripe (web) — in una
// sola tabella, con utente, paese, prodotto, importo, netto e stato.

interface Riga {
  id: string;
  piattaforma: 'apple' | 'google' | 'stripe' | 'amazon' | 'app';
  quando: string;
  ambiente: 'reale' | 'prova' | 'sconosciuto';
  stato: string;
  userId: string | null;
  email: string | null;
  nomeCliente: string | null;
  paese: string | null;
  paeseCarta: string | null;
  citta: string | null;
  lingua: string | null;
  prodotto: string;
  prodottoId: string | null;
  crediti: number | null;
  importo: number | null;
  valuta: string | null;
  importoStimato: boolean;
  prezzoUsd?: number | null;
  commissioni: number | null;
  tasse: number | null;
  netto: number | null;
  valutaNetto: string | null;
  nettoStimato?: boolean;
  rimborsato: number | null;
  metodo: string | null;
  idTransazione: string | null;
  idSessione: string | null;
  ricevuta: string | null;
  link: string | null;
  accreditato: boolean | null;
  esito?: string;
  dettagli: Record<string, any>;
  utente: { email: string | null; nome: string | null; iscrittoIl: string | null; saldo: number; admin: boolean } | null;
}

interface Risposta {
  generatoIl: string;
  giorni: number;
  fonti: any;
  righe: Riga[];
  eventiStore: any[];
}

const adminHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const PIATTAFORME: Record<string, { nome: string; classe: string }> = {
  apple: { nome: 'Apple', classe: 'bg-gray-900 text-white' },
  google: { nome: 'Google Play', classe: 'bg-emerald-600 text-white' },
  stripe: { nome: 'Stripe (web)', classe: 'bg-indigo-600 text-white' },
  amazon: { nome: 'Amazon', classe: 'bg-amber-500 text-white' },
  app: { nome: 'App (store ?)', classe: 'bg-gray-400 text-white' },
};

const STATI: Record<string, { nome: string; classe: string }> = {
  pagato: { nome: 'Pagato', classe: 'bg-emerald-50 text-emerald-700' },
  rimborsato: { nome: 'Rimborsato', classe: 'bg-orange-50 text-orange-700' },
  rimborso_parziale: { nome: 'Rimborso parziale', classe: 'bg-orange-50 text-orange-700' },
  contestato: { nome: 'Contestato', classe: 'bg-red-50 text-red-700' },
  non_pagato: { nome: 'Non pagato', classe: 'bg-red-50 text-red-700' },
  abbandonato: { nome: 'Checkout abbandonato', classe: 'bg-gray-100 text-gray-500' },
  in_corso: { nome: 'In corso', classe: 'bg-sky-50 text-sky-700' },
};

// Stati che contano come incasso (anche se poi rimborsati: il rimborso si sottrae a parte).
const INCASSATI = new Set(['pagato', 'rimborsato', 'rimborso_parziale', 'contestato']);

const bandiera = (cc: string | null) => {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...cc.toUpperCase().split('').map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
};

const nomePaese = (cc: string | null) => {
  if (!cc) return '—';
  try { return new Intl.DisplayNames(['it'], { type: 'region' }).of(cc.toUpperCase()) || cc; } catch { return cc; }
};

const soldi = (v: number | null | undefined, valuta: string | null | undefined) => {
  if (v === null || v === undefined || isNaN(Number(v))) return '—';
  try { return new Intl.NumberFormat('it-IT', { style: 'currency', currency: (valuta || 'EUR').toUpperCase() }).format(Number(v)); }
  catch { return `${Number(v).toFixed(2)} ${valuta || ''}`; }
};

const oraItaliana = (iso: string | null | undefined) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const giornoItaliano = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

// Somma per valuta: le valute non si mescolano (niente cambio inventato).
const perValuta = (righe: Riga[], campo: 'importo' | 'netto' | 'rimborsato') => {
  const m = new Map<string, number>();
  for (const r of righe) {
    const v = Number(r[campo]);
    if (!v || isNaN(v)) continue;
    const val = ((campo === 'netto' ? r.valutaNetto : r.valuta) || 'EUR').toUpperCase();
    m.set(val, (m.get(val) || 0) + v);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

const testoSomme = (coppie: [string, number][]) => coppie.length ? coppie.map(([v, n]) => soldi(n, v)).join(' + ') : '—';

function Riquadro({ titolo, valore, sotto, icona }: { titolo: string; valore: React.ReactNode; sotto?: React.ReactNode; icona?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary/60">{icona}{titolo}</div>
      <div className="mt-1 text-lg font-black text-gray-900 break-words">{valore}</div>
      {sotto && <div className="mt-0.5 text-xs text-gray-500">{sotto}</div>}
    </div>
  );
}

function Classifica({ titolo, icona, righe }: { titolo: string; icona: React.ReactNode; righe: { nome: React.ReactNode; chiave: string; conteggio: number; importi: string }[] }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-center gap-2">
        {icona}
        <h3 className="font-black text-sm text-primary uppercase tracking-wider">{titolo}</h3>
      </div>
      {righe.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">Nessun pagamento nel periodo.</div>
      ) : (
        <table className="w-full text-left">
          <tbody className="divide-y divide-gray-50">
            {righe.map(r => (
              <tr key={r.chiave}>
                <td className="px-4 py-2.5 text-sm text-gray-700">{r.nome}</td>
                <td className="px-4 py-2.5 text-sm font-bold text-gray-900 text-right whitespace-nowrap">{r.conteggio}</td>
                <td className="px-4 py-2.5 text-sm text-gray-600 text-right whitespace-nowrap">{r.importi}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const csvCampo = (v: any) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function AdminTransazioni() {
  const [giorni, setGiorni] = useState(90);
  const [dati, setDati] = useState<Risposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroPiattaforma, setFiltroPiattaforma] = useState('tutte');
  const [filtroStato, setFiltroStato] = useState('incassati');
  const [filtroPaese, setFiltroPaese] = useState('tutti');
  const [conProve, setConProve] = useState(false);
  const [cerca, setCerca] = useState('');
  const [aperta, setAperta] = useState<string | null>(null);
  const [mostraEventi, setMostraEventi] = useState(false);

  const carica = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl(`/api/admin/transazioni?giorni=${giorni}`), { headers: await adminHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDati(await res.json());
    } catch (e: any) {
      setError(e?.message || 'Errore nel caricamento delle transazioni');
    }
    setLoading(false);
  };

  useEffect(() => { carica(); }, [giorni]);

  const tutte = dati?.righe || [];
  const paesi = useMemo(() => [...new Set(tutte.map(r => r.paese).filter(Boolean) as string[])].sort(), [tutte]);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return tutte.filter(r => {
      if (!conProve && r.ambiente === 'prova') return false;
      if (filtroPiattaforma !== 'tutte' && r.piattaforma !== filtroPiattaforma) return false;
      if (filtroStato === 'incassati' && !INCASSATI.has(r.stato)) return false;
      if (filtroStato !== 'incassati' && filtroStato !== 'tutti' && r.stato !== filtroStato) return false;
      if (filtroPaese !== 'tutti' && (r.paese || '') !== filtroPaese) return false;
      if (q) {
        const dove = [r.email, r.nomeCliente, r.userId, r.idTransazione, r.idSessione, r.prodotto, r.utente?.email, r.utente?.nome, r.paese, nomePaese(r.paese)]
          .filter(Boolean).join(' ').toLowerCase();
        if (!dove.includes(q)) return false;
      }
      return true;
    });
  }, [tutte, conProve, filtroPiattaforma, filtroStato, filtroPaese, cerca]);

  const incassate = filtrate.filter(r => INCASSATI.has(r.stato));
  const acquirenti = new Set(incassate.map(r => r.userId || r.email).filter(Boolean)).size;
  const creditiVenduti = incassate.reduce((s, r) => s + (r.crediti || 0), 0);
  const nonAccreditati = incassate.filter(r => r.accreditato === false);

  const raggruppa = (chiave: (r: Riga) => string, etichetta: (k: string) => React.ReactNode) => {
    const m = new Map<string, Riga[]>();
    for (const r of incassate) { const k = chiave(r); m.set(k, [...(m.get(k) || []), r]); }
    return [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, arr]) => ({ chiave: k, nome: etichetta(k), conteggio: arr.length, importi: testoSomme(perValuta(arr, 'importo')) }));
  };

  // Serie giornaliera (ora italiana), anche i giorni a zero.
  const serie = useMemo(() => {
    const n = Math.min(giorni, 90);
    const out: { giorno: string; conteggio: number }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const g = giornoItaliano(new Date(Date.now() - i * 86400000).toISOString());
      out.push({ giorno: g, conteggio: incassate.filter(r => giornoItaliano(r.quando) === g).length });
    }
    return out;
  }, [incassate, giorni]);
  const maxSerie = Math.max(1, ...serie.map(s => s.conteggio));

  const esportaCsv = () => {
    const colonne: [string, (r: Riga) => any][] = [
      ['data_ora_italia', r => oraItaliana(r.quando)], ['piattaforma', r => PIATTAFORME[r.piattaforma]?.nome || r.piattaforma],
      ['ambiente', r => r.ambiente], ['stato', r => STATI[r.stato]?.nome || r.stato], ['user_id', r => r.userId],
      ['email', r => r.email || r.utente?.email], ['nome', r => r.nomeCliente || r.utente?.nome], ['paese', r => r.paese],
      ['paese_carta', r => r.paeseCarta], ['citta', r => r.citta], ['prodotto', r => r.prodotto], ['crediti', r => r.crediti],
      ['importo', r => r.importo], ['valuta', r => r.valuta], ['importo_stimato', r => r.importoStimato ? 'si' : ''],
      ['prezzo_usd', r => r.prezzoUsd], ['commissioni', r => r.commissioni], ['tasse', r => r.tasse], ['netto', r => r.netto],
      ['valuta_netto', r => r.valutaNetto], ['rimborsato', r => r.rimborsato], ['metodo', r => r.metodo],
      ['id_transazione', r => r.idTransazione], ['id_sessione_originale', r => r.idSessione],
      ['crediti_accreditati', r => r.accreditato === null ? '' : r.accreditato ? 'si' : 'NO'],
    ];
    const testo = [colonne.map(c => c[0]).join(';'), ...filtrate.map(r => colonne.map(c => csvCampo(c[1](r))).join(';'))].join('\r\n');
    const blob = new Blob(['﻿' + testo], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transazioni-wip-${giornoItaliano(new Date().toISOString())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const f = dati?.fonti || {};
  const avvisi: React.ReactNode[] = [];
  if (f.stripe?.stato === 'non_configurato') avvisi.push('Stripe non configurato sul server: nessun pagamento web.');
  if (f.stripe?.stato === 'errore') avvisi.push(`Stripe non risponde: ${f.stripe.errore}`);
  if (f.stripe?.stato === 'ok' && f.stripe.modalitaChiave === 'prova') avvisi.push('La chiave Stripe del server è in modalità PROVA (test): i pagamenti web non sono reali. Attiva «Mostra prove» per vederli.');
  if (f.stripe?.troncato) avvisi.push('Più di 1.000 checkout Stripe nel periodo: mostrati i più recenti 1.000.');
  if (f.store?.stato === 'tabella_mancante') avvisi.push('Il registro degli store (tabella transazioni_store) non esiste ancora: Apple e Google mostrano solo lo storico dei crediti.');
  if (f.store?.stato === 'errore') avvisi.push(`Registro Apple/Google non leggibile: ${f.store.errore}`);
  if (f.store && !f.store.webhookConfigurato) avvisi.push('REVENUECAT_WEBHOOK_SECRET mancante: gli acquisti Apple/Google non arrivano al server.');
  if (f.store?.registroDal) avvisi.push(`Dettaglio completo Apple/Google (prezzo, paese, commissioni) dal ${oraItaliana(f.store.registroDal)}. Gli acquisti precedenti sono «storico»: importo = prezzo di listino, senza paese.`);
  else if (f.store?.stato === 'ok') avvisi.push('Registro Apple/Google attivo ma ancora vuoto: il dettaglio completo (prezzo, paese, commissioni) arriva dal prossimo acquisto. Gli acquisti già fatti sono «storico»: importo = prezzo di listino, senza paese.');
  if (f.mastro?.stato === 'errore') avvisi.push(`Libro crediti non leggibile: ${f.mastro.errore}`);

  const selezione = 'bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-700';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500 max-w-2xl">
          Pagamenti reali di Apple App Store e Google Play (via RevenueCat) e del sito (Stripe). Orari in ora italiana; importi nella valuta pagata dal cliente, mai convertiti.
        </p>
        <div className="flex items-center gap-2">
          <select value={giorni} onChange={e => setGiorni(Number(e.target.value))} className={selezione}>
            <option value={7}>Ultimi 7 giorni</option>
            <option value={30}>Ultimi 30 giorni</option>
            <option value={90}>Ultimi 90 giorni</option>
            <option value={365}>Ultimo anno</option>
            <option value={730}>Ultimi 2 anni</option>
          </select>
          <button onClick={carica} disabled={loading} className="p-2 rounded-xl bg-white border border-gray-200 text-primary disabled:opacity-50" title="Aggiorna">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={esportaCsv} disabled={!filtrate.length} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider disabled:opacity-40">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 text-red-700 text-sm font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>
      )}

      {avvisi.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 space-y-1">
          {avvisi.map((a, i) => <div key={i} className="text-xs text-amber-800 flex gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{a}</span></div>)}
        </div>
      )}

      {loading && !dati ? (
        <div className="py-16 text-center text-sm font-bold text-on-surface-variant/70">Leggo Stripe e il registro degli store…</div>
      ) : dati && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Riquadro icona={<Wallet className="w-3.5 h-3.5" />} titolo="Incassato lordo" valore={testoSomme(perValuta(incassate, 'importo'))}
              sotto={incassate.some(r => r.importoStimato) ? 'include importi di listino (storico)' : `${incassate.length} pagamenti`} />
            <Riquadro titolo="Netto (dopo commissioni)" valore={testoSomme(perValuta(incassate, 'netto'))}
              sotto={incassate.some(r => r.nettoStimato) ? 'Apple/Google: stima RevenueCat' : 'Stripe: netto reale'} />
            <Riquadro icona={<Users className="w-3.5 h-3.5" />} titolo="Acquirenti unici" valore={acquirenti.toLocaleString('it-IT')}
              sotto={`${creditiVenduti.toLocaleString('it-IT')} crediti venduti`} />
            <Riquadro titolo="Rimborsi" valore={testoSomme(perValuta(incassate, 'rimborsato'))}
              sotto={nonAccreditati.length ? <span className="text-red-600 font-bold">{nonAccreditati.length} pagati SENZA crediti</span> : 'crediti arrivati a tutti'} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['apple', 'google', 'stripe'] as const).map(p => {
              const arr = incassate.filter(r => r.piattaforma === p);
              return (
                <button key={p} onClick={() => setFiltroPiattaforma(filtroPiattaforma === p ? 'tutte' : p)}
                  className={`text-left bg-white rounded-2xl border shadow-sm p-4 transition-all ${filtroPiattaforma === p ? 'border-primary ring-2 ring-primary/20' : 'border-gray-100'}`}>
                  <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${PIATTAFORME[p].classe}`}>{PIATTAFORME[p].nome}</span>
                  <div className="mt-2 text-lg font-black text-gray-900">{testoSomme(perValuta(arr, 'importo'))}</div>
                  <div className="text-xs text-gray-500">{arr.length} pagamenti · netto {testoSomme(perValuta(arr, 'netto'))}</div>
                </button>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="font-black text-sm text-primary uppercase tracking-wider mb-3">Pagamenti al giorno</h3>
            <div className="flex items-end gap-[2px] h-24">
              {serie.map(s => (
                <div key={s.giorno} className="flex-1 bg-primary/80 rounded-t min-h-[2px]" style={{ height: `${(s.conteggio / maxSerie) * 100}%`, opacity: s.conteggio ? 1 : 0.15 }}
                  title={`${s.giorno}: ${s.conteggio}`} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>{serie[0]?.giorno}</span><span>{serie[serie.length - 1]?.giorno}</span></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Classifica titolo="Per paese" icona={<Globe className="w-4 h-4 text-primary" />}
              righe={raggruppa(r => r.paese || '—', k => <span>{bandiera(k === '—' ? null : k)} {k === '—' ? 'Paese non noto' : nomePaese(k)}</span>)} />
            <Classifica titolo="Per prodotto" icona={<Package className="w-4 h-4 text-primary" />}
              righe={raggruppa(r => r.prodotto, k => k)} />
            <Classifica titolo="Migliori clienti" icona={<Users className="w-4 h-4 text-primary" />}
              righe={raggruppa(r => r.email || r.utente?.email || r.userId || '—', k => <span className="truncate block max-w-[200px]">{k}</span>).slice(0, 10)} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={cerca} onChange={e => setCerca(e.target.value)} placeholder="Email, utente, id transazione, paese…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm" />
              </div>
              <select value={filtroPiattaforma} onChange={e => setFiltroPiattaforma(e.target.value)} className={selezione}>
                <option value="tutte">Tutte le piattaforme</option>
                <option value="apple">Apple</option>
                <option value="google">Google Play</option>
                <option value="stripe">Stripe (web)</option>
                <option value="app">App (store non noto)</option>
              </select>
              <select value={filtroStato} onChange={e => setFiltroStato(e.target.value)} className={selezione}>
                <option value="incassati">Solo incassati</option>
                <option value="tutti">Tutti (anche abbandonati)</option>
                {Object.entries(STATI).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
              </select>
              <select value={filtroPaese} onChange={e => setFiltroPaese(e.target.value)} className={selezione}>
                <option value="tutti">Tutti i paesi</option>
                {paesi.map(p => <option key={p} value={p}>{bandiera(p)} {nomePaese(p)}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs font-bold text-gray-600 cursor-pointer">
                <input type="checkbox" checked={conProve} onChange={e => setConProve(e.target.checked)} /> Mostra prove (test/sandbox)
              </label>
            </div>

            {filtrate.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">Nessuna transazione con questi filtri.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['', 'Data (Italia)', 'Piattaforma', 'Utente', 'Paese', 'Prodotto', 'Importo', 'Netto', 'Metodo', 'Stato', 'Crediti'].map(h => (
                        <th key={h} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filtrate.map(r => {
                      const apri = aperta === r.id;
                      return (
                        <React.Fragment key={r.id}>
                          <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setAperta(apri ? null : r.id)}>
                            <td className="pl-3 py-2.5 text-gray-400">{apri ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                            <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">{oraItaliana(r.quando)}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${PIATTAFORME[r.piattaforma]?.classe || 'bg-gray-400 text-white'}`}>{PIATTAFORME[r.piattaforma]?.nome || r.piattaforma}</span>
                              {r.ambiente !== 'reale' && <span className="ml-1 inline-block px-1.5 py-0.5 rounded-lg text-[10px] font-black uppercase bg-yellow-100 text-yellow-800">{r.ambiente}</span>}
                            </td>
                            <td className="px-3 py-2.5 text-xs max-w-[220px]">
                              <div className="font-bold text-gray-900 truncate">{r.email || r.utente?.email || '—'}</div>
                              <div className="text-gray-500 truncate">{r.nomeCliente || r.utente?.nome || (r.userId ? r.userId.slice(0, 8) + '…' : '')}</div>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">{r.paese ? `${bandiera(r.paese)} ${r.paese.toUpperCase()}` : '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-gray-700">{r.prodotto}</td>
                            <td className="px-3 py-2.5 text-sm font-bold text-gray-900 whitespace-nowrap">
                              {soldi(r.importo, r.valuta)}{r.importoStimato && <span className="text-[10px] font-normal text-gray-400"> listino</span>}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-nowrap">{soldi(r.netto, r.valutaNetto)}{r.netto != null && r.nettoStimato && <span className="text-[10px] text-gray-400"> stima</span>}</td>
                            <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{r.metodo || '—'}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black ${STATI[r.stato]?.classe || 'bg-gray-100 text-gray-600'}`}>{STATI[r.stato]?.nome || r.stato}</span>
                            </td>
                            <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                              {r.accreditato === true && <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" />{r.crediti ?? ''}</span>}
                              {r.accreditato === false && <span className="flex items-center gap-1 text-red-600 font-bold"><XCircle className="w-3.5 h-3.5" />NON arrivati</span>}
                              {r.accreditato === null && <span className="text-gray-400">{r.crediti ?? '—'}</span>}
                            </td>
                          </tr>
                          {apri && (
                            <tr className="bg-gray-50/70">
                              <td colSpan={11} className="px-6 py-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                  <div className="space-y-1">
                                    <div className="font-black uppercase tracking-wider text-primary/60 text-[10px]">Cliente</div>
                                    <div><b>User id:</b> <span className="font-mono">{r.userId || '—'}</span></div>
                                    <div><b>Email:</b> {r.email || r.utente?.email || '—'}</div>
                                    <div><b>Nome:</b> {r.nomeCliente || r.utente?.nome || '—'}</div>
                                    <div><b>Paese:</b> {r.paese ? `${bandiera(r.paese)} ${nomePaese(r.paese)}` : '—'}{r.citta ? ` · ${r.citta}` : ''}</div>
                                    {r.paeseCarta && <div><b>Paese della carta:</b> {bandiera(r.paeseCarta)} {nomePaese(r.paeseCarta)}</div>}
                                    {r.lingua && <div><b>Lingua checkout:</b> {r.lingua}</div>}
                                    {r.utente && <>
                                      <div><b>Iscritto il:</b> {oraItaliana(r.utente.iscrittoIl)}</div>
                                      <div><b>Saldo crediti oggi:</b> {r.utente.saldo.toLocaleString('it-IT')}{r.utente.admin ? ' · amministratore' : ''}</div>
                                    </>}
                                    <div><b>Acquisti nel periodo:</b> {tutte.filter(x => INCASSATI.has(x.stato) && x.userId && x.userId === r.userId).length}</div>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="font-black uppercase tracking-wider text-primary/60 text-[10px]">Pagamento</div>
                                    <div><b>Importo:</b> {soldi(r.importo, r.valuta)}{r.importoStimato ? ' (prezzo di listino, stima)' : ''}</div>
                                    {r.prezzoUsd != null && <div><b>In dollari (RevenueCat):</b> {soldi(r.prezzoUsd, 'USD')}</div>}
                                    <div><b>Commissioni:</b> {soldi(r.commissioni, r.valutaNetto || r.valuta)}</div>
                                    <div><b>Tasse:</b> {soldi(r.tasse, r.valuta)}</div>
                                    <div><b>Netto:</b> {soldi(r.netto, r.valutaNetto)}{r.nettoStimato ? ' (stima RevenueCat)' : ''}</div>
                                    {!!r.rimborsato && <div className="text-orange-700"><b>Rimborsato:</b> {soldi(r.rimborsato, r.valuta)}</div>}
                                    <div><b>Metodo:</b> {r.metodo || '—'}</div>
                                    <div><b>Crediti:</b> {r.crediti ?? '—'} {r.accreditato === true ? '· accreditati' : r.accreditato === false ? '· NON accreditati' : ''}</div>
                                  </div>
                                  <div className="space-y-1">
                                    <div className="font-black uppercase tracking-wider text-primary/60 text-[10px]">Riferimenti</div>
                                    <div className="break-all"><b>Id transazione:</b> <span className="font-mono">{r.idTransazione || '—'}</span></div>
                                    {r.idSessione && <div className="break-all"><b>{r.piattaforma === 'stripe' ? 'Sessione checkout' : 'Transazione originale'}:</b> <span className="font-mono">{r.idSessione}</span></div>}
                                    {Object.entries(r.dettagli || {}).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(typeof v === 'object' && !Object.keys(v).length)).map(([k, v]) => (
                                      <div key={k} className="break-all"><b>{k.replace(/_/g, ' ')}:</b> <span className="font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span></div>
                                    ))}
                                    <div className="flex gap-3 pt-1">
                                      {r.link && <a href={r.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary font-bold"><ExternalLink className="w-3.5 h-3.5" />Apri in Stripe</a>}
                                      {r.ricevuta && <a href={r.ricevuta} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary font-bold"><ExternalLink className="w-3.5 h-3.5" />Ricevuta</a>}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-3 border-t border-gray-100 text-[11px] text-gray-400">
              {filtrate.length} righe · aggiornato {oraItaliana(dati.generatoIl)}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button onClick={() => setMostraEventi(!mostraEventi)} className="w-full p-4 flex items-center gap-2 text-left">
              {mostraEventi ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <h3 className="font-black text-sm text-primary uppercase tracking-wider">Registro eventi Apple/Google ({dati.eventiStore.length})</h3>
              <span className="text-xs text-gray-500">tutto ciò che RevenueCat ha mandato: acquisti, annullamenti, prove</span>
            </button>
            {mostraEventi && (
              dati.eventiStore.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-500">Nessun evento registrato nel periodo.</div>
              ) : (
                <div className="overflow-x-auto border-t border-gray-100">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50">
                        {['Ricevuto', 'Tipo', 'Store', 'Ambiente', 'Esito', 'Utente', 'Prodotto', 'Paese', 'Motivo'].map(h => (
                          <th key={h} className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-primary/60 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {dati.eventiStore.map((e, i) => (
                        <tr key={i} className="text-xs text-gray-700">
                          <td className="px-3 py-2 whitespace-nowrap">{oraItaliana(e.ricevuto || e.quando)}</td>
                          <td className="px-3 py-2 font-mono">{e.tipo}</td>
                          <td className="px-3 py-2">{PIATTAFORME[e.piattaforma]?.nome || e.store}</td>
                          <td className="px-3 py-2">{e.ambiente}</td>
                          <td className="px-3 py-2">{e.esito}</td>
                          <td className="px-3 py-2 font-mono truncate max-w-[160px]">{e.userId}</td>
                          <td className="px-3 py-2">{e.prodotto}</td>
                          <td className="px-3 py-2">{e.paese ? `${bandiera(e.paese)} ${e.paese}` : '—'}</td>
                          <td className="px-3 py-2">{e.motivo || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
