// REPORT DEI PARTNER (25/11/2026, committente: «fa report anche dei partner?» → «e pagella?»). Legge il campo
// `report_partner` della riga della notte (`api_cache` `collaudo_notte_<data>`), calcolato dal collaudo su Oracle a fine
// notte da quattro fonti: pagina Eventi città per città, pagine dei partner aperte, offerte negli itinerari, pulsanti
// della mappa / widget / clic nell'app vera. Il voto è la voce `partner_<nome>` della Pagella.
import React, { useState } from 'react';

const NOMI: Record<string, string> = { viator: 'Viator', getyourguide: 'GetYourGuide', tiqets: 'Tiqets', klook: 'Klook', tripcom: 'Trip.com', ticketmaster: 'Ticketmaster' };
const colore = (v: number | null | undefined) => v == null ? 'bg-surface-variant text-on-surface-variant' : v >= 8 ? 'bg-green-100 text-green-800' : v >= 6 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800';
const fr = (a?: number, b?: number) => (b ? `${a ?? 0}/${b}` : '–');

const Riga: React.FC<{ k: string; p: any; prima?: any }> = ({ k, p, prima }) => {
  const [aperto, setAperto] = useState(false);
  const delta = p.voto != null && prima?.voto != null ? Math.round((p.voto - prima.voto) * 10) / 10 : null;
  const pg = p.pagine || {};
  return (
    <div className="p-3 rounded-2xl bg-white border border-outline-variant/10 space-y-1.5">
      <button onClick={() => setAperto(!aperto)} className="w-full text-left flex items-center gap-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${colore(p.voto)}`}>{p.voto != null ? Number(p.voto).toFixed(1) : '–'}</span>
        <span className="text-sm font-black text-on-surface">{NOMI[k] || k}</span>
        {delta != null && delta !== 0 && <span className={`text-[11px] font-black ${delta > 0 ? 'text-green-700' : 'text-red-700'}`}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)} sulla notte prima</span>}
      </button>
      <p className="text-[11px] font-semibold text-on-surface-variant/80">
        città con risultati {fr(p.citta_con_risultati, p.citta_provate)} · {p.voci ?? 0} voci · codice {fr((p.link_con_codice || 0) + (p.itinerari?.link_con_codice || 0), (p.link || 0) + (p.itinerari?.link || 0))} · rimando {fr(p.out_302, p.out)}
      </p>
      <p className="text-[11px] font-semibold text-on-surface-variant/80">
        pagine aperte: {pg.giusto ?? 0} giuste · {pg.diverso ?? 0} prodotto diverso · {pg.pagina_morta ?? 0} morte · {pg.non_leggibile ?? 0} non leggibili
        {p.mappa && <> · mappa: {p.mappa.aperto ? 'apre' : 'NON apre'}{p.mappa.clic_registrato ? ', clic registrato' : ', clic NON registrato'}</>}
        {p.itinerari?.offerte ? <> · itinerari: {p.itinerari.offerte} offerte</> : null}
      </p>
      {p.nota && <p className="text-[11px] text-on-surface-variant/60">{p.nota}</p>}
      {aperto && (p.difetti || []).length > 0 && (
        <ul className="text-[11px] space-y-0.5 pt-1">{p.difetti.map((d: string, i: number) => <li key={i} className="text-red-700 break-words">• {d}</li>)}</ul>
      )}
    </div>
  );
};

const ReportPartner: React.FC<{ notti: any[] }> = ({ notti }) => {
  const con = (notti || []).filter((n) => n?.report_partner?.partner);
  const [scelta, setScelta] = useState(0);
  if (!con.length) return <p className="text-sm font-bold text-on-surface-variant/60 px-1">Nessun report dei partner ancora: il primo arriva dal collaudo della notte 25→26/11.</p>;
  const i = Math.min(scelta, con.length - 1);
  const n = con[i], prima = con[i + 1];
  const P = n.report_partner.partner, tr = n.report_partner.tracciamento;
  const ordine = Object.keys(P).sort((a, b) => (P[a].voto ?? 99) - (P[b].voto ?? 99));
  return (
    <section className="space-y-3">
      <div className="flex gap-1.5 flex-wrap">
        {con.slice(0, 10).map((x, j) => <button key={x.data || j} onClick={() => setScelta(j)} className={`px-2.5 py-1 rounded-lg text-[11px] font-black ${j === i ? 'bg-primary text-white' : 'bg-primary/10 text-primary'}`}>{x.data}</button>)}
      </div>
      {tr && (
        <div className="p-3 rounded-2xl bg-white border border-outline-variant/10 text-[11px] font-semibold space-y-0.5">
          <p className="text-sm font-black text-on-surface">Clic registrati</p>
          <p>Contatore del server (/api/out): {tr.api_out ? (tr.api_out.registrato ? `ok (${tr.api_out.prima} → ${tr.api_out.dopo})` : `NON sale (HTTP ${tr.api_out.http})`) : '–'}</p>
          <p>Tabella delle statistiche (affiliate_clicks): {tr.affiliate_clicks ? (tr.affiliate_clicks.registrato ? 'ok (riga di prova scritta e cancellata)' : `NON registra (HTTP ${tr.affiliate_clicks.http})`) : '–'}</p>
        </div>
      )}
      {ordine.map((k) => <Riga key={k} k={k} p={P[k]} prima={prima?.report_partner?.partner?.[k]} />)}
      {/* (25/11/2026) eventi di ogni itinerario: quanti, da quali fonti, quanti con provvigione */}
      {(n.report_partner.eventi_itinerari || []).length > 0 && (
        <div className="p-3 rounded-2xl bg-white border border-outline-variant/10 text-[11px] font-semibold space-y-2">
          <p className="text-sm font-black text-on-surface">Eventi per itinerario</p>
          {n.report_partner.eventi_itinerari.map((e: any) => (
            <div key={e.citta} className="space-y-0.5">
              <p className="font-black">
                <span className={!e.totale || !e.da_affiliati ? 'text-red-600' : 'text-green-700'}>{!e.totale || !e.da_affiliati ? '✗' : '✓'}</span>{' '}
                {e.citta}: {e.totale} eventi · con provvigione {e.da_affiliati} ({e.quota_affiliati ?? 0}%) · primi 10 della lista: {e.primi_10_affiliati} affiliati
              </p>
              <p className="text-on-surface-variant/70">{Object.entries(e.per_fonte || {}).filter(([, v]) => Number(v) > 0).sort((a: any, b: any) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || 'nessuna fonte'}</p>
              {(e.portali_fonti || []).length > 0 && <p className="text-on-surface-variant/60">Portali ({e.portali_fonti_lette} letti): {e.portali_fonti.map((x: any) => `${x.fonte} ${x.eventi}`).join(' · ')}</p>}
            </div>
          ))}
        </div>
      )}
      <p className="text-[10px] text-on-surface-variant/50 px-1">I peggiori in alto. «Non leggibili»: il sito del partner blocca i programmi automatici, non è un difetto.</p>
    </section>
  );
};

export default ReportPartner;
