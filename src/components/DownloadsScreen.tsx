// =====================================================================
// ITAINTA · DownloadsScreen — "I MIEI DOWNLOAD" (08/09/2026): l'unica area
// dove l'utente trova TUTTO cio' che ha scaricato — itinerari, zone mappa,
// audioguide, guide — e ogni voce e' un tasto che apre direttamente la
// funzione (itinerario → Piano, zona → Mappa centrata, audioguida → scheda
// POI con riproduzione, guida → Archivio). Prima erano tre posti diversi.
// Legge dal registro unico (downloadsRegistry) e dalla lista degli
// itinerari salvati offline (retrocompatibilita': quelli salvati prima del
// registro compaiono comunque).
//
// COLLEGATO ALL'ACCOUNT (13/09/2026, segnalazione committente): tutto quanto
// sopra vive SOLO nell'IndexedDB del dispositivo — un itinerario salvato
// (user_itineraries) o una Guida d'Autore arrivata per email (generata dal
// server, itinerary_guides) non passano MAI da qui, perche' nessuno dei due
// flussi tocca il registro locale. Risultato: «la trovi nell'Archivio»
// (la mail lo promette) ma in Download restava vuoto o incompleto — vero
// anche per gli itinerari, visibili in "I miei itinerari" (Piano) ma non
// qui. Le due liste sotto (`itinerariAccount`, `guideAccount`) leggono le
// STESSE tabelle di PlanScreen (fetchMyItineraries/fetchSavedPremiumGuides):
// tutto cio' che e' sull'account compare, scaricato per offline o no. Chi
// non e' anche nel registro locale apre l'Archivio (stesso posto delle
// guide) invece della copia offline, che non esiste su questo dispositivo.
// =====================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Map as MapIcon, Route, Headphones, BookOpen, Trash2, Navigation2, CheckCircle2, AlertTriangle, HardDrive, ChevronRight, Landmark, LayoutList, LayoutGrid, ArrowDownAZ, CalendarClock } from 'lucide-react';
import { getTranslation, type Language } from '../lib/i18n';
import { elencoDownload, byteTotaliDownload, statoDownload, EVENTO_DOWNLOADS, type DownloadRecord } from '../lib/downloadsRegistry';
import { getOfflineItinerariesList, getOfflineItinerary, deleteOfflineItinerary } from '../lib/offlineStorage';
import { scaricaPacchettoOffline, eliminaPacchettoOffline } from '../lib/pacchettoOffline';
import { eliminaPacchettoMuseo } from '../lib/pacchettoMuseo';
import { notify } from '../lib/toast';
import { supabase } from '../lib/supabase';
import OfflineMapsTab from './OfflineMapsTab';

interface Props { language: Language }

function fmtBytes(b: number): string {
  if (!b) return '—';
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

interface VoceProps {
  key?: React.Key;
  icona: React.ReactNode; titolo: string; sotto?: React.ReactNode; badge?: React.ReactNode;
  onApri: () => void; azioni?: React.ReactNode;
}

/** Riga cliccabile: tutto il blocco apre la funzione; le azioni a destra fermano la propagazione. */
const Voce: React.FC<VoceProps> = ({ icona, titolo, sotto, badge, onApri, azioni }) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onApri}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApri(); } }}
      className="w-full flex items-center gap-3 p-3.5 rounded-2xl bg-white border border-outline-variant/10 shadow-sm hover:bg-primary/5 active:scale-[0.99] transition-all text-left cursor-pointer"
    >
      <div className="shrink-0 grid place-items-center w-11 h-11 rounded-xl bg-primary/10 text-primary">{icona}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-on-surface truncate">{titolo}</p>
        {sotto && <div className="mt-0.5 text-[11px] text-on-surface-variant/70 font-semibold flex flex-wrap items-center gap-x-2 gap-y-0.5">{sotto}</div>}
        {badge && <div className="mt-1">{badge}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {azioni}
      </div>
      <ChevronRight size={16} className="shrink-0 text-on-surface-variant/40" />
    </div>
  );
};

