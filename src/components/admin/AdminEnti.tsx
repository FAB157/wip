import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Hotel, Mail, RefreshCw, Ticket, Check, X, StickyNote, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';

/**
 * ENTI, PRO LOCO E HOTEL — la scrivania delle richieste (11/10/2026, committente: «tab admin per gestione del
 * tutto»). Le richieste arrivano dalle pagine /comuni e /hotel (tabella `richieste_enti`); qui si leggono, si
 * cambia lo stato, si risponde per email, si scrive una nota interna e, per gli hotel, si approva il coupon di
 * prova (50 utilizzi × 500 crediti, 90 giorni) che il server crea e manda da solo. Ogni email e ogni nota
 * restano nel diario (`corrispondenza`) della richiesta: la storia di un ente si legge in un posto solo.
 */

type Stato = 'nuova' | 'in_lavorazione' | 'fatta' | 'rifiutata';
interface Richiesta {
  id: string; creata_il: string; tipo: string; ente: string; localita: string; paese?: string | null; sito?: string | null;
  referente?: string | null; ruolo?: string | null; email: string; telefono?: string | null; servizi: string[];
  luoghi?: string | null; materiale?: string | null; note?: string | null; lingua: string; ricontatto: string;
  stato: Stato; corrispondenza: any[]; camere?: number | null; aggiornata_il?: string | null;
}

const STATI: Array<{ id: Stato | ''; nome: string }> = [
  { id: '', nome: 'Tutte' }, { id: 'nuova', nome: 'Nuove' }, { id: 'in_lavorazione', nome: 'In lavorazione' }, { id: 'fatta', nome: 'Fatte' }, { id: 'rifiutata', nome: 'Rifiutate' },
];
const TIPI: Record<string, string> = {
  comune: 'Comune', pro_loco: 'Pro loco', ufficio_turistico: 'Ufficio turistico', museo: 'Museo', chiesa: 'Parrocchia / chiesa',
  parco: 'Parco', associazione: 'Associazione', hotel: 'Hotel', altro: 'Altro',
};
const SERVIZI: Record<string, string> = { luoghi: 'luoghi sulla mappa', audioguida: 'audioguida', guida_museo: 'guida museo', coupon_prova: 'coupon di prova' };
const COLORE_STATO: Record<Stato, string> = {
  nuova: 'bg-amber-100 text-amber-800', in_lavorazione: 'bg-sky-100 text-sky-800', fatta: 'bg-emerald-100 text-emerald-800', rifiutata: 'bg-gray-200 text-gray-600',
};

const adminHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
};
const quando = (iso?: string | null) => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

interface Props { onMessage: (m: { type: 'success' | 'error'; text: string }) => void; }

