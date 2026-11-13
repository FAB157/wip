import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, RefreshCw, ChevronDown, ChevronUp, MapPin, FileText, Mail, Phone, Globe, User, Headphones, Image as ImageIcon, Star, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';

/**
 * ARCHIVIO DEGLI ENTI (21/10/2026, committente: «nella tab campagne crea un archivio con tutti gli enti che ci hanno
 * contattato e dentro di ognuno i POI inseriti e la documentazione»; «metti anche data, contatti e info»).
 * Legge GET /api/admin/enti/archivio: una scheda per ente (righe di `richieste_enti`, anche chi ha scritto solo per email),
 * con data, contatti, informazioni della richiesta, i POI inseriti con il loro stato VERO nel database (gemma, foto,
 * testo, audioguide per lingua), i documenti ricevuti o usati come fonte e la cronologia delle email.
 */

interface Poi { id: string; nome: string; categoria?: string; citta?: string; lat?: number; lon?: number; gemma?: boolean; visibile?: boolean; foto?: boolean; testo?: number; fonte?: string | null; audioguide?: string[]; mancante?: boolean; }
interface Voce { tipo?: string; quando?: string; titolo?: string; url?: string; nota?: string; oggetto?: string; testo?: string; a?: string; [k: string]: any; }
interface Ente {
  id: string; creata_il: string; aggiornata_il?: string | null; stato: string; tipo: string; ente: string; localita: string; paese?: string | null;
  sito?: string | null; referente?: string | null; ruolo?: string | null; email: string; telefono?: string | null; lingua: string; servizi: string[];
  luoghi?: string | null; materiale?: string | null; note?: string | null; campagna?: string | null; poi: Poi[]; documenti: Voce[]; storia: Voce[];
}