/** Stessa scheda della lista, in formato compatto per la griglia (due colonne). */
const VoceGriglia: React.FC<VoceProps> = ({ icona, titolo, sotto, onApri, azioni }) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onApri}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApri(); } }}
      className="relative flex flex-col gap-2 p-3 rounded-2xl bg-white border border-outline-variant/10 shadow-sm hover:bg-primary/5 active:scale-[0.98] transition-all text-left cursor-pointer"
    >
      {azioni && (
        <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>{azioni}</div>
      )}
      <div className="shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-primary/10 text-primary">{icona}</div>
      <div className="min-w-0">
        <p className="text-[13px] font-black text-on-surface line-clamp-2 leading-tight">{titolo}</p>
        {sotto && <div className="mt-1 text-[10px] text-on-surface-variant/70 font-semibold truncate">{sotto}</div>}
      </div>
    </div>
  );
};

/** Vista lista/griglia (12/09/2026, preferenza dell'utente): stesse voci,
 *  cambia solo il contenitore. Persistita cosi' non torna a "lista" ogni volta. */
type Vista = 'lista' | 'griglia';
type Ordine = 'data' | 'nome';
const CHIAVE_VISTA = 'wip_downloads_vista';
const CHIAVE_ORDINE = 'wip_downloads_ordine';
function leggiVista(): Vista { try { return localStorage.getItem(CHIAVE_VISTA) === 'griglia' ? 'griglia' : 'lista'; } catch { return 'lista'; } }
function leggiOrdine(): Ordine { try { return localStorage.getItem(CHIAVE_ORDINE) === 'nome' ? 'nome' : 'data'; } catch { return 'data'; } }

/** Una sezione di voci, che si adatta alla vista corrente. */
const Sezione: React.FC<{ vista: Vista; children: React.ReactNode }> = ({ vista, children }) =>
  vista === 'griglia'
    ? <div className="grid grid-cols-2 gap-2.5">{children}</div>
    : <div className="space-y-2.5">{children}</div>;

function Badge({ stato, t }: { stato: 'pronto' | 'parziale' | 'vuoto' | 'account'; t: (k: string) => string }) {
  if (stato === 'pronto') return <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} />{t('dl_pronto')}</span>;
  if (stato === 'parziale') return <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><AlertTriangle size={11} />{t('dl_parziale')}</span>;
  if (stato === 'account') return <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full"><Download size={11} />{t('dl_nel_account')}</span>;
  return null;
}

