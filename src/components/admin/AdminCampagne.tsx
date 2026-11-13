import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw, Send, Eye, Inbox, Ticket, AlertTriangle, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import AdminArchivioEnti from './AdminArchivioEnti';

/**
 * CAMPAGNE — il conto di ogni invio (11/10/2026, committente: «crea pannello per campagne, con tutte le
 * statistiche dettagliate»). Una campagna è il valore messo nel link dell'email (?c=enti-it, ?c=hotel-fr…).
 * Per ciascuna: email inviate ed errori (registro lasciato dallo script che spedisce via Armada), visite e
 * persone arrivate sulle pagine /comuni /hotel /riscatta, richieste dal modulo, coupon approvati, riscatti.
 * Le APERTURE non ci sono e non ci saranno: le email sono testo semplice, senza pixel — è anche ciò che le tiene
 * fuori dallo spam. Il numero che dice se un'email ha funzionato è «persone arrivate / inviate».
 */

interface Riga { campagna: string; inviate: number; errori: number; visite: number; persone: number; pagine: Record<string, number>; richieste: number; coupon: number; riscatti: number; }
interface Dati {
  giorni: number; campagne: Riga[]; totale: Omit<Riga, 'campagna' | 'pagine'>;
  perPaese: Record<string, number>; perGiorno: Array<{ giorno: string; inviate: number; visite: number; richieste: number }>;
  ultimi: Array<{ lista: string; campagna?: string; email: string; ente?: string; paese?: string; oggetto?: string; esito: string; quando: string }>;
  errori: Array<{ email: string; ente?: string; esito: string; quando: string }>;
  ricerca?: Ricerca | null;
}
interface ListaRicerca { totale: number; nuovi_24h: number; per_paese: Record<string, number>; }
/** Lo stato della ricerca dei contatti su Oracle, mandato ogni ora da contatti-manda-stato.py. */
interface Ricerca { hotel: ListaRicerca; enti: ListaRicerca; processi: string[]; ultime: string[]; citta: { fatte: number; totali: number }; _salvatoIl?: string; }

const adminHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const pct = (a: number, b: number) => (b > 0 ? `${(Math.round((a / b) * 1000) / 10).toLocaleString('it-IT')}%` : '—');
const ora = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

interface Props { onMessage: (m: { type: 'success' | 'error'; text: string }) => void; }

