import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getApiUrl } from '../../lib/api';
import { QrCode, Link2, Mail, Download, Printer, Loader2 } from 'lucide-react';

/**
 * Scheda di UN coupon (12/10/2026, committente: «cliccando sul coupon si apre a quale ente/struttura è stato
 * emesso, quanti lo hanno consumato (es. 10/30) e gli user che lo hanno riscattato» + «file di esportazione
 * delle statistiche da inviare all'hotel»).
 * Nel pannello si vede anche l'email di chi ha riscattato; nel file per l'hotel MAI: solo nome e iniziale,
 * lingua, paese e data («nome e iniziale, lingua e paese»).
 */
interface Props {
  coupon: any;
  onMessage: (message: { type: 'success' | 'error'; text: string }) => void;
}

const SITO = 'https://www.wip.guide';
const data = (iso: any) => (iso ? new Date(iso).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '—');
const dataOra = (iso: any) => (iso ? new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }) : '—');
const esc = (v: any) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);

export default function CouponDettaglio({ coupon, onMessage }: Props) {
  const [dati, setDati] = useState<any | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const r = await fetch(getApiUrl(`/api/admin/coupon/${coupon.id}/dettaglio`), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `errore ${r.status}`);
        if (vivo) setDati(j);
      } catch (e: any) {
        if (vivo) setErrore(e?.message || 'lettura fallita');
      }
    })();
    return () => { vivo = false; };
  }, [coupon.id]);

  const lingua = String(dati?.ente?.lingua || 'IT').toUpperCase();
  const link = `${SITO}/regalo?codice=${encodeURIComponent(coupon.code)}${lingua === 'IT' ? '' : `&lang=${lingua}`}`;
  const nomeEnte = dati?.ente?.ente || coupon.structure_name || '—';
  const localita = dati?.ente?.localita || '';
  const usati = Number(dati?.coupon?.uses_count ?? coupon.uses_count ?? 0);
  const tetto = Number(dati?.coupon?.max_uses ?? coupon.max_uses ?? 0);
  const crediti = Number(coupon.reward_credits) || Number(coupon.duration_days || 0) * 10;
  const riscatti: any[] = dati?.riscatti || [];
  const nomeFile = `wip-regalo-${String(coupon.code).toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;

  const copiaLink = async () => {
    try { await navigator.clipboard.writeText(link); onMessage({ type: 'success', text: 'Link della presentazione copiato.' }); }
    catch { onMessage({ type: 'error', text: `Copia non riuscita: ${link}` }); }
  };

  // Email pronta nel programma di posta: solo il nome dell'ente e il link, nessun altro dettaglio.
  const inviaEmail = () => {
    const oggetto = `Un regalo da ${nomeEnte}`;
    const testo = `${nomeEnte} ha il piacere di regalarti ${crediti} crediti per provare WIP, la guida che ti racconta la città mentre la attraversi.\n\nApri il regalo:\n${link}\n\nCodice: ${coupon.code}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(testo)}`;
  };

  const esportaCsv = () => {
    const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const righe = [
      ['Struttura', nomeEnte], ['Località', localita], ['Codice', coupon.code],
      ['Crediti per ospite', crediti], ['Riscatti', `${usati}/${tetto}`], ['Scadenza', data(coupon.expires_at)], [],
      ['Ospite', 'Lingua', 'Paese', 'Data', 'Crediti'],
      ...riscatti.map((r) => [r.nome, r.lingua || '', r.paese || '', dataOra(r.quando), r.crediti]),
    ].map((r) => r.map(q).join(','));
    // BOM: senza, Excel apre gli accenti come geroglifici.
    const blob = new Blob(['﻿' + righe.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${nomeFile}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Il resoconto da mandare all'hotel: una pagina che il browser stampa o salva in PDF.
  const esportaPdf = () => {
    const w = window.open('', '_blank');
    if (!w) { onMessage({ type: 'error', text: 'Il browser ha bloccato la finestra del resoconto: consenti i popup.' }); return; }
    const pct = tetto > 0 ? Math.min(100, Math.round((usati / tetto) * 100)) : 0;
    w.document.write(`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(nomeFile)}</title><style>
      @page{size:A4;margin:16mm} *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2937;margin:0;padding:24px;max-width:180mm;margin:0 auto}
      .alto{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #1e3a8a;padding-bottom:8px}
      .alto b{color:#1e3a8a;font-size:15pt} .alto span{color:#6b7280;font-size:10pt}
      h1{font-size:22pt;margin:18px 0 2px} .loc{color:#6b7280;font-size:12pt;margin-bottom:16px}
      .numeri{display:flex;gap:12px;margin:14px 0} .numeri div{flex:1;background:#f8f5f0;border-radius:10px;padding:12px}
      .numeri small{display:block;color:#6b7280;font-size:9pt;text-transform:uppercase;letter-spacing:.08em} .numeri strong{font-size:18pt;color:#1e3a8a}
      .barra{height:10px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin-bottom:18px} .barra i{display:block;height:100%;background:#1e3a8a;width:${pct}%}
      table{width:100%;border-collapse:collapse;font-size:11pt} th{text-align:left;font-size:9pt;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;border-bottom:1px solid #d1d5db;padding:6px 4px}
      td{padding:7px 4px;border-bottom:1px solid #eee} tr{break-inside:avoid} .nota{color:#6b7280;font-size:9pt;margin-top:16px}
    </style></head><body>
      <div class="alto"><b>WIP · World in Pocket</b><span>wip.guide · ${esc(data(new Date().toISOString()))}</span></div>
      <h1>${esc(nomeEnte)}</h1><div class="loc">${esc(localita)}</div>
      <div class="numeri">
        <div><small>Regali riscattati</small><strong>${usati} / ${tetto}</strong></div>
        <div><small>Crediti per ospite</small><strong>${crediti}</strong></div>
        <div><small>Codice</small><strong>${esc(coupon.code)}</strong></div>
        <div><small>Valido fino al</small><strong>${esc(data(coupon.expires_at))}</strong></div>
      </div>
      <div class="barra"><i></i></div>
      <table><thead><tr><th>Ospite</th><th>Lingua</th><th>Paese</th><th>Data</th></tr></thead><tbody>
      ${riscatti.length ? riscatti.map((r) => `<tr><td>${esc(r.nome)}</td><td>${esc(r.lingua || '—')}</td><td>${esc(r.paese || '—')}</td><td>${esc(dataOra(r.quando))}</td></tr>`).join('') : '<tr><td colspan="4">Nessun regalo riscattato finora.</td></tr>'}
      </tbody></table>
      <p class="nota">Per riservatezza gli ospiti sono indicati con nome e iniziale del cognome.</p>
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
    </body></html>`);
    w.document.close();
  };

  const tasto = 'flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors';

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Emesso a</p>
          <p className="text-base font-black text-primary">{nomeEnte}</p>
          <p className="text-xs text-on-surface-variant font-bold">
            {[localita, dati?.ente?.paese, dati?.ente?.tipo].filter(Boolean).join(' · ') || (dati && !dati.ente ? 'Nessuna richiesta collegata a questo nome (coupon di campagna).' : '')}
          </p>
          {dati?.ente?.email && <p className="text-[11px] text-on-surface-variant/70">{dati.ente.referente ? `${dati.ente.referente} · ` : ''}{dati.ente.email}</p>}
        </div>
        <div className="text-left md:text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">Riscattati</p>
          <p className="text-2xl font-black text-primary">{usati}<span className="text-on-surface-variant/50"> / {tetto}</span></p>
          <p className="text-[11px] text-on-surface-variant font-bold">{usati * crediti} crediti regalati</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={link} target="_blank" rel="noreferrer" className={`${tasto} bg-primary text-white hover:opacity-95`}><QrCode className="w-3.5 h-3.5" /> Presentazione con QR</a>
        <button type="button" onClick={copiaLink} className={`${tasto} bg-white text-primary hover:bg-gray-100`}><Link2 className="w-3.5 h-3.5" /> Copia link</button>
        <button type="button" onClick={inviaEmail} className={`${tasto} bg-white text-primary hover:bg-gray-100`}><Mail className="w-3.5 h-3.5" /> Invia per email</button>
        <button type="button" onClick={esportaPdf} disabled={!dati} className={`${tasto} bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40`}><Printer className="w-3.5 h-3.5" /> Resoconto PDF</button>
        <button type="button" onClick={esportaCsv} disabled={!dati} className={`${tasto} bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40`}><Download className="w-3.5 h-3.5" /> Resoconto CSV</button>
      </div>

      {errore && <p className="text-xs font-bold text-red-600">Statistica non letta: {errore}</p>}
      {!dati && !errore && <p className="flex items-center gap-2 text-xs font-bold text-on-surface-variant"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Leggo i riscatti…</p>}
      {dati && (
        <div className="overflow-x-auto rounded-xl bg-white">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60">
              <tr><th className="p-2.5">Ospite</th><th className="p-2.5">Email (solo qui)</th><th className="p-2.5">Lingua</th><th className="p-2.5">Paese</th><th className="p-2.5">Quando</th><th className="p-2.5">Crediti</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {riscatti.map((r, i) => (
                <tr key={i}>
                  <td className="p-2.5 font-black text-primary">{r.nome}</td>
                  <td className="p-2.5 text-on-surface-variant">{r.email || '—'}</td>
                  <td className="p-2.5">{r.lingua || '—'}</td>
                  <td className="p-2.5">{r.paese || '—'}</td>
                  <td className="p-2.5">{dataOra(r.quando)}</td>
                  <td className="p-2.5">{r.crediti}</td>
                </tr>
              ))}
              {riscatti.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-on-surface-variant">Nessuno l'ha ancora riscattato.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