export default function DownloadsScreen({ language }: Props) {
  const t = (k: string) => getTranslation(k, language);
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const [offlinePlans, setOfflinePlans] = useState<any[]>([]);
  const [itinerariAccount, setItinerariAccount] = useState<any[]>([]);
  const [guideAccount, setGuideAccount] = useState<any[]>([]);
  const [bytes, setBytes] = useState(0);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>(leggiVista);
  const [ordine, setOrdine] = useState<Ordine>(leggiOrdine);
  const cambiaVista = (v: Vista) => { setVista(v); try { localStorage.setItem(CHIAVE_VISTA, v); } catch { /* niente */ } };
  const cambiaOrdine = (o: Ordine) => { setOrdine(o); try { localStorage.setItem(CHIAVE_ORDINE, o); } catch { /* niente */ } };

  // Itinerari e Guide d'Autore dell'ACCOUNT (13/09/2026): stesse tabelle e
  // stessa query di PlanScreen (fetchMyItineraries/fetchSavedPremiumGuides).
  // Senza sessione tornano vuote — nessun mirror locale qui, quel ripiego
  // serve solo a PlanScreen per l'uso offline totale.
  const caricaAccount = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (!uid) { setItinerariAccount([]); setGuideAccount([]); return; }
      const [ri, rg] = await Promise.all([
        supabase.from('user_itineraries').select('id, titolo, updated_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(200),
        supabase.from('itinerary_guides').select('itinerary_hash, created_at, content_data').eq('user_id', uid).order('created_at', { ascending: false }).limit(200),
      ]);
      setItinerariAccount(Array.isArray(ri.data) ? ri.data : []);
      setGuideAccount(Array.isArray(rg.data) ? rg.data : []);
    } catch { /* best-effort: restano solo i download locali */ }
  };

  const ricarica = async () => {
    const [r, p, b] = await Promise.all([elencoDownload(), getOfflineItinerariesList().catch(() => []), byteTotaliDownload()]);
    setRecords(r); setOfflinePlans(p || []); setBytes(b);
    void caricaAccount();
  };
  useEffect(() => {
    void ricarica();
    const h = () => { void ricarica(); };
    window.addEventListener(EVENTO_DOWNLOADS, h);
    return () => window.removeEventListener(EVENTO_DOWNLOADS, h);
  }, []);

  // Itinerari: unione fra registro locale, piani salvati offline (quelli
  // salvati prima del registro non hanno una voce ma devono comparire) e
  // ORA anche gli itinerari dell'account (13/09/2026) — soloAccount=true
  // quando esistono solo sull'account, mai scaricati su QUESTO dispositivo:
  // si aprono nell'Archivio invece che dalla copia offline, che non c'e'.
  const itinerari = useMemo(() => {
    const perId = new Map<string, { id: string; nome: string; sotto?: string; data?: number; record?: DownloadRecord; soloAccount?: boolean }>();
    for (const it of itinerariAccount) {
      const id = String(it.id || '');
      if (!id) continue;
      perId.set(id, { id, nome: it.titolo || 'Itinerario', data: Date.parse(it.updated_at) || undefined, soloAccount: true });
    }
    for (const p of offlinePlans) {
      const id = String(p.id || '');
      if (!id) continue;
      const esistente = perId.get(id);
      perId.set(id, { id, nome: p.title || p.titolo || esistente?.nome || 'Itinerario', data: Number(p.date || p.data_salvataggio) || esistente?.data, soloAccount: false });
    }
    for (const r of records.filter(r => r.tipo === 'itinerario')) {
      const id = String(r.meta?.offlineId || r.id.replace(/^iti:/, ''));
      const esistente = perId.get(id);
      perId.set(id, { id, nome: esistente?.nome || r.nome, sotto: r.sottotitolo, data: esistente?.data || r.updatedAt, record: r, soloAccount: false });
    }
    const arr = [...perId.values()];
    return ordine === 'nome' ? arr.sort((a, b) => a.nome.localeCompare(b.nome)) : arr.sort((a, b) => (b.data || 0) - (a.data || 0));
  }, [records, offlinePlans, itinerariAccount, ordine]);

  // Stesso ordinamento per i tre elenchi dal registro unico: data (piu' recente
  // prima) o nome (alfabetico) — scelta dell'utente, vedi header piu' sotto.
  const ordinaRecord = (a: DownloadRecord[]) =>
    ordine === 'nome' ? [...a].sort((x, y) => x.nome.localeCompare(y.nome)) : [...a].sort((x, y) => y.updatedAt - x.updatedAt);
  const audioguide = ordinaRecord(records.filter(r => r.tipo === 'audioguida'));
  // Guide: unione fra registro locale e Guide d'Autore dell'account (13/09/2026)
  // non ancora presenti nel registro — dedup per hash, cosi' una guida che
  // ARRIVA anche per email (server) e viene poi scaricata offline non duplica.
  const guide = useMemo(() => {
    const locali = records.filter(r => r.tipo === 'guida');
    const hashLocali = new Set(locali.map(r => String(r.meta?.hash || r.id.replace(/^guida:/, ''))));
    const soloAccount = guideAccount
      .filter(g => g.itinerary_hash && !hashLocali.has(String(g.itinerary_hash)))
      .map(g => ({
        id: `guida:${g.itinerary_hash}`,
        tipo: 'guida' as const,
        nome: g.content_data?.guida_titolo || 'Guida d\'autore',
        sottotitolo: undefined as string | undefined,
        createdAt: Date.parse(g.created_at) || 0,
        updatedAt: Date.parse(g.created_at) || 0,
        bytes: 0,
        meta: { hash: g.itinerary_hash } as any,
        parti: {} as any,
        soloAccount: true,
      }));
    return ordinaRecord([...locali, ...soloAccount] as unknown as DownloadRecord[]) as Array<DownloadRecord & { soloAccount?: boolean }>;
  }, [records, guideAccount, ordine]);
  const musei = ordinaRecord(records.filter(r => r.tipo === 'museo'));
  const zone = records.filter(r => r.tipo === 'zona');
  // «Musei» mancava qui (12/09/2026): il pacchetto si registrava già nel
  // registro unico (pacchettoMuseo.ts, tipo='museo') ma questa schermata non
  // lo filtrava né lo mostrava — un museo scaricato risultava invisibile e
  // "Non hai ancora scaricato nulla" appariva anche con lo spazio già occupato.
  const vuoto = itinerari.length === 0 && audioguide.length === 0 && guide.length === 0 && musei.length === 0 && zone.length === 0;
  // Conteggio totale (12/09/2026, richiesta: "numero dei prodotti all'interno").
  // Le zone mappa non sono contate qui: OfflineMapsTab ha il suo elenco e
  // conteggio proprio, un secondo numero diverso confonderebbe più che aiutare.
  const totaleProdotti = itinerari.length + audioguide.length + guide.length + musei.length;

  const apri = (detail: Record<string, unknown>): void => { window.dispatchEvent(new CustomEvent('wip-apri-download', { detail })); };

  const eliminaMuseo = async (r: DownloadRecord) => {
    const venueKey = String(r.meta?.venueKey || '');
    const lang = String(r.meta?.language || '');
    if (!venueKey || !lang) return;
    try { await eliminaPacchettoMuseo(venueKey, lang); } catch { /* best-effort */ }
    void ricarica();
  };

  const completaItinerario = async (id: string) => {
    if (inCorso) return;
    const plan = await getOfflineItinerary(id);
    if (!plan) return;
    setInCorso(id);
    try {
      const esito = await scaricaPacchettoOffline(plan, id, { mappa: true, strade: true });
      if (esito.strade && esito.strade.mancanti > 0) notify(t('dl_strade_fuori_copertura'), 'info');
      else notify(t('dl_fatto'), 'success');
    } finally {
      setInCorso(null);
      void ricarica();
    }
  };

  const eliminaItinerario = async (id: string) => {
    const plan = await getOfflineItinerary(id);
    try { if (plan) await eliminaPacchettoOffline(plan, id); } catch { /* best-effort */ }
    try { await deleteOfflineItinerary(id); } catch { /* best-effort */ }
    void ricarica();
  };

  const navigaVersoPrimaTappa = async (id: string) => {
    const plan = await getOfflineItinerary(id);
    const prima = (plan?.giorni || []).flatMap((g: any) => g?.tappe || []).find((tp: any) => Number.isFinite(Number(tp?.coordinate?.lat)) && Number.isFinite(Number(tp?.coordinate?.lng)));
    if (!prima) { apri({ tipo: 'itinerario', id }); return; }
    window.dispatchEvent(new CustomEvent('wip-smart-navigate', {
      detail: { startCoords: null, endCoords: { lat: Number(prima.coordinate.lat), lon: Number(prima.coordinate.lng) }, destinationName: prima.titolo_tappa, mode: 'foot' },
    }));
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Testata: cosa e' questa area + spazio usato */}
      <div className="rounded-[1.75rem] bg-primary text-white p-5 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="shrink-0 grid place-items-center w-12 h-12 rounded-2xl bg-white/15"><Download size={22} /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black leading-tight">{t('dl_titolo')}</h2>
            <p className="mt-1 text-[12px] text-white/80 font-semibold">{t('dl_sottotitolo')}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider">
            <HardDrive size={13} className="text-secondary" /> {t('dl_spazio')}: {fmtBytes(bytes)}
          </div>
          {!vuoto && (
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider">
              <Download size={13} className="text-secondary" /> {totaleProdotti}
            </div>
          )}
        </div>
      </div>

      {/* Ordine (data/nome) e vista (lista/griglia): scelta dell'utente,
          persistita. Nascosti a vuoto: niente da ordinare o disporre. */}
      {!vuoto && (
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="inline-flex rounded-full bg-surface-variant/40 p-0.5">
            <button
              onClick={() => cambiaOrdine('data')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black transition-colors ${ordine === 'data' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant/60'}`}
            ><CalendarClock size={13} /> {t('dl_ordine_data')}</button>
            <button
              onClick={() => cambiaOrdine('nome')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black transition-colors ${ordine === 'nome' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant/60'}`}
            ><ArrowDownAZ size={13} /> {t('dl_ordine_nome')}</button>
          </div>
          <div className="inline-flex rounded-full bg-surface-variant/40 p-0.5">
            <button
              onClick={() => cambiaVista('lista')}
              aria-label={t('dl_vista_lista')} title={t('dl_vista_lista')}
              className={`grid place-items-center w-8 h-8 rounded-full transition-colors ${vista === 'lista' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant/60'}`}
            ><LayoutList size={15} /></button>
            <button
              onClick={() => cambiaVista('griglia')}
              aria-label={t('dl_vista_griglia')} title={t('dl_vista_griglia')}
              className={`grid place-items-center w-8 h-8 rounded-full transition-colors ${vista === 'griglia' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant/60'}`}
            ><LayoutGrid size={15} /></button>
          </div>
        </div>
      )}

      {vuoto && (
        <div className="p-10 border-2 border-dashed border-outline-variant/30 rounded-[2rem] text-center text-on-surface-variant/60">
          <Download className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-bold">{t('dl_vuoto')}</p>
        </div>
      )}

      {/* ITINERARI */}
      {itinerari.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface-variant/60 flex items-center gap-2"><Route size={13} /> {t('dl_itinerari')} · {itinerari.length}</h3>
          <Sezione vista={vista}>
          {itinerari.map((it) => {
            const p = it.record?.parti || {};
            const stato = it.soloAccount ? 'account' : it.record ? statoDownload(it.record) : 'parziale';
            const ag = p.audioguide;
            const Componente = vista === 'griglia' ? VoceGriglia : Voce;
            return (
              <Componente
                key={it.id}
                icona={<Route size={20} />}
                titolo={it.nome}
                sotto={it.soloAccount ? undefined : <>
                  {it.sotto && <span>{it.sotto}</span>}
                  <span className={p.mappa ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_mappa')} {p.mappa ? '✓' : '✗'}</span>
                  <span className={p.strade ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_navigazione')} {p.strade ? '✓' : '✗'}</span>
                  {ag && <span className={ag.fatte >= ag.totali && ag.totali > 0 ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_audioguide')} {ag.fatte}/{ag.totali}</span>}
                  {it.record?.bytes ? <span>{fmtBytes(it.record.bytes)}</span> : null}
                </>}
                badge={<Badge stato={stato as any} t={t} />}
                onApri={() => it.soloAccount ? apri({ tipo: 'guida' }) : apri({ tipo: 'itinerario', id: it.id })}
                azioni={it.soloAccount ? undefined : <>
                  <button
                    onClick={() => { void navigaVersoPrimaTappa(it.id); }}
                    aria-label={t('dl_naviga')} title={t('dl_naviga')}
                    className="grid place-items-center w-9 h-9 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors"
                  ><Navigation2 size={15} /></button>
                  {stato !== 'pronto' && (
                    <button
                      onClick={() => { void completaItinerario(it.id); }}
                      disabled={inCorso === it.id}
                      aria-label={t('dl_completa')} title={t('dl_completa')}
                      className="grid place-items-center w-9 h-9 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white transition-colors disabled:opacity-50"
                    ><Download size={15} className={inCorso === it.id ? 'animate-bounce' : ''} /></button>
                  )}
                  <button
                    onClick={() => { void eliminaItinerario(it.id); }}
                    aria-label="Elimina"
                    className="grid place-items-center w-9 h-9 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                  ><Trash2 size={15} /></button>
                </>}
              />
            );
          })}
          </Sezione>
        </section>
      )}

      {/* AUDIOGUIDE */}
      {audioguide.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface-variant/60 flex items-center gap-2"><Headphones size={13} /> {t('dl_audioguide')} · {audioguide.length}</h3>
          <Sezione vista={vista}>
          {audioguide.map((r) => {
            const Componente = vista === 'griglia' ? VoceGriglia : Voce;
            return (
            <Componente
              key={r.id}
              icona={<Headphones size={20} />}
              titolo={r.nome}
              sotto={<>{r.sottotitolo && <span>{r.sottotitolo}</span>}{r.bytes ? <span>{fmtBytes(r.bytes)}</span> : null}</>}
              badge={<Badge stato={statoDownload(r)} t={t} />}
              onApri={() => apri({ tipo: 'audioguida', id: r.id.replace(/^audio:/, ''), nome: r.nome, lat: r.meta?.lat, lon: r.meta?.lon, poi: r.meta?.poi })}
            />
            );
          })}
          </Sezione>
        </section>
      )}

      {/* GUIDE E AUDIOLIBRI */}
      {guide.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface-variant/60 flex items-center gap-2"><BookOpen size={13} /> {t('dl_guide')} · {guide.length}</h3>
          <Sezione vista={vista}>
          {guide.map((r) => {
            const Componente = vista === 'griglia' ? VoceGriglia : Voce;
            const soloAccount = !!(r as any).soloAccount;
            return (
            <Componente
              key={r.id}
              icona={<BookOpen size={20} />}
              titolo={r.nome}
              sotto={<>{r.sottotitolo && <span>{r.sottotitolo}</span>}{r.bytes ? <span>{fmtBytes(r.bytes)}</span> : null}</>}
              badge={soloAccount ? <Badge stato="account" t={t} /> : undefined}
              onApri={() => apri({ tipo: 'guida', id: r.id.replace(/^guida:/, '') })}
            />
            );
          })}
          </Sezione>
        </section>
      )}

      {/* MUSEI: il percorso, l'audioguida di ogni opera e le foto (12/09/2026,
          pacchettoMuseo.ts). "Quello che e' scaricato e' dell'utente e non si
          ripaga": riaprire da qui non tocca pass ne' crediti. */}
      {musei.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface-variant/60 flex items-center gap-2"><Landmark size={13} /> {t('dl_musei')} · {musei.length}</h3>
          <Sezione vista={vista}>
          {musei.map((r) => {
            const Componente = vista === 'griglia' ? VoceGriglia : Voce;
            return (
            <Componente
              key={r.id}
              icona={<Landmark size={20} />}
              titolo={r.nome}
              sotto={<>{r.sottotitolo && <span>{r.sottotitolo}</span>}{r.bytes ? <span>{fmtBytes(r.bytes)}</span> : null}</>}
              onApri={() => apri({ tipo: 'museo', id: r.id, venueKey: r.meta?.venueKey, nome: r.nome, language: r.meta?.language })}
              azioni={
                <button
                  onClick={() => { void eliminaMuseo(r); }}
                  aria-label="Elimina"
                  className="grid place-items-center w-9 h-9 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                ><Trash2 size={15} /></button>
              }
            />
            );
          })}
          </Sezione>
        </section>
      )}

      {/* ZONE MAPPA: il pannello esistente (ricerca citta' + raggio, elenco,
          sincronizza, elimina). Le zone si aprono da li' con "Apri sulla mappa". */}
      <section className="space-y-2.5">
        <h3 className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface-variant/60 flex items-center gap-2"><MapIcon size={13} /> {t('dl_zone')}</h3>
        <OfflineMapsTab language={language} />
      </section>
    </div>
  );
}