export default function AdminCampagne({ onMessage }: Props) {
  const [dati, setDati] = useState<Dati | null>(null);
  const [giorni, setGiorni] = useState(30);
  const [caricamento, setCaricamento] = useState(false);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const r = await fetch(getApiUrl(`/api/admin/enti/statistiche?giorni=${giorni}`), { headers: await adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setDati(j);
    } catch (e: any) {
      onMessage({ type: 'error', text: `Statistiche non lette: ${e.message}` });
    } finally {
      setCaricamento(false);
    }
  }, [giorni, onMessage]);
  useEffect(() => { void carica(); }, [carica]);

  const t = dati?.totale;
  const paesi = (Object.entries(dati?.perPaese || {}) as Array<[string, number]>).sort((a, b) => Number(b[1]) - Number(a[1]));
  const massimoGiorno = Math.max(1, ...(dati?.perGiorno || []).map((g) => Math.max(g.inviate, g.visite)));

  const Casella = ({ icona, etichetta, valore, sotto }: { icona: React.ReactNode; etichetta: string; valore: React.ReactNode; sotto?: string }) => (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="text-[10px] font-black uppercase tracking-wider text-primary/50 flex items-center gap-1">{icona}{etichetta}</div>
      <div className="text-2xl font-black text-primary mt-1">{valore}</div>
      {sotto && <div className="text-[11px] font-bold text-primary/50">{sotto}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-[#f8f5f0] p-4 rounded-3xl border border-gray-100 flex flex-wrap items-center gap-2">
        <h4 className="font-black text-sm text-primary uppercase tracking-wider flex items-center gap-2 mr-2">
          <BarChart3 className="w-4 h-4 text-secondary" /> Campagne email
        </h4>
        {[7, 30, 90].map((g) => (
          <button key={g} type="button" onClick={() => setGiorni(g)} className={`px-3 py-1 rounded-full text-[11px] font-black ${giorni === g ? 'bg-primary text-white' : 'bg-white text-primary/70'}`}>{g} giorni</button>
        ))}
        <button type="button" onClick={() => void carica()} className="ml-auto p-2 rounded-xl bg-white text-primary" title="Ricarica">
          <RefreshCw className={`w-4 h-4 ${caricamento ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Casella icona={<Send className="w-3 h-3" />} etichetta="Inviate" valore={t.inviate} sotto={t.errori ? `${t.errori} non partite` : 'nessun errore'} />
          <Casella icona={<Eye className="w-3 h-3" />} etichetta="Persone arrivate" valore={t.persone} sotto={`${t.visite} visite · ${pct(t.persone, t.inviate)} delle inviate`} />
          <Casella icona={<Inbox className="w-3 h-3" />} etichetta="Richieste" valore={t.richieste} sotto={`${pct(t.richieste, t.persone)} di chi arriva · ${pct(t.richieste, t.inviate)} delle inviate`} />
          <Casella icona={<Ticket className="w-3 h-3" />} etichetta="Coupon approvati" valore={t.coupon} />
          <Casella icona={<Ticket className="w-3 h-3" />} etichetta="Riscatti" valore={t.riscatti} sotto={t.coupon ? `${(Math.round((t.riscatti / t.coupon) * 10) / 10).toLocaleString('it-IT')} per coupon` : undefined} />
        </div>
      )}

      <AdminArchivioEnti onMessage={onMessage} />

      {/* RICERCA CONTATTI (12/10/2026): gira su Oracle e scrive file; qui il conto che Oracle manda ogni ora.
          Sono indirizzi GREZZI: prima di spedire vanno tolti portali, agenzie e doppioni. */}
      <div className="bg-white rounded-3xl border border-gray-100 p-4">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="text-[10px] font-black uppercase tracking-wider text-primary/60 flex items-center gap-1"><Search className="w-3 h-3" /> Ricerca contatti</div>
          {dati?.ricerca && (() => {
            const eta = dati.ricerca._salvatoIl ? (Date.now() - Date.parse(dati.ricerca._salvatoIl)) / 3600000 : Infinity;
            const gira = dati.ricerca.processi.length > 0;
            return (
              <>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${gira ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{gira ? `in corso · ${dati.ricerca.processi.length} processi` : 'ferma'}</span>
                <span className={`text-[10px] font-bold ${eta > 3 ? 'text-red-600' : 'text-primary/40'}`}>
                  {dati.ricerca._salvatoIl ? `aggiornato ${ora(dati.ricerca._salvatoIl)}` : ''}{eta > 3 ? ' — Oracle non manda lo stato da più di 3 ore' : ''}
                </span>
              </>
            );
          })()}
        </div>
        {dati?.ricerca ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {([['Hotel trovati', dati.ricerca.hotel], ['Enti trovati', dati.ricerca.enti]] as Array<[string, ListaRicerca]>).map(([nome, l]) => (
                <div key={nome} className="bg-[#f8f5f0] rounded-2xl p-3">
                  <div className="text-[10px] font-black uppercase tracking-wider text-primary/50">{nome}</div>
                  <div className="text-2xl font-black text-primary">{l.totale.toLocaleString('it-IT')}</div>
                  <div className="text-[11px] font-bold text-primary/50">+{l.nuovi_24h.toLocaleString('it-IT')} nelle ultime 24 ore</div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(Object.entries(l.per_paese) as Array<[string, number]>).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([p, n]) => (
                      <span key={p} className="px-1.5 py-0.5 rounded-full bg-white text-[10px] font-bold text-primary/70">{p} <b className="text-primary">{n}</b></span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="bg-[#f8f5f0] rounded-2xl p-3 col-span-2 md:col-span-1">
                <div className="text-[10px] font-black uppercase tracking-wider text-primary/50">Città del mondo</div>
                <div className="text-2xl font-black text-primary">{dati.ricerca.citta.fatte.toLocaleString('it-IT')}<span className="text-primary/40 text-base"> / {dati.ricerca.citta.totali.toLocaleString('it-IT')}</span></div>
                <div className="text-[11px] font-bold text-primary/50">{pct(dati.ricerca.citta.fatte, dati.ricerca.citta.totali)} del giro «all'infinito»</div>
                <div className="mt-2 space-y-0.5">
                  {dati.ricerca.processi.map((p, i) => <div key={i} className="text-[10px] text-primary/60 font-bold truncate">▸ {p}</div>)}
                </div>
              </div>
            </div>
            {!!dati.ricerca.ultime.length && (
              <div className="mt-2 space-y-0.5">
                {dati.ricerca.ultime.map((u, i) => <div key={i} className="text-[10px] text-primary/50 truncate">{u}</div>)}
              </div>
            )}
            <p className="text-[10px] text-primary/40 font-bold mt-2">Indirizzi grezzi, letti sui siti ufficiali: prima di spedire si tolgono portali, agenzie e doppioni. Esclusi quelli già contattati.</p>
          </>
        ) : (
          <p className="text-[12px] text-primary/50">Nessuno stato ricevuto: Oracle lo manda ogni ora.</p>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 p-4 overflow-x-auto">
        <div className="text-[10px] font-black uppercase tracking-wider text-primary/60 mb-2">Per campagna</div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-primary/50 text-[10px] uppercase">
              <th className="py-1 pr-3">Campagna</th><th className="pr-3">Inviate</th><th className="pr-3">Errori</th><th className="pr-3">Visite</th>
              <th className="pr-3">Persone</th><th className="pr-3">Arrivo</th><th className="pr-3">Richieste</th><th className="pr-3">Risposta</th><th className="pr-3">Coupon</th><th>Riscatti</th>
            </tr>
          </thead>
          <tbody>
            {(dati?.campagne || []).map((r) => (
              <tr key={r.campagna} className="border-t border-gray-100 text-primary/80 font-medium">
                <td className="py-1.5 pr-3 font-black text-primary">{r.campagna}<span className="text-primary/40 font-bold"> {Object.entries(r.pagine || {}).map(([p, n]) => `${p} ${n}`).join(' · ')}</span></td>
                <td className="pr-3">{r.inviate}</td><td className={`pr-3 ${r.errori ? 'text-red-600 font-black' : ''}`}>{r.errori}</td>
                <td className="pr-3">{r.visite}</td><td className="pr-3">{r.persone}</td><td className="pr-3">{pct(r.persone, r.inviate)}</td>
                <td className="pr-3">{r.richieste}</td><td className="pr-3">{pct(r.richieste, r.inviate)}</td><td className="pr-3">{r.coupon}</td><td>{r.riscatti}</td>
              </tr>
            ))}
            {!dati?.campagne?.length && <tr><td colSpan={10} className="py-3 text-primary/50">Ancora nessun dato in questo periodo.</td></tr>}
          </tbody>
        </table>
        <p className="text-[10px] text-primary/40 font-bold mt-2">«Arrivo» = persone arrivate sulla pagina ogni 100 email inviate. «Risposta» = richieste dal modulo ogni 100 inviate (le risposte per email non sono contate qui: stanno nella casella). «(diretto)» = arrivi senza campagna nel link.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-gray-100 p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-primary/60 mb-2">Giorno per giorno</div>
          <div className="space-y-1.5">
            {(dati?.perGiorno || []).slice(0, 21).map((g) => (
              <div key={g.giorno} className="text-[11px]">
                <div className="flex justify-between text-primary/70 font-bold"><span>{g.giorno.slice(8, 10)}/{g.giorno.slice(5, 7)}</span><span>{g.inviate} inviate · {g.visite} visite · {g.richieste} richieste</span></div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex"><div className="bg-primary/70" style={{ width: `${(g.inviate / massimoGiorno) * 100}%` }} /></div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-0.5"><div className="bg-emerald-500 h-full" style={{ width: `${(g.visite / massimoGiorno) * 100}%` }} /></div>
              </div>
            ))}
            {!dati?.perGiorno?.length && <p className="text-[12px] text-primary/50">Nessun giorno con attività.</p>}
          </div>
          <p className="text-[10px] text-primary/40 font-bold mt-2">Blu: inviate · verde: visite alle pagine.</p>
        </div>
        <div className="bg-white rounded-3xl border border-gray-100 p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-primary/60 mb-2">Inviate per paese</div>
          <div className="flex flex-wrap gap-1.5">
            {paesi.map(([p, n]) => <span key={p} className="px-2 py-1 rounded-full bg-[#f8f5f0] text-[11px] font-bold text-primary/80">{p} <b className="text-primary">{n}</b></span>)}
            {!paesi.length && <p className="text-[12px] text-primary/50">Nessun invio registrato.</p>}
          </div>
          {!!dati?.errori?.length && (
            <div className="mt-4">
              <div className="text-[10px] font-black uppercase tracking-wider text-red-600 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Non partite</div>
              {dati.errori.map((e, i) => <div key={i} className="text-[11px] text-primary/70">{ora(e.quando)} · {e.email} · {e.esito}</div>)}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 p-4">
        <div className="text-[10px] font-black uppercase tracking-wider text-primary/60 mb-2">Ultimi invii</div>
        <div className="space-y-1">
          {(dati?.ultimi || []).map((u, i) => (
            <div key={i} className="text-[11px] text-primary/80 flex flex-wrap gap-x-2">
              <span className="text-primary/40 font-bold">{ora(u.quando)}</span>
              <span className={`font-black ${u.esito === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{u.esito}</span>
              <span className="font-bold">{u.ente || u.email}</span>
              <span className="text-primary/50">{u.paese} · {u.campagna || u.lista}</span>
              <span className="text-primary/60 truncate">{u.oggetto}</span>
            </div>
          ))}
          {!dati?.ultimi?.length && <p className="text-[12px] text-primary/50">Nessun invio registrato: lo script di invio lascia qui una riga per ogni email partita.</p>}
        </div>
      </div>
    </div>
  );
}
