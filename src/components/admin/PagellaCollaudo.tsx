/**
 * PAGELLA DEL COLLAUDO (18/11/2026, committente: «un report giornaliero degli itinerari testati con voti da 0 a 10
 * per accuratezza, qualità, errori di distanza, invenzioni… e una pagella generale fatta dalle medie, con un grafico
 * che indica il periodo, il voto e gli altri parametri, per capire se si sta migliorando»).
 *
 * I voti li calcola il collaudo notturno su Oracle (collaudo-notte.mjs, formule fisse) e li scrive in api_cache
 * `collaudo_notte_<data>`; qui si leggono tramite /api/admin/collaudo. Nessun calcolo dei voti in questo file:
 * solo medie, tendenza e grafico. Solo admin (cartella Test di «I miei download»).
 */
import React, { useMemo, useState } from 'react';

const PARAMETRI: Array<{ k: string; nome: string; spiega: string }> = [
  { k: 'voto_generale', nome: 'Generale', spiega: 'Media pesata di tutti i parametri' },
  { k: 'accuratezza', nome: 'Accuratezza', spiega: 'Tappe confermate come esistenti' },
  { k: 'invenzioni', nome: 'Invenzioni', spiega: '10 = nessuna tappa inventata, sostituita o da verificare' },
  { k: 'aggancio', nome: 'Aggancio', spiega: 'Tappe collegate alla scheda giusta' },
  { k: 'distanze', nome: 'Distanze', spiega: 'Percorsi a piedi senza anomalie' },
  { k: 'schede', nome: 'Schede', spiega: 'Testo, foto e audioguida dei luoghi culturali' },
  { k: 'doppioni', nome: 'Doppioni', spiega: '10 = nessun luogo ripetuto' },
  { k: 'testi', nome: 'Testi', spiega: 'Niente formule vietate, testi troncati o ragionamento del modello' },
  { k: 'tempi', nome: 'Tempi', spiega: 'Generazione + verifica entro 240 s' },
  { k: 'completezza', nome: 'Completezza', spiega: 'Giorni pieni, pranzo e cena, totale del viaggio' },
  { k: 'guida', nome: "Guida d'Autore", spiega: 'Esito, materiale, revisore' },
  { k: 'musei', nome: 'Guide museo', spiega: 'Tappe vuote, lingua, foto' },
];