export default function AdminEnti({ onMessage }: Props) {
  const [righe, setRighe] = useState<Richiesta[]>([]);
  const [conteggi, setConteggi] = useState<Record<string, number>>({});
  const [stato, setStato] = useState<Stato | ''>('');
  const [tipo, setTipo] = useState<string>('');
  const [caricamento, setCaricamento] = useState(false);
  const [aperta, setAperta] = useState<string | null>(null);
  const [risposta, setRisposta] = useState<{ oggetto: string; testo: string }>({ oggetto: '', testo: '' });
  const [nota, setNota] = useState('');
  const [occupata, setOccupata] = useState<string | null>(null);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const q = new URLSearchParams();
      if (stato) q.set('stato', stato);
      if (tipo) q.set('tipo', tipo);
      const r = await fetch(getApiUrl(`/api/admin/enti?${q}`), { headers: await adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setRighe(j.richieste || []);
      setConteggi(j.conteggi || {});
    } catch (e: any) {
      onMessage({ type: 'error', text: `Richieste non lette: ${e.message}` });
    } finally {
      setCaricamento(false);
    }
  }, [stato, tipo, onMessage]);
  useEffect(() => { void carica(); }, [carica]);

  const aggiorna = (r: Richiesta | null | undefined) => {
    if (!r) return;
    setRighe((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...r } : x)));
  };
  const chiama = async (id: string, metodo: string, via: string, corpo?: any): Promise<any> => {
    setOccupata(id);
    try {
      const r = await fetch(getApiUrl(`/api/admin/enti/${id}${via}`), { method: metodo, headers: await adminHeaders(), body: corpo ? JSON.stringify(corpo) : undefined });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      aggiorna(j.richiesta);
      return j;
    } catch (e: any) {
      onMessage({ type: 'error', text: e.message });
      return null;
    } finally {
      setOccupata(null);
    }
  };
  const cambiaStato = async (r: Richiesta, nuovo: Stato) => {
    const j = await chiama(r.id, 'PATCH', '', { stato: nuovo });
    if (j) onMessage({ type: 'success', text: `${r.ente}: ${nuovo.replace('_', ' ')}` });
  };
  const approvaCoupon = async (r: Richiesta, ancora = false) => {
    if (!ancora && !window.confirm(`Creo il coupon di prova per «${r.ente}» (50 utilizzi × 500 crediti, 90 giorni) e mando il codice a ${r.email}?`)) return;
    const j = await chiama(r.id, 'POST', '/approva-coupon', { usi: 50, crediti: 500, giorni: 90, ancora });
    if (j) onMessage({ type: j.email_inviata ? 'success' : 'error', text: j.email_inviata ? `Coupon ${j.codice} creato e inviato a ${r.email}` : `Coupon ${j.codice} creato, ma l'email NON è partita (${j.email_errore}): mandalo a mano` });
  };
  const rispondi = async (r: Richiesta) => {
    if (!risposta.oggetto.trim() || !risposta.testo.trim()) { onMessage({ type: 'error', text: 'Servono oggetto e testo.' }); return; }
    const j = await chiama(r.id, 'POST', '/rispondi', risposta);
    if (j) { onMessage({ type: 'success', text: `Email inviata a ${r.email}` }); setRisposta({ oggetto: '', testo: '' }); }
  };
  const salvaNota = async (r: Richiesta) => {
    if (!nota.trim()) return;
    const j = await chiama(r.id, 'PATCH', '', { nota });
    if (j) setNota('');
  };

  const totale = (Object.values(conteggi) as number[]).reduce((s: number, n: number) => s + Number(n || 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-[#f8f5f0] p-4 rounded-3xl border border-gray-100 flex flex-wrap items-center gap-2">
        <h4 className="font-black text-sm text-primary uppercase tracking-wider flex items-center gap-2 mr-2">
          <Building2 className="w-4 h-4 text-secondary" /> Comuni, pro loco e hotel
        </h4>
        {STATI.map((s) => (
          <button key={s.id} type="button" onClick={() => setStato(s.id)}
            className={`px-3 py-1 rounded-full text-[11px] font-black ${stato === s.id ? 'bg-primary text-white' : 'bg-white text-primary/70'}`}>
            {s.nome}{s.id ? ` ${conteggi[s.id] || 0}` : ` ${totale}`}
          </button>
        ))}
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="bg-white rounded-xl px-3 py-1.5 text-[11px] font-bold border-none">
          <option value="">Tutti i tipi</option>
          {Object.entries(TIPI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" onClick={() => void carica()} className="ml-auto p-2 rounded-xl bg-white text-primary" title="Ricarica">
          <RefreshCw className={`w-4 h-4 ${caricamento ? 'animate-spin' : ''}`} />
        </button>
        <a href="/comuni" target="_blank" rel="noopener" className="text-[11px] font-bold text-primary/70 underline">/comuni</a>
        <a href="/hotel" target="_blank" rel="noopener" className="text-[11px] font-bold text-primary/70 underline">/hotel</a>
      </div>

      {!righe.length && !caricamento && (
        <p className="text-sm text-primary/60 font-medium px-2">Nessuna richiesta{stato || tipo ? ' con questi filtri' : ' ancora'}.</p>
      )}

      {righe.map((r) => {
        const eHotel = r.tipo === 'hotel';
        const diario = Array.isArray(r.corrispondenza) ? r.corrispondenza : [];
        const coupon = diario.find((v) => v?.tipo === 'coupon_inviato');
        const aperto = aperta === r.id;
        return (
          <div key={r.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm">
            <button type="button" onClick={() => setAperta(aperto ? null : r.id)} className="w-full text-left p-4 flex items-start gap-3">
              {eHotel ? <Hotel className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" /> : <Building2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-sm text-primary">{r.ente}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${COLORE_STATO[r.stato] || ''}`}>{r.stato.replace('_', ' ')}</span>
                  <span className="text-[10px] font-bold text-primary/50 uppercase">{TIPI[r.tipo] || r.tipo} · {r.lingua}</span>
                  {coupon && <span className="text-[10px] font-black text-emerald-700 flex items-center gap-1"><Ticket className="w-3 h-3" />{coupon.codice}</span>}
                </div>
                <div className="text-[12px] text-primary/70 font-medium truncate">
                  {r.localita}{r.paese ? `, ${r.paese}` : ''} · {r.email}{r.camere ? ` · ${r.camere} camere` : ''} · {(r.servizi || []).map((s) => SERVIZI[s] || s).join(', ')}
                </div>
                <div className="text-[10px] text-primary/40 font-bold">{quando(r.creata_il)}{r.ricontatto === 'telefono' && r.telefono ? ` · vuole il telefono: ${r.telefono}` : r.ricontatto === 'no' ? ' · non vuole essere ricontattato' : ''}</div>
              </div>
              {aperto ? <ChevronUp className="w-4 h-4 text-primary/40" /> : <ChevronDown className="w-4 h-4 text-primary/40" />}
            </button>

            {aperto && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                <div className="grid md:grid-cols-2 gap-3 text-[12px] text-primary/80">
                  <div className="space-y-1">
                    {r.referente && <div><b>Referente:</b> {r.referente}{r.ruolo ? ` (${r.ruolo})` : ''}</div>}
                    {r.telefono && <div><b>Telefono:</b> {r.telefono}</div>}
                    {r.sito && <div><b>Sito:</b> <a href={r.sito} target="_blank" rel="noopener" className="underline">{r.sito}</a></div>}
                    {r.materiale && <div><b>Materiale:</b> {r.materiale}</div>}
                  </div>
                  <div className="space-y-1">
                    {r.luoghi && <div><b>Luoghi:</b><pre className="whitespace-pre-wrap font-sans bg-[#f8f5f0] rounded-xl p-2 mt-1">{r.luoghi}</pre></div>}
                    {r.note && <div><b>Note loro:</b> {r.note}</div>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {/* Coupon anche ai comuni (committente 11/10): stesso taglio, 50 × 500 (erano 30 fino al 12/10: una famiglia ne consuma 4), 90 giorni. */}
                  <button type="button" disabled={occupata === r.id} onClick={() => void approvaCoupon(r, !!coupon)}
                    className="px-3 py-2 rounded-xl bg-amber-600 text-white text-[11px] font-black flex items-center gap-1">
                    <Ticket className="w-3.5 h-3.5" /> {coupon ? 'Nuovo coupon (50 × 500)' : `Approva: coupon 50 × 500 crediti${eHotel ? '' : ' per i visitatori'}`}
                  </button>
                  {r.stato !== 'in_lavorazione' && <button type="button" disabled={occupata === r.id} onClick={() => void cambiaStato(r, 'in_lavorazione')} className="px-3 py-2 rounded-xl bg-sky-100 text-sky-800 text-[11px] font-black">In lavorazione</button>}
                  {r.stato !== 'fatta' && <button type="button" disabled={occupata === r.id} onClick={() => void cambiaStato(r, 'fatta')} className="px-3 py-2 rounded-xl bg-emerald-100 text-emerald-800 text-[11px] font-black flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Fatta</button>}
                  {r.stato !== 'rifiutata' && <button type="button" disabled={occupata === r.id} onClick={() => void cambiaStato(r, 'rifiutata')} className="px-3 py-2 rounded-xl bg-gray-200 text-gray-700 text-[11px] font-black flex items-center gap-1"><X className="w-3.5 h-3.5" /> Rifiuta</button>}
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="bg-[#f8f5f0] rounded-2xl p-3 space-y-2">
                    <div className="text-[10px] font-black uppercase text-primary/60 flex items-center gap-1"><Mail className="w-3 h-3" /> Rispondi a {r.email}</div>
                    <input type="text" placeholder="Oggetto" value={risposta.oggetto} onChange={(e) => setRisposta({ ...risposta, oggetto: e.target.value })} className="w-full bg-white rounded-xl p-2 text-xs border-none" />
                    <textarea placeholder="Testo (firma compresa)" value={risposta.testo} onChange={(e) => setRisposta({ ...risposta, testo: e.target.value })} className="w-full bg-white rounded-xl p-2 text-xs border-none min-h-[90px]" />
                    <button type="button" disabled={occupata === r.id} onClick={() => void rispondi(r)} className="px-3 py-2 rounded-xl bg-primary text-white text-[11px] font-black">Invia email</button>
                  </div>
                  <div className="bg-[#f8f5f0] rounded-2xl p-3 space-y-2">
                    <div className="text-[10px] font-black uppercase text-primary/60 flex items-center gap-1"><StickyNote className="w-3 h-3" /> Nota interna</div>
                    <textarea placeholder="Es. chiamato il 12/10, vogliono 3 chiese" value={nota} onChange={(e) => setNota(e.target.value)} className="w-full bg-white rounded-xl p-2 text-xs border-none min-h-[60px]" />
                    <button type="button" disabled={occupata === r.id} onClick={() => void salvaNota(r)} className="px-3 py-2 rounded-xl bg-white text-primary text-[11px] font-black">Salva nota</button>
                  </div>
                </div>

                {diario.length > 0 && (
                  <div className="text-[11px] space-y-1">
                    <div className="text-[10px] font-black uppercase text-primary/60">Diario</div>
                    {diario.slice().reverse().map((v, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-primary/40 font-bold shrink-0">{quando(v.quando)}</span>
                        <span className="text-primary/80">
                          {v.tipo === 'coupon_inviato' ? `coupon ${v.codice} (${v.usi} × ${v.crediti}, scade ${quando(v.scade).slice(0, 8)})${v.email_ok === false ? ` — EMAIL NON PARTITA: ${v.email_errore}` : ' inviato'}`
                            : v.tipo === 'email_inviata' ? `email «${v.oggetto}»`
                            : v.tipo === 'stato' ? `stato → ${v.testo}`
                            : v.testo}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
