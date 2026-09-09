// =====================================================================
// ITAINTA · DownloadsScreen — "I MIEI DOWNLOAD" (08/09/2026): l'unica area
// dove l'utente trova TUTTO cio' che ha scaricato — itinerari, zone mappa,
// audioguide, guide — e ogni voce e' un tasto che apre direttamente la
// funzione (itinerario → Piano, zona → Mappa centrata, audioguida → scheda
// POI con riproduzione, guida → Archivio). Prima erano tre posti diversi.
// Legge dal registro unico (downloadsRegistry) e dalla lista degli
// itinerari salvati offline (retrocompatibilita': quelli salvati prima del
// registro compaiono comunque).
// =====================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { Download, Map as MapIcon, Route, Headphones, BookOpen, Trash2, Navigation2, CheckCircle2, AlertTriangle, HardDrive, ChevronRight } from 'lucide-react';
import { getTranslation, type Language } from '../lib/i18n';
import { elencoDownload, byteTotaliDownload, statoDownload, EVENTO_DOWNLOADS, type DownloadRecord } from '../lib/downloadsRegistry';
import { getOfflineItinerariesList, getOfflineItinerary, deleteOfflineItinerary } from '../lib/offlineStorage';
import { scaricaPacchettoOffline, eliminaPacchettoOffline } from '../lib/pacchettoOffline';
import { notify } from '../lib/toast';
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

function Badge({ stato, t }: { stato: 'pronto' | 'parziale' | 'vuoto'; t: (k: string) => string }) {
  if (stato === 'pronto') return <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-green-700 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={11} />{t('dl_pronto')}</span>;
  if (stato === 'parziale') return <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><AlertTriangle size={11} />{t('dl_parziale')}</span>;
  return null;
}

export default function DownloadsScreen({ language }: Props) {
  const t = (k: string) => getTranslation(k, language);
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const [offlinePlans, setOfflinePlans] = useState<any[]>([]);
  const [bytes, setBytes] = useState(0);
  const [inCorso, setInCorso] = useState<string | null>(null);

  const ricarica = async () => {
    const [r, p, b] = await Promise.all([elencoDownload(), getOfflineItinerariesList().catch(() => []), byteTotaliDownload()]);
    setRecords(r); setOfflinePlans(p || []); setBytes(b);
  };
  useEffect(() => {
    void ricarica();
    const h = () => { void ricarica(); };
    window.addEventListener(EVENTO_DOWNLOADS, h);
    return () => window.removeEventListener(EVENTO_DOWNLOADS, h);
  }, []);

  // Itinerari: unione fra registro e piani salvati offline (quelli salvati
  // prima del registro non hanno una voce ma devono comparire).
  const itinerari = useMemo(() => {
    const perId = new Map<string, { id: string; nome: string; sotto?: string; data?: number; record?: DownloadRecord }>();
    for (const p of offlinePlans) {
      const id = String(p.id || '');
      if (!id) continue;
      perId.set(id, { id, nome: p.title || p.titolo || 'Itinerario', data: Number(p.date || p.data_salvataggio) || undefined });
    }
    for (const r of records.filter(r => r.tipo === 'itinerario')) {
      const id = String(r.meta?.offlineId || r.id.replace(/^iti:/, ''));
      const esistente = perId.get(id);
      perId.set(id, { id, nome: esistente?.nome || r.nome, sotto: r.sottotitolo, data: esistente?.data || r.updatedAt, record: r });
    }
    return [...perId.values()].sort((a, b) => (b.data || 0) - (a.data || 0));
  }, [records, offlinePlans]);

  const audioguide = records.filter(r => r.tipo === 'audioguida');
  const guide = records.filter(r => r.tipo === 'guida');
  const zone = records.filter(r => r.tipo === 'zona');
  const vuoto = itinerari.length === 0 && audioguide.length === 0 && guide.length === 0 && zone.length === 0;

  const apri = (detail: Record<string, unknown>): void => { window.dispatchEvent(new CustomEvent('wip-apri-download', { detail })); };

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
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider">
          <HardDrive size={13} className="text-secondary" /> {t('dl_spazio')}: {fmtBytes(bytes)}
        </div>
      </div>

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
          {itinerari.map((it) => {
            const p = it.record?.parti || {};
            const stato = it.record ? statoDownload(it.record) : 'parziale';
            const ag = p.audioguide;
            return (
              <Voce
                key={it.id}
                icona={<Route size={20} />}
                titolo={it.nome}
                sotto={<>
                  {it.sotto && <span>{it.sotto}</span>}
                  <span className={p.mappa ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_mappa')} {p.mappa ? '✓' : '✗'}</span>
                  <span className={p.strade ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_navigazione')} {p.strade ? '✓' : '✗'}</span>
                  {ag && <span className={ag.fatte >= ag.totali && ag.totali > 0 ? 'text-green-700' : 'text-on-surface-variant/50'}>{t('dl_audioguide')} {ag.fatte}/{ag.totali}</span>}
                  {it.record?.bytes ? <span>{fmtBytes(it.record.bytes)}</span> : null}
                </>}
                badge={<Badge stato={stato} t={t} />}
                onApri={() => apri({ tipo: 'itinerario', id: it.id })}
                azioni={<>
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
        </section>
      )}

      {/* AUDIOGUIDE */}
      {audioguide.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface-variant/60 flex items-center gap-2"><Headphones size={13} /> {t('dl_audioguide')} · {audioguide.length}</h3>
          {audioguide.map((r) => (
            <Voce
              key={r.id}
              icona={<Headphones size={20} />}
              titolo={r.nome}
              sotto={<>{r.sottotitolo && <span>{r.sottotitolo}</span>}{r.bytes ? <span>{fmtBytes(r.bytes)}</span> : null}</>}
              badge={<Badge stato={statoDownload(r)} t={t} />}
              onApri={() => apri({ tipo: 'audioguida', id: r.id.replace(/^audio:/, ''), nome: r.nome, lat: r.meta?.lat, lon: r.meta?.lon, poi: r.meta?.poi })}
            />
          ))}
        </section>
      )}

      {/* GUIDE E AUDIOLIBRI */}
      {guide.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="px-1 text-[11px] font-black uppercase tracking-[0.16em] text-on-surface-variant/60 flex items-center gap-2"><BookOpen size={13} /> {t('dl_guide')} · {guide.length}</h3>
          {guide.map((r) => (
            <Voce
              key={r.id}
              icona={<BookOpen size={20} />}
              titolo={r.nome}
              sotto={<>{r.sottotitolo && <span>{r.sottotitolo}</span>}{r.bytes ? <span>{fmtBytes(r.bytes)}</span> : null}</>}
              onApri={() => apri({ tipo: 'guida', id: r.id.replace(/^guida:/, '') })}
            />
          ))}
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
