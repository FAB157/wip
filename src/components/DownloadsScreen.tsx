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
//
// A CARTELLE (20/09/2026, committente: «ci deve essere Itinerari, Mappe,
// Audioguida, Guide Premium e Guide Musei — in sezioni diverse e cartelle
// distinte», e «tutti salvati nella stessa forma, con tasto naviga, tasto
// racconto, tasto elimina, o cliccando si apre»). Le cinque cartelle si
// vedono SEMPRE, anche vuote (prima una sezione senza voci spariva, e
// sembrava che mancasse la funzione). Dentro ogni cartella le voci hanno la
// stessa forma: il tocco apre, i tasti sotto fanno il resto. I PDF gia'
// stampati (pdfArchivio) stanno nella cartella del loro documento; chi non
// e' ancora stampato si stampa da qui o dalla guida stessa.
// E' lo STESSO componente in Profilo › I miei download, Piano › I miei
// itinerari e Piano › Offline: un solo archivio, tre ingressi.
// =====================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Map as MapIcon, Route, Headphones, BookOpen, Trash2, Navigation2, CheckCircle2, AlertTriangle, HardDrive, ChevronRight, ChevronLeft, Landmark, LayoutList, LayoutGrid, ArrowDownAZ, CalendarClock, FileText, Feather, Folder } from 'lucide-react';
import { getTranslation, type Language } from '../lib/i18n';
import { elencoDownload, byteTotaliDownload, statoDownload, EVENTO_DOWNLOADS, type DownloadRecord } from '../lib/downloadsRegistry';
import { getOfflineItinerariesList, getOfflineItinerary, deleteOfflineItinerary, saveOfflineItinerary } from '../lib/offlineStorage';
import { scaricaPacchettoOffline, eliminaPacchettoOffline } from '../lib/pacchettoOffline';
import { eliminaPacchettoMuseo } from '../lib/pacchettoMuseo';
import { fetchVisiteAcquistate, type VisitaAcquistata } from '../lib/museumVisit';
import { notify } from '../lib/toast';
import { supabase } from '../lib/supabase';
import OfflineMapsTab from './OfflineMapsTab';
import { useRaccontoViaggio } from './RaccontoViaggio';
import { elencoPdf, leggiPdf, eliminaPdf, idPdf, type PdfVoce, type PdfTipo } from '../lib/pdfArchivio';
import { saveBlobAsFile, getLocalGuide, saveGuideLocally } from '../services/premiumGuideService';
import { Capacitor } from '@capacitor/core';

export type CartellaDownload = 'itinerari' | 'mappe' | 'audioguide' | 'guide' | 'musei';

interface Props {
  language: Language;
  /** Da «I miei itinerari» si entra gia' nella cartella Itinerari. */
  cartellaIniziale?: CartellaDownload;
  /** Dal Profilo: porta alla Cronologia (le audioguide ASCOLTATE, col riascolto gratuito). */
  onApriAscolti?: () => void;
}

/** L'id della copia offline di un itinerario: LA STESSA formula di PlanScreen.handleSaveOffline (tenerle allineate). */
function idOfflineDi(titolo: unknown, idPiano: unknown): string {
  const slug = String(titolo || 'itinerario').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  return idPiano ? `${slug}_${String(idPiano).slice(0, 8)}` : slug;
}

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

/** Riga cliccabile: tutto il blocco apre la funzione; i tasti stanno SOTTO
 *  (20/09/2026: a destra, su un telefono, quattro tasti schiacciavano il
 *  titolo a tre lettere) e fermano la propagazione. */