const adminHeaders = async (): Promise<Record<string, string>> => {
  const { data: s } = await supabase.auth.getSession();
  const token = s?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const data = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const dataOra = (iso?: string | null) => iso ? new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const COLORE: Record<string, string> = { nuova: 'bg-amber-100 text-amber-800', in_lavorazione: 'bg-sky-100 text-sky-800', fatta: 'bg-emerald-100 text-emerald-800', rifiutata: 'bg-gray-200 text-gray-600' };
const NOME_STATO: Record<string, string> = { nuova: 'nuova', in_lavorazione: 'in lavorazione', fatta: 'fatta', rifiutata: 'rifiutata' };

interface Props { onMessage: (m: { type: 'success' | 'error'; text: string }) => void; }

export default function AdminArchivioEnti({ onMessage }: Props) {
  const [enti, setEnti] = useState<Ente[]>([]);
  const [caricamento, setCaricamento] = useState(false);
  const [aperto, setAperto] = useState<string | null>(null);
  const [cerca, setCerca] = useState('');

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const r = await fetch(getApiUrl('/api/admin/enti/archivio'), { headers: await adminHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setEnti(j.enti || []);
    } catch (e: any) {
      onMessage({ type: 'error', text: `Archivio non letto: ${e.message}` });
    } finally {
      setCaricamento(false);
    }
  }, [onMessage]);
  useEffect(() => { void carica(); }, [carica]);

  const visibili = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return q ? enti.filter((e) => [e.ente, e.localita, e.paese, e.referente, e.email].some((x) => String(x || '').toLowerCase().includes(q))) : enti;
  }, [enti, cerca]);
  const totPoi = enti.reduce((n, e) => n + e.poi.length, 0);

  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-primary/60 flex items-center gap-1"><Archive className="w-3 h-3" /> Archivio enti</div>
        <span className="text-[11px] font-bold text-primary/50">{enti.length} enti · {totPoi} luoghi inseriti</span>
        <input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca ente, città, paese, contatto…"
          className="ml-auto min-w-[180px] flex-1 max-w-xs border border-gray-200 rounded-full px-3 py-1 text-[12px]" />
        <button type="button" onClick={() => void carica()} className="p-2 rounded-xl bg-[#f8f5f0] text-primary" title="Ricarica">
          <RefreshCw className={`w-4 h-4 ${caricamento ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-2">
        {visibili.map((e) => {
          const su = aperto === e.id;
          return (
            <div key={e.id} className="border border-gray-100 rounded-2xl">
              <button type="button" onClick={() => setAperto(su ? null : e.id)} className="w-full text-left p-3 flex flex-wrap items-center gap-2">
                <span className="font-black text-primary text-[13px]">{e.ente}</span>
                <span className="text-[11px] font-bold text-primary/50">{e.localita}{e.paese ? ` · ${e.paese}` : ''}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${COLORE[e.stato] || 'bg-gray-100 text-gray-600'}`}>{NOME_STATO[e.stato] || e.stato}</span>
                <span className="text-[10px] font-bold text-primary/40">{data(e.creata_il)}</span>
                <span className="ml-auto text-[10px] font-black text-primary/60 flex items-center gap-2">
                  <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{e.poi.length}</span>
                  <span className="flex items-center gap-0.5"><FileText className="w-3 h-3" />{e.documenti.length}</span>
                  {su ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>

              {su && (
                <div className="px-3 pb-3 space-y-3 text-[12px] text-primary/80">
                  {/* DATE, CONTATTI E INFO */}
                  <div className="grid md:grid-cols-3 gap-2">
                    <div className="bg-[#f8f5f0] rounded-xl p-2.5 space-y-0.5">
                      <div className="text-[10px] font-black uppercase text-primary/50">Date</div>
                      <div>Prima richiesta: <b>{dataOra(e.creata_il)}</b></div>
                      {e.aggiornata_il && <div>Ultimo aggiornamento: <b>{dataOra(e.aggiornata_il)}</b></div>}
                      {e.campagna && <div>Campagna: <b>{e.campagna}</b></div>}
                    </div>
                    <div className="bg-[#f8f5f0] rounded-xl p-2.5 space-y-0.5">
                      <div className="text-[10px] font-black uppercase text-primary/50">Contatti</div>
                      {e.referente && <div className="flex items-center gap-1"><User className="w-3 h-3" /><b>{e.referente}</b>{e.ruolo ? ` · ${e.ruolo}` : ''}</div>}
                      <div className="flex items-center gap-1"><Mail className="w-3 h-3" /><a className="underline" href={`mailto:${e.email}`}>{e.email}</a></div>
                      {e.telefono && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{e.telefono}</div>}
                      {e.sito && <div className="flex items-center gap-1 break-all"><Globe className="w-3 h-3 shrink-0" /><a className="underline" href={e.sito} target="_blank" rel="noreferrer">{e.sito}</a></div>}
                    </div>
                    <div className="bg-[#f8f5f0] rounded-xl p-2.5 space-y-0.5">
                      <div className="text-[10px] font-black uppercase text-primary/50">Info</div>
                      <div>Tipo: <b>{e.tipo}</b> · lingua <b>{e.lingua}</b></div>
                      {!!e.servizi?.length && <div>Chiede: <b>{e.servizi.join(', ')}</b></div>}
                      {e.luoghi && <div className="whitespace-pre-wrap">Luoghi indicati: {e.luoghi}</div>}
                      {e.materiale && <div className="whitespace-pre-wrap break-words">Materiale: {e.materiale}</div>}
                      {e.note && <div className="whitespace-pre-wrap">Note: {e.note}</div>}
                    </div>
                  </div>

                  {/* POI INSERITI */}
                  <div>
                    <div className="text-[10px] font-black uppercase text-primary/50 mb-1">Luoghi inseriti</div>
                    {e.poi.length ? (
                      <div className="space-y-1">
                        {e.poi.map((p) => (
                          <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-gray-100 pt-1">
                            <b className="text-primary">{p.nome}</b>
                            {p.mancante ? <span className="text-red-600 font-black">riga non trovata</span> : (
                              <>
                                <span className="text-primary/40">{p.categoria}{p.citta ? ` · ${p.citta}` : ''}</span>
                                {p.gemma && <span className="flex items-center gap-0.5 text-amber-600 font-bold"><Star className="w-3 h-3" />gemma</span>}
                                {p.visibile === false && <span className="flex items-center gap-0.5 text-red-600 font-bold"><EyeOff className="w-3 h-3" />nascosto</span>}
                                <span className={`flex items-center gap-0.5 font-bold ${p.foto ? 'text-emerald-700' : 'text-red-600'}`}><ImageIcon className="w-3 h-3" />{p.foto ? 'foto' : 'senza foto'}</span>
                                <span className={`font-bold ${p.testo && p.testo >= 120 ? 'text-emerald-700' : 'text-red-600'}`}>scheda {p.testo || 0} car.</span>
                                <span className={`flex items-center gap-0.5 font-bold ${p.audioguide?.length ? 'text-emerald-700' : 'text-red-600'}`}><Headphones className="w-3 h-3" />{p.audioguide?.length ? p.audioguide.join(' ') : 'nessuna audioguida'}</span>
                                {p.lat != null && p.lon != null && <a className="underline text-primary/60" href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=17/${p.lat}/${p.lon}`} target="_blank" rel="noreferrer">mappa</a>}
                                {p.fonte && <a className="underline text-primary/60 break-all" href={p.fonte} target="_blank" rel="noreferrer">fonte</a>}
                                <span className="text-[10px] text-primary/30">{p.id}</span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : <div className="text-primary/50">Nessun luogo ancora inserito.</div>}
                  </div>

                  {/* DOCUMENTAZIONE */}
                  <div>
                    <div className="text-[10px] font-black uppercase text-primary/50 mb-1">Documentazione</div>
                    {e.documenti.length ? e.documenti.map((d, i) => (
                      <div key={i} className="flex flex-wrap gap-x-2">
                        <span className="text-primary/40">{data(d.quando)}</span>
                        {d.url ? <a className="underline font-bold break-all" href={d.url} target="_blank" rel="noreferrer">{d.titolo || d.url}</a> : <b>{d.titolo}</b>}
                        {d.nota && <span className="text-primary/60">{d.nota}</span>}
                      </div>
                    )) : <div className="text-primary/50">Nessun documento registrato.</div>}
                  </div>

                  {/* STORIA */}
                  {!!e.storia.length && (
                    <div>
                      <div className="text-[10px] font-black uppercase text-primary/50 mb-1">Cronologia</div>
                      {e.storia.map((v, i) => (
                        <div key={i} className="flex flex-wrap gap-x-2">
                          <span className="text-primary/40">{dataOra(v.quando)}</span>
                          <span className="font-bold">{v.tipo || 'nota'}</span>
                          <span className="text-primary/70">{v.oggetto || v.titolo || String(v.testo || v.nota || '').slice(0, 140)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!visibili.length && <p className="text-[12px] text-primary/50">{caricamento ? 'Caricamento…' : 'Nessun ente in archivio.'}</p>}
      </div>
    </div>
  );
}