const COLORI = ['#1e3a8a', '#d97706', '#059669', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569', '#9333ea', '#0d9488'];

/** Il voto di una notte per un parametro: `voti[k]`, oppure `voto_generale` in cima. */
function votoDi(n: any, k: string): number | null {
  const v = k === 'voto_generale' ? (n?.voto_generale ?? n?.voti?.voto_generale) : n?.voti?.[k];
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(0, Math.min(10, x)) : null;
}

function colore(v: number | null): string {
  if (v === null) return 'text-on-surface-variant/40';
  if (v >= 8) return 'text-green-700';
  if (v >= 6) return 'text-amber-700';
  return 'text-red-700';
}

const fmt = (v: number | null) => (v === null ? '–' : v.toFixed(1));
const num = (x: any): number | null => { const v = Number(x); return x == null || !Number.isFinite(v) ? null : Math.max(0, Math.min(10, v)); };
const quota = (a: any, b: any) => (Number(b) ? `${Number(a) || 0}/${Number(b)}` : '–');

// (21/11/2026, committente: «modifica la pagella») Nomi leggibili delle parti di `pagella_parti` (collaudo-notte.mjs,
// pagellaParti). Una parte che qui non c'è si mostra col suo nome tecnico: nessuna parte sparisce.
const NOMI_PARTI: Record<string, string> = {
  itinerari: 'Itinerari', guida_autore: "Guida d'Autore", guida_autore_pdf: 'PDF guida', guide_museo: 'Guide museo', traduzioni: 'Traduzioni',
  simulazione_ingressi: 'Ingressi', simulazione_scatto: 'Scatto guida', simulazione_navigatore: 'Navigatore (simulato)',
  confronto_mapbox: 'Ingressi confrontati con Mapbox', giro_ingressi_mapbox: 'Giro ingressi Mapbox (confermati, aggiunti, corretti · richieste del mese)', correzioni_ingressi: 'Ingressi corretti', audioguide_create: 'Audioguide create', dati_mancanti_riempiti: 'Dati mancanti riempiti',
  affiliati_itinerari: 'Partner affiliati', percorsi_collaudati: 'Percorsi collaudati', promozioni_verificati: 'Itinerari verificati',
  correzioni_senza_danni: 'Correzioni senza danni', searxng: 'SearXNG', groq: 'Revisore Groq', giudice: 'Giudice aggancio', deepseek: 'DeepSeek',
  crediti: 'Crediti', tempi: 'Tempi', rallentamenti: 'Rallentamenti', errori_collaudo: 'Errori del collaudo', oracle: 'Oracle', disco: 'Disco',
  groq_chiavi: 'Chiavi Groq', gonka: 'Gonka', modulo_app_vera: 'App vera (telefono virtuale)', modulo_nativo_android: 'Android a schermo spento',
  modulo_navigatore_auto: 'Navigatore auto', modulo_citta_a_piedi: 'Città a piedi', modulo_eventi_affiliati: 'Eventi e affiliati', modulo_eventi_sezioni: 'Eventi: ogni sezione e la mappa (mostre, permanenti, eventi, stagionali, mercati)', arricchimento_30min: 'Tappe arricchite entro 30 minuti (POI, scheda, foto, audioguida, teaser)', modulo_eventi_partner_atterraggio: 'Partner: la pagina aperta è il prodotto giusto, col nostro codice', modulo_tracciamento_affiliati: 'Clic affiliati registrati nelle statistiche',
  modulo_stato_portali: 'Portali eventi che funzionano (V / X per paese)', modulo_eventi_filtri: 'Filtri della ricerca eventi (data e distanza)', partner_viator: 'Partner Viator', partner_getyourguide: 'Partner GetYourGuide', partner_tiqets: 'Partner Tiqets', partner_klook: 'Partner Klook', partner_tripcom: 'Partner Trip.com', partner_ticketmaster: 'Partner Ticketmaster',
  modulo_musei: 'Modulo musei', modulo_pdf_e_offline: 'PDF e offline', modulo_schede: 'Modulo schede', modulo_chiedi_podcast: 'Chiedi e podcast',
  modulo_nativo_ios: 'iPhone (Swift) a schermo spento', modulo_testlab: 'Android su telefono vero (Test Lab)',
  nativo_android_testlab: 'Android su telefono vero (Test Lab)', modulo_testlab_ios: 'iPhone vero (Test Lab)',
  nativo_ios_testlab: 'iPhone vero (Test Lab)', modulo_batteria: 'Batteria nei giri',
};

// LA PAGELLA È SEMPRE COMPLETA (22/11/2026, committente: «deve essere completa la pagella — sempre! da domani»).
// Ogni test qui elencato compare OGNI notte: se la notte non l'ha scritto si mostra «NON ESEGUITO stanotte» in rosso,
// mai una riga che sparisce in silenzio. Un test nuovo del collaudo va aggiunto qui e in NOMI_PARTI.
const PARTI_ATTESE: string[][] = [
  ['itinerari'], ['guida_autore'], ['guida_autore_pdf'], ['guide_museo'], ['traduzioni'],
  ['simulazione_ingressi'], ['simulazione_scatto'], ['simulazione_navigatore'],
  ['confronto_mapbox'], ['giro_ingressi_mapbox'], // (24/11/2026) ingressi confrontati con Mapbox: tappe del collaudo e giro notturno
  ['dati_mancanti_riempiti'], ['correzioni_senza_danni'], ['affiliati_itinerari'],
  ['modulo_app_vera'], ['modulo_navigatore_auto'], ['modulo_citta_a_piedi'], ['modulo_eventi_affiliati'], ['modulo_eventi_sezioni'], ['arricchimento_30min'], ['modulo_eventi_partner_atterraggio'], ['modulo_tracciamento_affiliati'],
  ['modulo_stato_portali'], ['modulo_eventi_filtri'], ['partner_viator'], ['partner_getyourguide'], ['partner_tiqets'], ['partner_klook'], ['partner_tripcom'], ['partner_ticketmaster'],
  ['modulo_musei'], ['modulo_pdf_e_offline'], ['modulo_schede'], ['modulo_chiedi_podcast'],
  ['modulo_nativo_android'], ['modulo_nativo_ios'],
  // (23/11/2026) il collaudo li salva come modulo_<nome del modulo>: modulo_nativo_android_testlab / _ios_testlab — senza
  // questi due nomi la Pagella li dava «NON ESEGUITO» anche quando avevano girato
  ['modulo_nativo_android_testlab', 'modulo_testlab', 'nativo_android_testlab'], ['modulo_nativo_ios_testlab', 'modulo_testlab_ios', 'nativo_ios_testlab'], ['modulo_batteria'],
];
const NOMI_PARTNER: Record<string, string> = { viator: 'Viator', getyourguide: 'GetYourGuide', tiqets: 'Tiqets', klook: 'Klook', tripcom: 'Trip.com', trip: 'Trip.com', ticketmaster: 'Ticketmaster' };
const NOMI_VOCI_APP: Record<string, string> = { app_vera_wipnav: 'WipNav', app_vera_giro: 'Giro a più tappe', app_vera_auto: 'Auto' };
const testo = (x: any) => (typeof x === 'string' ? x : x && typeof x === 'object' ? (x.dettaglio || x.danno || x.motivo || x.nome || JSON.stringify(x)) : String(x ?? ''));

/** Un riquadro di una parte della notte: titolo, voto (o il motivo quando non c'è) e il contenuto. */
function Riquadro({ titolo, parte, children }: { titolo: string; parte: any; children?: React.ReactNode }) {
  const v = num(parte?.voto);
  return (
    <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-100 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-black text-on-surface">{titolo}</span>
        <span className={`font-black ${colore(v)}`}>{fmt(v)}</span>
      </div>
      {v === null && parte?.motivo && <p className="text-[11px] text-on-surface-variant/70">{String(parte.motivo)}</p>}
      {children}
    </div>
  );
}

/** Le parti di una notte (`pagella_parti`): partner, dati mancanti, correzioni, app vera, Android, e tutte le altre. */
function PartiNotte({ parti }: { parti: Record<string, any> }) {
  const aff = parti.affiliati_itinerari, dm = parti.dati_mancanti_riempiti, csd = parti.correzioni_senza_danni;
  const av = parti.modulo_app_vera, na = parti.modulo_nativo_android, tl = parti.modulo_testlab || parti.nativo_android_testlab;
  const giaMostrate = new Set(['affiliati_itinerari', 'dati_mancanti_riempiti', 'correzioni_senza_danni', 'modulo_app_vera', 'modulo_nativo_android', 'modulo_testlab', 'nativo_android_testlab']);
  const altre = Object.entries(parti).filter(([k, p]) => !giaMostrate.has(k) && p && typeof p === 'object');
  return (
    <details className="rounded-xl border border-outline-variant/10">
      <summary className="px-2.5 py-1.5 cursor-pointer font-black text-primary text-[11px] uppercase tracking-widest">Tutte le parti della notte</summary>
      <div className="p-2 space-y-2">
        {aff && (
          <Riquadro titolo="Partner affiliati (per ogni itinerario)" parte={aff}>
            {aff.itinerari !== undefined && (
              <p className="text-[11px] text-on-surface-variant/80">
                {aff.itinerari} itinerari · link senza il nostro codice {aff.link_senza_codice ?? 0} · /api/out non 302 {aff.out_non_302 ?? 0}
                {Array.isArray(aff.senza_offerte) && aff.senza_offerte.length > 0 ? ` · senza offerte: ${aff.senza_offerte.join(', ')}` : ''}
              </p>
            )}
            {aff.partner && typeof aff.partner === 'object' && (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-on-surface-variant/60">
                      <th className="pr-2 font-bold">Partner</th><th className="pr-2 font-bold">Itinerari con offerte</th><th className="pr-2 font-bold">Offerte</th><th className="pr-2 font-bold">Link col codice</th><th className="pr-2 font-bold">Out 302</th><th className="font-bold text-right">Voto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(aff.partner as Record<string, any>).map(([k, p]) => (
                      <tr key={k} className="border-t border-gray-100 align-top">
                        <td className="pr-2 py-0.5 font-bold">{NOMI_PARTNER[k] || k}{p?.nota ? <span className="block font-normal text-on-surface-variant/60">{p.nota}</span> : null}</td>
                        <td className="pr-2 py-0.5">{quota(p?.itinerari_con_offerte, p?.itinerari)}</td>
                        <td className="pr-2 py-0.5">{p?.offerte ?? 0}</td>
                        <td className="pr-2 py-0.5">{p?.codice_atteso ? quota(p?.link_con_codice, p?.link) : '—'}</td>
                        <td className="pr-2 py-0.5">{quota(p?.out_302, p?.out)}</td>
                        <td className={`py-0.5 text-right font-black ${colore(num(p?.voto))}`}>{fmt(num(p?.voto))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {Object.entries(aff.partner as Record<string, any>).flatMap(([k, p]) => (p?.esempi || []).slice(0, 2).map((e: any, i: number) => (
                  <p key={`${k}_${i}`} className="text-[10px] text-red-700/80 break-all">{NOMI_PARTNER[k] || k}{e?.citta ? ` · ${e.citta}` : ''}: {testo(e)}</p>
                )))}
              </div>
            )}
          </Riquadro>
        )}
        {dm && (
          <Riquadro titolo="Dati mancanti riempiti (coda della notte)" parte={dm}>
            <p className="text-[11px] text-on-surface-variant/80">
              Riempiti stanotte {dm.riempiti ?? 0} su {dm.lavorate ?? 0} · ancora mancanti {dm.ancora_mancanti ?? 0} · senza fonti {dm.senza_fonti_nuovi ?? 0} · danni bloccati {dm.danni_bloccati ?? 0}
              {dm.in_coda != null ? ` · in coda ${dm.in_coda}` : ''}{dm.secondi_medi_per_luogo != null ? ` · ${dm.secondi_medi_per_luogo} s per luogo` : ''}
            </p>
            {dm.per_tipo && typeof dm.per_tipo === 'object' && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(dm.per_tipo as Record<string, any>).map(([k, x]) => (
                  <span key={k} className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-bold">{k.replace(/_/g, ' ')}: {typeof x === 'object' ? Object.entries(x).map(([a, b]) => `${a} ${b}`).join(' · ') : String(x)}</span>
                ))}
              </div>
            )}
          </Riquadro>
        )}
        {csd && (
          <Riquadro titolo="Correzioni senza danni" parte={csd}>
            {Array.isArray(csd.anomalie) && csd.anomalie.length > 0 && (
              <div>{csd.anomalie.slice(0, 6).map((a: any, i: number) => <p key={i} className="text-[10px] text-red-700/80">Anomalia · {a?.modulo || ''} {a?.citta || ''} {a?.nome || a?.id || ''}</p>)}</div>
            )}
            {Array.isArray(csd.danni_bloccati) && csd.danni_bloccati.length > 0 && (
              <div>{csd.danni_bloccati.slice(0, 6).map((a: any, i: number) => <p key={i} className="text-[10px] text-emerald-800">Bloccata e rimessa com'era · {a?.modulo || ''} {a?.citta || ''} {a?.id || ''}{a?.danno ? ` — ${testo(a.danno)}` : ''}</p>)}</div>
            )}
          </Riquadro>
        )}
        {av && (
          <Riquadro titolo="App vera — telefono virtuale" parte={av}>
            {av.sezione_notte?.day_pass && <p className="text-[11px] text-on-surface-variant/80">Day Pass: {testo(av.sezione_notte.day_pass.stato || av.sezione_notte.day_pass)}{av.sezione_notte.day_pass.dettaglio ? ` — ${av.sezione_notte.day_pass.dettaglio}` : ''}</p>}
            {av.sezione_notte?.voci && Object.entries(av.sezione_notte.voci as Record<string, any>).map(([k, x]) => (
              <div key={k} className="pl-2 border-l-2 border-primary/20">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{NOMI_VOCI_APP[k] || k}</span>
                  <span className={`font-black ${colore(num(x?.voto))}`}>{fmt(num(x?.voto))}</span>
                </div>
                {num(x?.voto) === null && x?.motivo && <p className="text-[10px] text-on-surface-variant/70">{x.motivo}</p>}
                {(x?.esempi || []).slice(0, 4).map((e: any, i: number) => <p key={i} className="text-[10px] text-red-700/80">{testo(e)}</p>)}
              </div>
            ))}
          </Riquadro>
        )}
        {na && (
          <Riquadro titolo="Android a schermo spento (logica nativa)" parte={na}>
            {na.sezione_notte?.casi && typeof na.sezione_notte.casi === 'object' && (
              <div className="flex flex-wrap gap-1">
                {Object.entries(na.sezione_notte.casi as Record<string, any>).map(([k, x]) => (
                  <span key={k} className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-bold">{k.replace(/_/g, ' ')} <span className={colore(num(x?.voto ?? x))}>{fmt(num(x?.voto ?? x))}</span></span>
                ))}
              </div>
            )}
            {(na.sezione_notte?.esempi || []).slice(0, 4).map((e: any, i: number) => <p key={i} className="text-[10px] text-red-700/80">{testo(e)}</p>)}
          </Riquadro>
        )}
        {tl &&<Riquadro titolo="Android su telefono Firebase Test Lab" parte={tl} />}
        {altre.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {altre.map(([k, p]) => (
              <span key={k} title={num(p.voto) === null ? String(p.motivo || '') : ''} className="px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100 font-bold text-[11px]">
                {NOMI_PARTI[k] || k.replace(/^modulo_/, '').replace(/_/g, ' ')} <span className={colore(num(p.voto))}>{fmt(num(p.voto))}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

// ── (21/11/2026, committente: «pagella per tutti i test — ogni test: report e pagella», «e regole da applicare per il
// miglioramento e comparazione delle percentuali degli errori per vedere se migliora il tutto»). Tutto calcolato qui
// dalle righe delle notti (pagella_parti, regole_proposte, motori_notte): nessun voto nuovo, solo confronti.

/** Quali famiglie di regole proposte (campo `area`) riguardano quale test (chiave di pagella_parti). */
const AREA_PARTI: Record<string, string[]> = {
  aggancio: ['itinerari'], deepseek: ['itinerari', 'deepseek'], controllo: ['itinerari'], giudice: ['giudice'],
  navigatore: ['simulazione_navigatore', 'simulazione_scatto', 'modulo_navigatore_auto', 'modulo_citta_a_piedi', 'modulo_app_vera', 'modulo_nativo_android', 'modulo_nativo_ios', 'modulo_nativo_android_testlab', 'modulo_nativo_ios_testlab'],
  audioguida_libera: ['simulazione_scatto', 'modulo_citta_a_piedi', 'modulo_app_vera', 'modulo_nativo_android', 'modulo_nativo_ios'],
  ingressi: ['simulazione_ingressi', 'correzioni_ingressi', 'confronto_mapbox', 'giro_ingressi_mapbox'], ingressi_mapbox: ['confronto_mapbox', 'giro_ingressi_mapbox'],
  museo: ['guide_museo', 'modulo_musei'], musei: ['guide_museo', 'modulo_musei'],
  eventi: ['modulo_eventi_affiliati', 'modulo_eventi', 'modulo_eventi_sezioni'], affiliati: ['affiliati_itinerari', 'modulo_affiliati_itinerari', 'modulo_eventi_partner_atterraggio', 'modulo_tracciamento_affiliati', 'partner_viator', 'partner_getyourguide', 'partner_tiqets', 'partner_klook', 'partner_tripcom', 'partner_ticketmaster'],
  chiedi: ['modulo_chiedi_podcast'], pdf_offline: ['modulo_pdf_e_offline', 'guida_autore_pdf'], traduzioni: ['traduzioni'],
  schede: ['modulo_schede', 'dati_mancanti_riempiti', 'audioguide_create'],
};
const nomeParte = (k: string) => NOMI_PARTI[k] || k.replace(/^modulo_/, '').replace(/_/g, ' ');
const media = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (a: any, b: any) => (Number(b) > 0 && a != null && Number.isFinite(Number(a)) ? (100 * Number(a)) / Number(b) : null);

/** Mini grafico del voto di un test nel tempo (0–10). */
function Linea({ valori }: { valori: Array<number | null> }) {
  const p = valori.map((v, i) => ({ i, v })).filter((x) => x.v !== null) as Array<{ i: number; v: number }>;
  if (p.length < 2) return null;
  const W = 90, H = 22, n = Math.max(1, valori.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-[90px] h-[22px] shrink-0" aria-hidden="true">
      <polyline fill="none" stroke="#1e3a8a" strokeWidth={1.5} points={p.map((x) => `${(x.i * W) / n},${H - 2 - (x.v * (H - 4)) / 10}`).join(' ')} />
    </svg>
  );
}

/** Ogni test con la sua pagella (voto di stanotte, media, tendenza, grafico) e il suo report (motivo, dati, casi per città, regole). */
function SchedeTest({ serie }: { serie: any[] }) {
  const [aperto, setAperto] = useState<string | null>(null);
  const test = useMemo(() => {
    const chiavi = new Set<string>();
    for (const n of serie) for (const k of Object.keys(n?.pagella_parti || {})) chiavi.add(k);
    const ultima = serie[serie.length - 1];
    // Pagella completa: ogni test atteso entra sempre (con la chiave che ha scritto, o la prima); se stanotte manca è
    // «NON ESEGUITO», non il voto di una notte vecchia.
    const sinonimo = new Map<string, string>();
    for (const gruppo of PARTI_ATTESE) {
      const usata = gruppo.find((k) => chiavi.has(k)) || gruppo[0];
      chiavi.add(usata);
      for (const k of gruppo) if (k !== usata) { sinonimo.set(k, usata); chiavi.delete(k); }
    }
    const altri = (k: string) => [k, ...[...sinonimo].filter(([, u]) => u === k).map(([alt]) => alt)];
    const leggi = (n: any, k: string) => { for (const x of altri(k)) if (n?.pagella_parti?.[x]) return n.pagella_parti[x]; return null; };
    const ultimoIdxTot = serie.length - 1;
    return [...chiavi].map((k) => {
      const valori = serie.map((n) => num(leggi(n, k)?.voto));
      const con = valori.filter((v): v is number => v !== null);
      // Il voto mostrato è SEMPRE quello di stanotte: una parte assente stanotte non prende il voto di una notte vecchia.
      const mancante = !leggi(ultima, k);
      const parte = mancante ? { voto: null, motivo: 'NON ESEGUITO stanotte' } : leggi(ultima, k);
      const v = num(parte?.voto);
      const prec = (() => { for (let i = ultimoIdxTot - 1; i >= 0; i--) { const x = num(leggi(serie[i], k)?.voto); if (x !== null) return x; } return null; })();
      const regole = (Array.isArray(ultima?.regole_proposte) ? ultima.regole_proposte : []).filter((r: any) => (AREA_PARTI[String(r?.area || '')] || []).includes(k));
      return { k, nome: nomeParte(k), valori, v, mancante, media: media(con), delta: v !== null && prec !== null ? v - prec : null, parte, data: ultima?.data, notte: ultima, regole };
    }).sort((a, b) => Number(b.mancante) - Number(a.mancante) || (a.v ?? 11) - (b.v ?? 11) || a.nome.localeCompare(b.nome));
  }, [serie]);
  const nonEseguiti = test.filter((t) => t.mancante).length;
  if (!test.length) return null;
  return (
    <div className="p-4 rounded-[1.5rem] bg-white border border-outline-variant/10 shadow-sm space-y-2">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Pagella di ogni test</h4>
        <span className="text-[11px] font-bold text-on-surface-variant/60">{test.length} test · i peggiori in alto</span>
      </div>
      {nonEseguiti > 0 && <p className="text-[11px] font-black text-red-700">PAGELLA INCOMPLETA: {nonEseguiti} test non eseguiti stanotte</p>}
      {test.map((t) => {
        const nomeMod = t.k.startsWith('modulo_') ? t.k.slice(7) : null;
        const mod = nomeMod ? t.notte?.moduli?.[nomeMod] : null;
        const dati = t.parte ? Object.entries(t.parte).filter(([kk, x]) => !['voto', 'motivo', 'sezione_notte', 'esempi', 'partner', 'voti'].includes(kk) && (typeof x === 'number' || typeof x === 'boolean' || (typeof x === 'string' && x.length <= 80))) : [];
        const esempi = [...(t.parte?.esempi || []), ...(t.parte?.sezione_notte?.esempi || [])].slice(0, 5);
        return (
          <div key={t.k} className="rounded-xl border border-gray-100">
            <button onClick={() => setAperto(aperto === t.k ? null : t.k)} className="w-full flex items-center gap-2 px-2.5 py-2 text-left">
              <span className="flex-1 min-w-0">
                <span className="block font-black text-[12px] text-on-surface truncate">{t.nome}</span>
                <span className="block text-[10px] font-bold text-on-surface-variant/60 truncate">
                  media {fmt(t.media)}{t.delta !== null && Math.abs(t.delta) >= 0.05 ? <span className={t.delta > 0 ? 'text-green-700' : 'text-red-700'}> · {t.delta > 0 ? '▲' : '▼'} {Math.abs(t.delta).toFixed(1)}</span> : null}
                  {t.v === null && t.parte?.motivo ? ` · ${String(t.parte.motivo)}` : ''}{t.regole.length ? ` · ${t.regole.length} regole proposte` : ''}
                </span>
              </span>
              <Linea valori={t.valori} />
              {t.mancante
                ? <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-black text-[10px]">NON ESEGUITO</span>
                : <span className={`w-9 text-right font-black text-lg ${colore(t.v)}`}>{fmt(t.v)}</span>}
            </button>
            {aperto === t.k && (
              <div className="px-2.5 pb-2.5 space-y-1.5 text-[11px]">
                <p className="font-bold text-on-surface-variant/70">Report della notte {t.data}</p>
                {t.v === null && t.parte?.motivo && <p className="text-amber-800">Senza voto: {String(t.parte.motivo)}</p>}
                {dati.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {dati.map(([kk, x]) => <span key={kk} className="px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100 font-bold text-[10px]">{kk.replace(/_/g, ' ')}: {String(x)}</span>)}
                  </div>
                )}
                {Array.isArray(mod?.citta) && mod.citta.length > 0 && (
                  <div className="space-y-0.5">
                    {mod.citta.map((c: any, i: number) => (
                      <div key={i} className="flex justify-between gap-2 pl-2 border-l-2 border-primary/20">
                        <span className="truncate">{c.citta}{num(c.voto) === null && c.motivo ? ` — ${c.motivo}` : ''}</span>
                        <span className={`font-black ${colore(num(c.voto))}`}>{fmt(num(c.voto))}</span>
                      </div>
                    ))}
                  </div>
                )}
                {esempi.map((e: any, i: number) => <p key={i} className="text-[10px] text-red-700/80">{testo(e)}</p>)}
                {t.regole.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-bold text-on-surface-variant/70">Regole da applicare</p>
                    {t.regole.slice(0, 6).map((r: any, i: number) => (
                      <p key={i} className="pl-2 border-l-2 border-amber-300">{String(r.descrizione || r.caso || r.codice || '')}<span className="text-on-surface-variant/60"> · ×{r.occorrenze ?? '?'}{r.gravi ? ` (${r.gravi} gravi)` : ''}</span></p>
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

/** Percentuali di errore della notte a confronto con la notte prima e con la media delle 7 prima: si migliora? */
function ConfrontoErrori({ serie }: { serie: any[] }) {
  const righe = useMemo(() => {
    const misure: Array<{ nome: string; f: (n: any) => number | null; unita: string }> = [
      { nome: 'Errori gravi per itinerario', unita: '', f: (n) => { const m = n?.motori_notte || {}; const it = Number(m.itinerari || n?.citta?.length || 0); return it ? Number(m.gravi ?? 0) / it : null; } },
      { nome: 'Problemi per itinerario', unita: '', f: (n) => { const m = n?.motori_notte || {}; const it = Number(m.itinerari || n?.citta?.length || 0); return it && m.problemi != null ? Number(m.problemi) / it : null; } },
      { nome: 'Tappe inventate', unita: '%', f: (n) => pct(n?.motori_notte?.deepseek?.tappe_inventate, n?.motori_notte?.deepseek?.tappe) },
      { nome: 'Tappe da verificare', unita: '%', f: (n) => pct(n?.motori_notte?.deepseek?.tappe_da_verificare, n?.motori_notte?.deepseek?.tappe) },
      { nome: 'Pasti sostituiti', unita: '%', f: (n) => pct(n?.motori_notte?.deepseek?.pasti_sostituiti, n?.motori_notte?.deepseek?.tappe) },
      { nome: 'Tappe non agganciate', unita: '%', f: (n) => pct(n?.motori_notte?.aggancio?.non_agganciate, n?.motori_notte?.aggancio?.tappe) },
      { nome: 'Testi troncati', unita: '%', f: (n) => pct(n?.motori_notte?.deepseek?.testi_troncati, n?.motori_notte?.deepseek?.tappe) },
      { nome: 'Gravi di navigazione per itinerario', unita: '', f: (n) => { const m = n?.motori_notte || {}; const it = Number(m.itinerari || n?.citta?.length || 0); return it && m.gravi_navigazione != null ? Number(m.gravi_navigazione) / it : null; } },
      { nome: 'Schede mancanti per itinerario', unita: '', f: (n) => { const m = n?.motori_notte || {}; const it = Number(m.itinerari || n?.citta?.length || 0); return it && m.gravi_schede != null ? Number(m.gravi_schede) / it : null; } },
      { nome: 'Test sotto il 6', unita: '%', f: (n) => { const v = Object.values(n?.pagella_parti || {}).map((p: any) => num(p?.voto)).filter((x): x is number => x !== null); return v.length ? (100 * v.filter((x) => x < 6).length) / v.length : null; } },
    ];
    const ult = serie[serie.length - 1], pre = serie[serie.length - 2];
    return misure.map((m) => {
      const a = m.f(ult), b = pre ? m.f(pre) : null;
      const sette = media(serie.slice(-8, -1).map(m.f).filter((x): x is number => x !== null));
      return { ...m, a, b, sette };
    }).filter((r) => r.a !== null || r.b !== null);
  }, [serie]);
  // Gli stessi errori, per codice: quante volte per itinerario stanotte contro la notte prima.
  const codici = useMemo(() => {
    const perNotte = (n: any) => {
      const it = Number(n?.motori_notte?.itinerari || n?.citta?.length || 0) || 1;
      const m = new Map<string, { n: number; desc: string; area: string }>();
      for (const r of n?.regole_proposte || []) { const c = String(r?.codice || r?.id || ''); if (!c) continue; const x = m.get(c) || { n: 0, desc: String(r?.descrizione || c), area: String(r?.area || '') }; x.n += Number(r?.occorrenze || 0); m.set(c, x); }
      return { it, m };
    };
    const A = perNotte(serie[serie.length - 1]), B = serie.length > 1 ? perNotte(serie[serie.length - 2]) : null;
    const tutti = new Set([...A.m.keys(), ...(B ? B.m.keys() : [])]);
    return [...tutti].map((c) => {
      const a = (A.m.get(c)?.n || 0) / A.it, b = B ? (B.m.get(c)?.n || 0) / B.it : null;
      return { c, desc: A.m.get(c)?.desc || B?.m.get(c)?.desc || c, area: A.m.get(c)?.area || B?.m.get(c)?.area || '', a, b };
    }).sort((x, y) => y.a - x.a).slice(0, 15);
  }, [serie]);
  if (!righe.length) return null;
  const freccia = (a: number | null, b: number | null) => (a === null || b === null || Math.abs(a - b) < 0.005 ? <span className="text-on-surface-variant/40">=</span> : a < b ? <span className="text-green-700">▼ meglio</span> : <span className="text-red-700">▲ peggio</span>);
  const f2 = (x: number | null, u: string) => (x === null ? '–' : `${x.toFixed(u === '%' ? 1 : 2)}${u}`);
  const meglio = righe.filter((r) => r.a !== null && r.b !== null && r.a < r.b - 0.005).length;
  const peggio = righe.filter((r) => r.a !== null && r.b !== null && r.a > r.b + 0.005).length;
  return (
    <div className="p-4 rounded-[1.5rem] bg-white border border-outline-variant/10 shadow-sm space-y-2">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Errori a confronto</h4>
        <span className="text-[11px] font-bold"><span className="text-green-700">{meglio} meglio</span> · <span className="text-red-700">{peggio} peggio</span></span>
      </div>
      <p className="text-[10px] text-on-surface-variant/60">Più basso è meglio. Le città cambiano ogni notte: si confrontano le PERCENTUALI, non i numeri.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead><tr className="text-left text-on-surface-variant/60"><th className="pr-2 font-bold">Errore</th><th className="pr-2 font-bold">Stanotte</th><th className="pr-2 font-bold">Notte prima</th><th className="pr-2 font-bold">Media 7</th><th className="font-bold">Tendenza</th></tr></thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.nome} className="border-t border-gray-100">
                <td className="pr-2 py-0.5 font-bold">{r.nome}</td>
                <td className="pr-2 py-0.5">{f2(r.a, r.unita)}</td>
                <td className="pr-2 py-0.5">{f2(r.b, r.unita)}</td>
                <td className="pr-2 py-0.5">{f2(r.sette, r.unita)}</td>
                <td className="py-0.5 font-bold">{freccia(r.a, r.b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {codici.length > 0 && (
        <details className="rounded-xl border border-outline-variant/10">
          <summary className="px-2.5 py-1.5 cursor-pointer font-black text-primary text-[11px] uppercase tracking-widest">Ogni errore, per itinerario</summary>
          <div className="p-2 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-left text-on-surface-variant/60"><th className="pr-2 font-bold">Errore</th><th className="pr-2 font-bold">Stanotte</th><th className="pr-2 font-bold">Prima</th><th className="font-bold">Tendenza</th></tr></thead>
              <tbody>
                {codici.map((r) => (
                  <tr key={r.c} className="border-t border-gray-100 align-top">
                    <td className="pr-2 py-0.5"><span className="font-bold">{r.area ? `${r.area} · ` : ''}</span>{r.desc.slice(0, 110)}</td>
                    <td className="pr-2 py-0.5">{r.a.toFixed(2)}</td>
                    <td className="pr-2 py-0.5">{r.b === null ? '–' : r.b.toFixed(2)}</td>
                    <td className="py-0.5 font-bold">{freccia(r.a, r.b)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

/** Le regole proposte dall'ultima notte, divise per famiglia: nuove, ricorrenti (c'erano già la notte prima), sparite. */
function RegoleDaApplicare({ serie }: { serie: any[] }) {
  const ult = serie[serie.length - 1], pre = serie[serie.length - 2];
  const chiave = (r: any) => String(r?.codice || r?.id || r?.descrizione || '');
  const prima = new Set((pre?.regole_proposte || []).map(chiave));
  const ora = new Set((ult?.regole_proposte || []).map(chiave));
  const regole: any[] = Array.isArray(ult?.regole_proposte) ? ult.regole_proposte : [];
  const sparite = (pre?.regole_proposte || []).filter((r: any) => !ora.has(chiave(r)));
  if (!regole.length && !sparite.length) return null;
  const perArea = new Map<string, any[]>();
  for (const r of [...regole].sort((a, b) => Number(b?.gravi || 0) - Number(a?.gravi || 0) || Number(b?.occorrenze || 0) - Number(a?.occorrenze || 0))) {
    const a = String(r?.area || 'altro'); perArea.set(a, [...(perArea.get(a) || []), r]);
  }
  return (
    <div className="p-4 rounded-[1.5rem] bg-white border border-outline-variant/10 shadow-sm space-y-2">
      <div className="flex items-baseline justify-between">
        <h4 className="text-xs font-black uppercase tracking-widest text-primary">Regole da applicare</h4>
        <span className="text-[11px] font-bold text-on-surface-variant/60">{ult?.data} · {regole.length} proposte{pre ? ` · ${regole.filter((r) => prima.has(chiave(r))).length} ricorrenti · ${sparite.length} sparite` : ''}</span>
      </div>
      <p className="text-[10px] text-on-surface-variant/60">Ogni mattina diventano codice + un caso nel banco (solo errori: grafica, lunghezza, consigli e avvisi restano). «Ricorrente» = c'era già la notte prima: la correzione non è ancora arrivata o non basta.</p>
      {[...perArea.entries()].map(([area, rr]) => (
        <details key={area} className="rounded-xl border border-gray-100">
          <summary className="px-2.5 py-1.5 cursor-pointer text-[11px] font-black">{area.replace(/_/g, ' ')} <span className="text-on-surface-variant/60">· {rr.length}</span></summary>
          <div className="px-2.5 pb-2 space-y-1">
            {rr.map((r, i) => (
              <div key={i} className="pl-2 border-l-2 border-amber-300 text-[11px]">
                <p>{String(r?.descrizione || r?.caso || r?.codice || '')}</p>
                <p className="text-[10px] text-on-surface-variant/60">
                  ×{r?.occorrenze ?? '?'}{r?.gravi ? ` · ${r.gravi} gravi` : ''}{Array.isArray(r?.citta) && r.citta.length ? ` · ${r.citta.slice(0, 4).join(', ')}` : ''}
                  {pre ? (prima.has(chiave(r)) ? <span className="text-red-700 font-bold"> · ricorrente</span> : <span className="text-amber-700 font-bold"> · nuova</span>) : null}
                  {r?.funzione ? ` · ${r.funzione}` : ''}
                </p>
              </div>
            ))}
          </div>
        </details>
      ))}
      {sparite.length > 0 && (
        <details className="rounded-xl border border-emerald-100">
          <summary className="px-2.5 py-1.5 cursor-pointer text-[11px] font-black text-emerald-800">Sparite rispetto alla notte prima · {sparite.length}</summary>
          <div className="px-2.5 pb-2 space-y-0.5">{sparite.slice(0, 20).map((r: any, i: number) => <p key={i} className="text-[10px] text-emerald-800">{String(r?.descrizione || r?.codice || '')}</p>)}</div>
        </details>
      )}
    </div>
  );
}

export default function PagellaCollaudo({ notti }: { notti: any[] }) {
  // Solo le notti con voti, dalla più vecchia alla più recente (l'asse del tempo del grafico).
  const serie = useMemo(() => (Array.isArray(notti) ? notti : [])
    .filter((n) => n && (n.voti || n.voto_generale !== undefined))
    .sort((a, b) => String(a.data || '').localeCompare(String(b.data || ''))), [notti]);
  const [scelti, setScelti] = useState<string[]>(['voto_generale', 'accuratezza', 'invenzioni', 'distanze']);
  const [vista, setVista] = useState<'linee' | 'colonne'>('linee');

  const medie = useMemo(() => PARAMETRI.map((p) => {
    const valori = serie.map((n) => votoDi(n, p.k)).filter((v): v is number => v !== null);
    const media = valori.length ? valori.reduce((a, b) => a + b, 0) / valori.length : null;
    // Tendenza: media delle ultime 3 notti contro le 3 precedenti (servono almeno 2 notti).
    const ultime = valori.slice(-3), prima = valori.slice(-6, -3);
    const delta = ultime.length && prima.length
      ? ultime.reduce((a, b) => a + b, 0) / ultime.length - prima.reduce((a, b) => a + b, 0) / prima.length
      : valori.length >= 2 ? valori[valori.length - 1] - valori[0] : null;
    return { ...p, media, delta, n: valori.length };
  }), [serie]);

  if (!serie.length) {
    return <p className="text-sm text-on-surface-variant/60 px-1">Ancora nessuna notte con i voti: la prima pagella arriva dopo il primo collaudo notturno.</p>;
  }

  // ── Grafico SVG (niente librerie): asse X = notti, asse Y = 0–10 ──
  const W = 340, H = 190, L = 26, R = 8, T = 10, B = 28;
  const x = (i: number) => L + (serie.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (serie.length - 1));
  const y = (v: number) => T + ((10 - v) * (H - T - B)) / 10;
  const etichetta = (d: string) => String(d || '').slice(5).replace('-', '/');
  const passoEtichette = Math.max(1, Math.ceil(serie.length / 6));

  return (
    <div className="space-y-4">
      {/* PAGELLA GENERALE: le medie di tutte le notti, con la tendenza */}
      <div className="p-4 rounded-[1.5rem] bg-white border border-outline-variant/10 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h4 className="text-xs font-black uppercase tracking-widest text-primary">Pagella generale</h4>
          <span className="text-[11px] font-bold text-on-surface-variant/60">{serie.length} notti · {String(serie[0].data)} → {String(serie[serie.length - 1].data)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {medie.filter((m) => m.n > 0).map((m) => (
            <div key={m.k} className={`p-2.5 rounded-xl border ${m.k === 'voto_generale' ? 'col-span-2 bg-primary/5 border-primary/20' : 'bg-gray-50 border-gray-100'}`} title={m.spiega}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-black text-on-surface truncate">{m.nome}</span>
                <span className={`font-black ${m.k === 'voto_generale' ? 'text-2xl' : 'text-lg'} ${colore(m.media)}`}>{fmt(m.media)}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-bold text-on-surface-variant/60">
                <span className="truncate">{m.spiega}</span>
                {m.delta !== null && Math.abs(m.delta) >= 0.05 && (
                  <span className={m.delta > 0 ? 'text-green-700' : 'text-red-700'}>{m.delta > 0 ? '▲' : '▼'} {Math.abs(m.delta).toFixed(1)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* GRAFICO: periodo sull'asse X, voto sull'asse Y; linee o colonne, parametri a scelta */}
      <div className="p-4 rounded-[1.5rem] bg-white border border-outline-variant/10 shadow-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-black uppercase tracking-widest text-primary">Andamento</h4>
          <div className="inline-flex rounded-full bg-surface-variant/40 p-0.5">
            {(['linee', 'colonne'] as const).map((v) => (
              <button key={v} onClick={() => setVista(v)} className={`px-3 py-1 rounded-full text-[11px] font-black ${vista === v ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant/60'}`}>{v === 'linee' ? 'Linee' : 'Colonne'}</button>
            ))}
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" role="img" aria-label="Andamento dei voti nel tempo">
          {[0, 2, 4, 6, 8, 10].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth={1} />
              <text x={L - 4} y={y(v) + 3} fontSize={8} textAnchor="end" fill="#6b7280">{v}</text>
            </g>
          ))}
          {serie.map((n, i) => (i % passoEtichette === 0 || i === serie.length - 1) && (
            <text key={`e${i}`} x={x(i)} y={H - 10} fontSize={8} textAnchor="middle" fill="#6b7280">{etichetta(n.data)}</text>
          ))}
          {vista === 'linee' && scelti.map((k) => {
            const ci = PARAMETRI.findIndex((p) => p.k === k);
            const punti = serie.map((n, i) => ({ i, v: votoDi(n, k) })).filter((p) => p.v !== null) as Array<{ i: number; v: number }>;
            if (!punti.length) return null;
            return (
              <g key={k}>
                <polyline fill="none" stroke={COLORI[ci % COLORI.length]} strokeWidth={k === 'voto_generale' ? 2.5 : 1.5} points={punti.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} />
                {punti.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={k === 'voto_generale' ? 3 : 2} fill={COLORI[ci % COLORI.length]} />)}
              </g>
            );
          })}
          {vista === 'colonne' && (() => {
            const largo = Math.max(2, Math.min(18, ((W - L - R) / Math.max(1, serie.length)) / Math.max(1, scelti.length) - 1));
            return serie.map((n, i) => scelti.map((k, j) => {
              const v = votoDi(n, k);
              if (v === null) return null;
              const ci = PARAMETRI.findIndex((p) => p.k === k);
              const x0 = x(i) - (scelti.length * (largo + 1)) / 2 + j * (largo + 1);
              return <rect key={`${i}-${k}`} x={x0} y={y(v)} width={largo} height={y(0) - y(v)} fill={COLORI[ci % COLORI.length]} rx={1} />;
            }));
          })()}
        </svg>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PARAMETRI.map((p, ci) => {
            const attivo = scelti.includes(p.k);
            return (
              <button
                key={p.k}
                onClick={() => setScelti((s) => attivo ? s.filter((x) => x !== p.k) : [...s, p.k])}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black border ${attivo ? 'bg-white border-gray-300' : 'bg-gray-50 border-transparent text-on-surface-variant/50'}`}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: attivo ? COLORI[ci % COLORI.length] : '#d1d5db' }} />
                {p.nome}
              </button>
            );
          })}
        </div>
      </div>

      <ConfrontoErrori serie={serie} />
      <SchedeTest serie={serie} />
      <RegoleDaApplicare serie={serie} />

      {/* REPORT GIORNALIERI: la notte più recente in alto */}
      <h4 className="px-1 text-xs font-black uppercase tracking-widest text-primary">Report giornalieri</h4>
      {[...serie].reverse().map((n, i) => (
        <div key={`${n.data}_${i}`} className="p-3 rounded-2xl bg-white border border-outline-variant/10 text-[12px] space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-black text-on-surface">{n.data}</p>
            <span className={`text-lg font-black ${colore(votoDi(n, 'voto_generale'))}`}>{fmt(votoDi(n, 'voto_generale'))}</span>
          </div>
          {n.riassunto && <p className="text-on-surface-variant/80">{n.riassunto}</p>}
          {/* (20/11/2026) Correzioni fatte dal collaudo nella notte: ingressi spostati, audioguide create, rimasti. */}
          {n.luoghi_corretti && typeof n.luoghi_corretti === 'object' && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(n.luoghi_corretti as Record<string, any>).flatMap(([gruppo, v]) =>
                v && typeof v === 'object'
                  ? Object.entries(v).map(([k, x]) => <span key={`${gruppo}_${k}`} className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 font-bold text-emerald-800">{gruppo} · {k.replace(/_/g, ' ')} {String(x)}</span>)
                  : [<span key={gruppo} className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 font-bold text-emerald-800">{gruppo.replace(/_/g, ' ')} {String(v)}</span>])}
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {PARAMETRI.filter((p) => p.k !== 'voto_generale' && votoDi(n, p.k) !== null).map((p) => (
              <span key={p.k} className="px-2 py-0.5 rounded-full bg-gray-50 border border-gray-100 font-bold">
                {p.nome} <span className={colore(votoDi(n, p.k))}>{fmt(votoDi(n, p.k))}</span>
              </span>
            ))}
          </div>
          {Array.isArray(n.citta) && n.citta.length > 0 && (
            <div className="space-y-1">
              {n.citta.map((c: any, j: number) => (
                <div key={j} className="flex items-baseline justify-between gap-2 pl-2 border-l-2 border-primary/20">
                  <span className="font-bold text-on-surface truncate">{typeof c === 'string' ? c : `${c.citta || ''}${c.giorni ? ` · ${c.giorni} g` : ''}${c.esito ? ` · ${c.esito}` : ''}${c.gravi !== undefined ? ` · ${c.gravi} gravi` : ''}`}</span>
                  {typeof c === 'object' && c?.voti && <span className={`font-black ${colore(votoDi(c, 'voto_generale'))}`}>{fmt(votoDi(c, 'voto_generale'))}</span>}
                </div>
              ))}
            </div>
          )}
          {n.pagella_parti && typeof n.pagella_parti === 'object' && <PartiNotte parti={n.pagella_parti} />}
        </div>
      ))}
    </div>
  );
}