const Voce: React.FC<VoceProps> = ({ icona, titolo, sotto, badge, onApri, azioni }) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onApri}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onApri(); } }}
      className="w-full p-3.5 rounded-2xl bg-white border border-outline-variant/10 shadow-sm hover:bg-primary/5 active:scale-[0.99] transition-all text-left cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="shrink-0 grid place-items-center w-11 h-11 rounded-xl bg-primary/10 text-primary">{icona}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-on-surface line-clamp-2 leading-tight">{titolo}</p>
          {sotto && <div className="mt-0.5 text-[11px] text-on-surface-variant/70 font-semibold flex flex-wrap items-center gap-x-2 gap-y-0.5">{sotto}</div>}
          {badge && <div className="mt-1">{badge}</div>}
        </div>
        <ChevronRight size={16} className="shrink-0 text-on-surface-variant/40" />
      </div>
      {azioni && (
        <div className="mt-2.5 pt-2.5 border-t border-outline-variant/10 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {azioni}
        </div>
      )}
    </div>
  );
};

/** Tasto con icona ED etichetta: «naviga», «racconto», «PDF», «elimina» si leggono, non si indovinano. */
const Tasto: React.FC<{ icona: React.ReactNode; testo: string; onClick: () => void; tono?: 'primario' | 'ambra' | 'rosso'; disabled?: boolean }> = ({ icona, testo, onClick, tono = 'primario', disabled }) => {
  const colori = tono === 'rosso' ? 'bg-red-50 text-red-600 hover:bg-red-500 hover:text-white'
    : tono === 'ambra' ? 'bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white'
    : 'bg-primary/10 text-primary hover:bg-primary hover:text-white';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={testo}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[11px] font-black transition-colors disabled:opacity-50 ${colori}`}
    >{icona}<span>{testo}</span></button>
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
      <div className="shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-primary/10 text-primary">{icona}</div>
      <div className="min-w-0">
        <p className="text-[13px] font-black text-on-surface line-clamp-2 leading-tight">{titolo}</p>
        {sotto && <div className="mt-1 text-[10px] text-on-surface-variant/70 font-semibold truncate">{sotto}</div>}
      </div>
      {azioni && (
        <div className="mt-auto pt-2 border-t border-outline-variant/10 flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>{azioni}</div>
      )}
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

export default function DownloadsScreen({ language, cartellaIniziale, onApriAscolti }: Props) {
  const t = (k: string) => getTranslation(k, language);
  const [cartella, setCartella] = useState<CartellaDownload | null>(cartellaIniziale ?? null);
  const [pdf, setPdf] = useState<PdfVoce[]>([]);
  const racconto = useRaccontoViaggio(language);
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const [offlinePlans, setOfflinePlans] = useState<any[]>([]);
  const [itinerariAccount, setItinerariAccount] = useState<any[]>([]);
  const [guideAccount, setGuideAccount] = useState<any[]>([]);
  // Le Visite museo COMPRATE sull'account (14/09/2026, committente: «se
  // acquistata, come itinerari e guide premium, anche la guida museo deve
  // essere salvata nei miei download e archivio e sempre disponibile»):
  // compaiono anche se mai aperte su questo telefono, e riaprirle e' gratis.
  const [museiAccount, setMuseiAccount] = useState<VisitaAcquistata[]>([]);
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
      if (!uid) { setItinerariAccount([]); setGuideAccount([]); setMuseiAccount([]); return; }
      const [ri, rg, rm] = await Promise.all([
        supabase.from('user_itineraries').select('id, titolo, updated_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(200),
        supabase.from('itinerary_guides').select('itinerary_hash, created_at, content_data, media_manifest').eq('user_id', uid).order('created_at', { ascending: false }).limit(200),
        fetchVisiteAcquistate(),
      ]);
      setItinerariAccount(Array.isArray(ri.data) ? ri.data : []);
      setGuideAccount(Array.isArray(rg.data) ? rg.data : []);
      setMuseiAccount(rm);
    } catch { /* best-effort: restano solo i download locali */ }
  };

  const ricarica = async () => {
    const [r, p, b, stampati] = await Promise.all([elencoDownload(), getOfflineItinerariesList().catch(() => []), byteTotaliDownload(), elencoPdf()]);
    setRecords(r); setOfflinePlans(p || []); setPdf(stampati);
    setBytes(b + stampati.reduce((s, v) => s + (v.bytes || 0), 0));
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
    // (20/09/2026) La copia offline ha un id SUO (`<titolo>_<primi 8 dell'id>`,
    // vedi idOfflineDi): senza questo confronto lo stesso itinerario compariva
    // due volte, una «Nel tuo account» e una scaricata.
    const idOfflinePresenti = new Set<string>([
      ...offlinePlans.map((p: any) => String(p.id || '')),
      ...records.filter(r => r.tipo === 'itinerario').map(r => String(r.meta?.offlineId || r.id.replace(/^iti:/, ''))),
    ]);
    for (const it of itinerariAccount) {
      const id = String(it.id || '');
      if (!id) continue;
      if (idOfflinePresenti.has(idOfflineDi(it.titolo, id))) continue;
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
  // Musei: registro locale + Visite comprate sull'account non ancora su
  // questo telefono (dedup per chiave e per nome: la stessa sede puo' avere
  // chiave «poi_<id>» all'acquisto e «nome_<slug>» nell'archivio).
  const musei = useMemo(() => {
    const locali = records.filter(r => r.tipo === 'museo');
    const norma = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    const chiaviLocali = new Set(locali.map(r => String(r.meta?.venueKey || '')));
    const nomiLocali = new Set(locali.map(r => norma(r.nome)));
    const soloAccount = museiAccount
      .filter(v => v.venueKey && !chiaviLocali.has(v.venueKey) && !nomiLocali.has(norma(v.venueName)))
      .map(v => ({
        id: `museo:${v.venueKey}::account`,
        tipo: 'museo' as const,
        nome: v.venueName,
        sottotitolo: v.lingue.length ? v.lingue.join(' · ') : undefined,
        createdAt: 0,
        updatedAt: 0,
        bytes: 0,
        meta: { venueKey: v.venueKey, poiId: v.poiId, language: v.lingue[0] || null } as any,
        parti: {} as any,
        soloAccount: true,
      }));
    return ordinaRecord([...locali, ...soloAccount] as unknown as DownloadRecord[]) as Array<DownloadRecord & { soloAccount?: boolean }>;
  }, [records, museiAccount, ordine]);
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

  /** I dati dell'itinerario: la copia offline di questo telefono, altrimenti la riga dell'account. */
  const datiItinerario = async (id: string): Promise<any | null> => {
    const locale = await getOfflineItinerary(id).catch(() => null);
    if (locale) return locale;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id;
      if (!uid) return null;
      const { data } = await supabase.from('user_itineraries').select('dati_itinerario').eq('id', id).eq('user_id', uid).maybeSingle();
      const d = typeof data?.dati_itinerario === 'string' ? JSON.parse(data.dati_itinerario) : data?.dati_itinerario;
      if (!d) return null;
      const giorni = Array.isArray(d.giorni) ? d.giorni : Object.values(d.giorni || {});
      return { ...d, giorni };
    } catch { return null; }
  };

  // SCARICA SUL TELEFONO un itinerario che sta solo sull'account (20/09/2026):
  // piano + mappa della zona + strade per la navigazione senza rete, GRATIS —
  // lo stesso pacchetto del tasto «Offline» dentro l'itinerario
  // (PlanScreen.handleSaveOffline), senza doverlo aprire. Le audioguide delle
  // tappe restano dove sono: si comprano dall'itinerario (bundle a crediti).
  const scaricaDaAccount = async (id: string, nome: string) => {
    if (inCorso) return;
    setInCorso(id);
    try {
      const plan = await datiItinerario(id);
      if (!plan) { notify(t('dl_non_aperto')); return; }
      const giorni: any[] = plan.giorni || [];
      const salvataggio = {
        ...plan,
        id: plan.id || id,
        data_salvataggio: new Date().toISOString(),
        citta: plan.titolo || nome,
        descrizione: `Itinerario di ${giorni.length} giorni con ${giorni.reduce((n, g) => n + (g?.tappe?.length || 0), 0)} tappe.`,
      };
      const idOffline = idOfflineDi(plan.titolo || nome, plan.id || id);
      await saveOfflineItinerary(idOffline, salvataggio);
      notify(t('dl_in_corso'), 'info');
      const esito = await scaricaPacchettoOffline(salvataggio, idOffline, { mappa: true, strade: true });
      if (esito.strade && esito.strade.mancanti > 0) notify(t('dl_strade_fuori_copertura'), 'info');
      else notify(t('dl_fatto'), 'success');
    } catch (e) {
      console.warn('[Downloads] scarico dall\'account non riuscito', e);
      notify(t('dl_non_aperto'));
    } finally {
      setInCorso(null);
      void ricarica();
    }
  };

  // «Elimina» toglie quello che c'e': prima la copia su questo telefono; se
  // l'itinerario sta solo sull'account, la riga dell'account (con conferma:
  // quella non si recupera).
  const eliminaItinerario = async (id: string, soloAccount?: boolean) => {
    if (soloAccount) {
      if (!confirm(t('vr_b_confirm_delete_itinerary'))) return;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (uid) {
          const { error } = await supabase.from('user_itineraries').delete().eq('id', id).eq('user_id', uid);
          if (error) { notify(t('err_delete_itinerary')); return; }
        }
      } catch { /* sotto si ricarica comunque */ }
      void ricarica();
      return;
    }
    const plan = await getOfflineItinerary(id);
    try { if (plan) await eliminaPacchettoOffline(plan, id); } catch { /* best-effort */ }
    try { await deleteOfflineItinerary(id); } catch { /* best-effort */ }
    void ricarica();
  };

  const navigaVersoPrimaTappa = async (id: string) => {
    const plan = await datiItinerario(id);
    const coord = (tp: any) => {
      const lat = Number(tp?.coordinate?.lat ?? tp?.lat), lon = Number(tp?.coordinate?.lng ?? tp?.coordinate?.lon ?? tp?.lon ?? tp?.lng);
      return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) ? { lat, lon } : null;
    };
    const prima = (plan?.giorni || []).flatMap((g: any) => g?.tappe || []).find((tp: any) => coord(tp));
    if (!prima) { apri({ tipo: 'itinerario', id }); return; }
    window.dispatchEvent(new CustomEvent('wip-smart-navigate', {
      detail: { startCoords: null, endCoords: coord(prima), destinationName: prima.titolo_tappa, mode: 'foot' },
    }));
  };

  const raccontaItinerario = async (id: string, nome: string) => {
    const dati = await datiItinerario(id);
    if (!dati) { notify(t('dl_non_aperto')); return; }
    await racconto.genera({ id, titolo: dati.titolo || nome, dati_itinerario: dati });
  };

  // ── PDF ────────────────────────────────────────────────────────────────
  const [pdfInCorso, setPdfInCorso] = useState<string | null>(null);
  const pdfDi = (tipo: PdfTipo, nome: string) => pdf.find(v => v.id === idPdf(tipo, nome));

  /** Riapre un PDF gia' stampato, senza rigenerarlo. */
  const apriPdf = async (v: PdfVoce) => {
    const blob = await leggiPdf(v.id);
    if (!blob) { notify(t('pf_pdf_non_riuscito')); void ricarica(); return; }
    if (Capacitor.isNativePlatform()) {
      const ok = await saveBlobAsFile(blob, v.file);
      notify(t(ok ? (Capacitor.isNativePlatform() ? 'pf_pdf_salvato' : 'pf_pdf_salvato_web') : 'pf_pdf_non_riuscito'));
      return;
    }
    const url = URL.createObjectURL(blob);
    const finestra = window.open(url, '_blank');
    if (!finestra) await saveBlobAsFile(blob, v.file);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const nomeFilePdf = (titolo: string) => `WIP - ${String(titolo).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60)}.pdf`;

  const stampaItinerario = async (id: string, nome: string) => {
    const gia = pdfDi('itinerario', nome);
    if (gia) { void apriPdf(gia); return; }
    if (pdfInCorso) return;
    setPdfInCorso(`iti:${id}`);
    try {
      const plan = await datiItinerario(id);
      if (!plan) { notify(t('dl_non_aperto')); return; }
      notify(t('pf_pdf_in_corso'));
      const { generaPdfItinerario } = await import('../lib/pdf/generaPdf');
      const blob = await generaPdfItinerario(plan, language);
      // null = lingua non latina: quel PDF si fa dalla vista dell'itinerario.
      if (!blob) { notify(t('dl_pdf_dalla_guida')); apri({ tipo: 'itinerario', id }); return; }
      const titolo = plan.titolo || nome;
      const ok = await saveBlobAsFile(blob, nomeFilePdf(titolo), { tipo: 'itinerario', nome: titolo });
      notify(t(ok ? (Capacitor.isNativePlatform() ? 'pf_pdf_salvato' : 'pf_pdf_salvato_web') : 'pf_pdf_non_riuscito'));
    } catch (e) {
      console.error('[Downloads] PDF itinerario non riuscito', e);
      notify(t('pf_pdf_non_riuscito'));
    } finally { setPdfInCorso(null); }
  };

  const stampaGuida = async (hash: string, nome: string) => {
    const gia = pdfDi('guida', nome);
    if (gia) { void apriPdf(gia); return; }
    if (pdfInCorso) return;
    setPdfInCorso(`guida:${hash}`);
    try {
      const locale = await getLocalGuide(hash).catch(() => null);
      const riga = guideAccount.find(g => String(g.itinerary_hash) === hash);
      const content = locale?.content || riga?.content_data;
      const media = (locale as any)?.media_manifest || riga?.media_manifest || {};
      if (!content) { notify(t('dl_non_aperto')); return; }
      notify(t('pf_pdf_in_corso'));
      const { generaPdfGuida } = await import('../lib/pdf/generaPdf');
      const blob = await generaPdfGuida(content, media, language);
      if (!blob) { notify(t('dl_pdf_dalla_guida')); apri({ tipo: 'guida', id: hash }); return; }
      const titolo = content.guida_titolo || nome;
      const ok = await saveBlobAsFile(blob, nomeFilePdf(titolo), { tipo: 'guida', nome: titolo });
      notify(t(ok ? (Capacitor.isNativePlatform() ? 'pf_pdf_salvato' : 'pf_pdf_salvato_web') : 'pf_pdf_non_riuscito'));
    } catch (e) {
      console.error('[Downloads] PDF guida non riuscito', e);
      notify(t('pf_pdf_non_riuscito'));
    } finally { setPdfInCorso(null); }
  };

  // Una Guida Premium che sta solo sull'account si porta sul telefono (testi
  // e manifest foto, nell'IndexedDB): gia' pagata, non costa nulla, e da quel
  // momento si apre anche senza rete.
  const scaricaGuida = async (hash: string) => {
    const riga = guideAccount.find(g => String(g.itinerary_hash) === hash);
    if (!riga?.content_data) { notify(t('dl_non_aperto')); return; }
    await saveGuideLocally({ content: riga.content_data, media_manifest: riga.media_manifest || {}, hash, fromCache: true } as any);
    notify(t('dl_fatto'), 'success');
    void ricarica();
  };

  /** I PDF gia' stampati di una cartella: si riaprono e si eliminano da qui. */
  const SezionePdf = ({ tipo }: { tipo: PdfTipo }) => {
    const voci = pdf.filter(v => v.tipo === tipo);
    if (!voci.length) return null;
    return (
      <section className="space-y-2.5 pt-2">
        <h3 className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface-variant/60 flex items-center gap-2"><FileText size={13} /> {t('dl_pdf_stampati')} · {voci.length}</h3>
        <div className="space-y-2.5">
          {voci.map(v => (
            <Voce
              key={v.id}
              icona={<FileText size={20} />}
              titolo={v.nome}
              sotto={<><span>{new Date(v.data).toLocaleDateString()}</span><span>{fmtBytes(v.bytes)}</span></>}
              onApri={() => { void apriPdf(v); }}
              azioni={<Tasto icona={<Trash2 size={13} />} testo={t('dl_elimina')} tono="rosso" onClick={() => { void eliminaPdf(v.id); }} />}
            />
          ))}
        </div>
      </section>
    );
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

      {racconto.modale}

      {/* LE CINQUE CARTELLE, sempre tutte: anche vuota, una cartella dice
          che quella cosa esiste e dove finira'. */}
      {cartella === null && (
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: 'itinerari', nome: t('dl_itinerari'), icona: <Route size={22} />, n: itinerari.length, nPdf: pdf.filter(v => v.tipo === 'itinerario').length },
            { id: 'mappe', nome: t('dl_mappe'), icona: <MapIcon size={22} />, n: zone.length, nPdf: 0 },
            { id: 'audioguide', nome: t('dl_audioguide'), icona: <Headphones size={22} />, n: audioguide.length, nPdf: 0 },
            { id: 'guide', nome: t('dl_guide_premium'), icona: <BookOpen size={22} />, n: guide.length, nPdf: pdf.filter(v => v.tipo === 'guida').length },
            { id: 'musei', nome: t('dl_guide_musei'), icona: <Landmark size={22} />, n: musei.length, nPdf: pdf.filter(v => v.tipo === 'museo').length },
          ] as Array<{ id: CartellaDownload; nome: string; icona: React.ReactNode; n: number; nPdf: number }>).map(c => (
            <button
              key={c.id}
              onClick={() => setCartella(c.id)}
              className="relative flex flex-col items-start gap-3 p-4 rounded-[1.5rem] bg-white border border-outline-variant/10 shadow-sm hover:bg-primary/5 active:scale-[0.98] transition-all text-left"
            >
              <div className="flex items-center justify-between w-full">
                <div className="grid place-items-center w-12 h-12 rounded-2xl bg-primary/10 text-primary">{c.icona}</div>
                <Folder size={16} className="text-on-surface-variant/30" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-on-surface leading-tight">{c.nome}</p>
                <p className="mt-0.5 text-[11px] font-bold text-on-surface-variant/60">
                  {c.n}{c.nPdf > 0 ? ` · ${c.nPdf} ${t('dl_pdf')}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Dentro una cartella: si torna indietro da qui, sempre in alto. */}
      {cartella !== null && (
        <div className="flex items-center gap-2 px-1">
          <button
            onClick={() => setCartella(null)}
            className="inline-flex items-center gap-1 h-9 pl-2 pr-3.5 rounded-full bg-white border border-outline-variant/10 shadow-sm text-primary text-[12px] font-black"
          ><ChevronLeft size={16} /> {t('dl_titolo')}</button>
          <h3 className="text-base font-black text-primary truncate">
            {cartella === 'itinerari' ? t('dl_itinerari') : cartella === 'mappe' ? t('dl_mappe') : cartella === 'audioguide' ? t('dl_audioguide') : cartella === 'guide' ? t('dl_guide_premium') : t('dl_guide_musei')}
          </h3>
        </div>
      )}

      {/* Ordine (data/nome) e vista (lista/griglia): scelta dell'utente,
          persistita. Solo dentro una cartella di voci (le Mappe hanno il
          loro pannello). */}
      {cartella !== null && cartella !== 'mappe' && (
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

      {cartella !== null && cartella !== 'mappe' && (
        (cartella === 'itinerari' ? itinerari.length : cartella === 'audioguide' ? audioguide.length : cartella === 'guide' ? guide.length : musei.length) === 0
      ) && (
        <div className="p-10 border-2 border-dashed border-outline-variant/30 rounded-[2rem] text-center text-on-surface-variant/60">
          <Folder className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-bold">{t('dl_cartella_vuota')}</p>
        </div>
      )}

      {/* ITINERARI */}
      {cartella === 'itinerari' && (
        <section className="space-y-2.5">
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
                sotto={<>
                  {it.data ? <span>{new Date(it.data).toLocaleDateString()}</span> : null}
                  {!it.soloAccount && <>
                    {it.sotto && <span>{it.sotto}</span>}
                    <span className={p.mappa ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_mappa')} {p.mappa ? '✓' : '✗'}</span>
                    <span className={p.strade ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_navigazione')} {p.strade ? '✓' : '✗'}</span>
                    {ag && <span className={ag.fatte >= ag.totali && ag.totali > 0 ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_audioguide')} {ag.fatte}/{ag.totali}</span>}
                    {it.record?.bytes ? <span>{fmtBytes(it.record.bytes)}</span> : null}
                  </>}
                  {pdfDi('itinerario', it.nome) && <span className="text-green-700">{t('dl_pdf')} ✓</span>}
                </>}
                badge={<Badge stato={stato as any} t={t} />}
                // Il tocco APRE l'itinerario (podcast, mappa, tappe), anche
                // quando sta solo sull'account: PlanScreen lo legge dalla riga.
                onApri={() => apri({ tipo: 'itinerario', id: it.id })}
                azioni={<>
                  <Tasto icona={<Navigation2 size={13} />} testo={t('dl_naviga')} onClick={() => { void navigaVersoPrimaTappa(it.id); }} />
                  <Tasto icona={<Feather size={13} />} testo={t('dl_racconto')} tono="ambra" disabled={racconto.inCorsoId === it.id} onClick={() => { void raccontaItinerario(it.id, it.nome); }} />
                  <Tasto icona={<FileText size={13} />} testo={t('dl_pdf')} disabled={pdfInCorso === `iti:${it.id}`} onClick={() => { void stampaItinerario(it.id, it.nome); }} />
                  {it.soloAccount && (
                    <Tasto icona={<Download size={13} className={inCorso === it.id ? 'animate-bounce' : ''} />} testo={t('dl_scarica')} tono="ambra" disabled={inCorso === it.id} onClick={() => { void scaricaDaAccount(it.id, it.nome); }} />
                  )}
                  {!it.soloAccount && stato !== 'pronto' && (
                    <Tasto icona={<Download size={13} className={inCorso === it.id ? 'animate-bounce' : ''} />} testo={t('dl_completa')} tono="ambra" disabled={inCorso === it.id} onClick={() => { void completaItinerario(it.id); }} />
                  )}
                  <Tasto icona={<Trash2 size={13} />} testo={t('dl_elimina')} tono="rosso" onClick={() => { void eliminaItinerario(it.id, it.soloAccount); }} />
                </>}
              />
            );
          })}
          </Sezione>
          <SezionePdf tipo="itinerario" />
        </section>
      )}

      {/* AUDIOGUIDE */}
      {cartella === 'audioguide' && (
        <section className="space-y-2.5">
          {/* Le audioguide ASCOLTATE (con il riascolto gratuito) stanno nella
              Cronologia del Profilo: da qui ci si arriva con un tocco. */}
          {onApriAscolti && (
            <Voce
              icona={<CalendarClock size={20} />}
              titolo={t('dl_ascoltate')}
              onApri={onApriAscolti}
            />
          )}
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
      {cartella === 'guide' && (
        <section className="space-y-2.5">
          <Sezione vista={vista}>
          {guide.map((r) => {
            const Componente = vista === 'griglia' ? VoceGriglia : Voce;
            const soloAccount = !!(r as any).soloAccount;
            const hash = String(r.meta?.hash || r.id.replace(/^guida:/, ''));
            const stampata = pdfDi('guida', r.nome);
            return (
            <Componente
              key={r.id}
              icona={<BookOpen size={20} />}
              titolo={r.nome}
              sotto={<>
                {r.updatedAt ? <span>{new Date(r.updatedAt).toLocaleDateString()}</span> : null}
                {r.sottotitolo && <span>{r.sottotitolo}</span>}{r.bytes ? <span>{fmtBytes(r.bytes)}</span> : null}
                <span className={stampata ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_pdf')} {stampata ? '✓' : '✗'}</span>
              </>}
              badge={soloAccount ? <Badge stato="account" t={t} /> : undefined}
              onApri={() => apri({ tipo: 'guida', id: hash })}
              azioni={<>
                <Tasto icona={<FileText size={13} />} testo={t('dl_pdf')} disabled={pdfInCorso === `guida:${hash}`} onClick={() => { void stampaGuida(hash, r.nome); }} />
                {soloAccount && <Tasto icona={<Download size={13} />} testo={t('dl_scarica')} tono="ambra" onClick={() => { void scaricaGuida(hash); }} />}
              </>}
            />
            );
          })}
          </Sezione>
          <SezionePdf tipo="guida" />
        </section>
      )}

      {/* MUSEI: il percorso, l'audioguida di ogni opera e le foto (12/09/2026,
          pacchettoMuseo.ts). "Quello che e' scaricato e' dell'utente e non si
          ripaga": riaprire da qui non tocca pass ne' crediti. */}
      {cartella === 'musei' && (
        <section className="space-y-2.5">
          <Sezione vista={vista}>
          {musei.map((r) => {
            const Componente = vista === 'griglia' ? VoceGriglia : Voce;
            const soloAccount = !!(r as any).soloAccount;
            const stampata = pdfDi('museo', r.nome);
            const apriMuseo = () => apri({ tipo: 'museo', id: r.id, venueKey: r.meta?.venueKey, poiId: r.meta?.poiId || null, nome: r.nome, language: soloAccount ? null : r.meta?.language });
            return (
            <Componente
              key={r.id}
              icona={<Landmark size={20} />}
              titolo={r.nome}
              sotto={<>
                {r.sottotitolo && <span>{r.sottotitolo}</span>}{r.bytes ? <span>{fmtBytes(r.bytes)}</span> : null}
                <span className={stampata ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_pdf')} {stampata ? '✓' : '✗'}</span>
              </>}
              badge={soloAccount ? <Badge stato="account" t={t} /> : undefined}
              onApri={apriMuseo}
              azioni={<>
                {/* La guida del museo si impagina con la visita aperta (ordine
                    scelto, opere approfondite, piante): gia' stampata si
                    riapre da qui, altrimenti si apre la visita. */}
                <Tasto icona={<FileText size={13} />} testo={t('dl_pdf')} onClick={() => { if (stampata) void apriPdf(stampata); else { notify(t('dl_pdf_dalla_guida'), 'info'); apriMuseo(); } }} />
                {/* Il pacchetto del museo (percorso, audioguide, foto) si scarica
                    DENTRO la visita, da solo, appena la si apre con la rete
                    (MuseumVisitSheet, 13/09/2026): da qui ci si va, dicendolo. */}
                {soloAccount && <Tasto icona={<Download size={13} />} testo={t('dl_scarica')} tono="ambra" onClick={() => { notify(t('dl_museo_si_scarica'), 'info'); apriMuseo(); }} />}
                {!soloAccount && <Tasto icona={<Trash2 size={13} />} testo={t('dl_elimina')} tono="rosso" onClick={() => { void eliminaMuseo(r); }} />}
              </>}
            />
            );
          })}
          </Sezione>
          <SezionePdf tipo="museo" />
        </section>
      )}

      {/* MAPPE: il pannello esistente (ricerca citta' + raggio, elenco,
          sincronizza, elimina). Le zone si aprono da li' con "Apri sulla mappa". */}
      {cartella === 'mappe' && (
        <section className="space-y-2.5">
          <OfflineMapsTab language={language} />
        </section>
      )}
    </div>
  );
}
