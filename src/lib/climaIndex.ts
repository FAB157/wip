import { apiFetch, getApiUrl } from './api';
import { getTranslation, type Language } from './i18n';

// =====================================================================
// «Quando conviene venire?» — il periodo migliore per visitare una zona
//
// Fonte: NASA POWER (climatologia mensile 2001-2020, pubblico dominio) via
// /api/meteo/clima, che calcola anche il punteggio di ogni mese per chi
// visita a piedi e, per chi ha l'account, un'analisi scritta dall'AI a
// partire dai SOLI numeri (una volta per cella di 0,5° e lingua, poi in
// cache per tutti). La cella vale per tutta una città: dentro la stessa
// città il clima medio non cambia, cambia il MESE — per questo la scheda
// mostra i dodici mesi e non una mappa di pallini.
//
// Cache localStorage 7 giorni per cella e lingua. Logica pura: niente
// Leaflet, niente React.
// =====================================================================

export interface MeseClima {
  /** 1-12 */
  m: number;
  tmax: number | null;
  tmin: number | null;
  /** mm di pioggia nel mese */
  mm: number | null;
  /** irraggiamento kWh/m²/giorno (1 = grigio, 7 = pieno sole) */
  sole: number | null;
  umidita: number | null;
  /** 0-100, per chi visita a piedi */
  punteggio: number;
}

export interface Periodo { da: number; a: number }

export interface DatiClima {
  mesi: MeseClima[];
  migliori: Periodo[];
  peggiori: Periodo[];
  piuPiovoso: number | null;
  piuCaldo: number | null;
  piuFreddo: number | null;
  /** Ultimi anni contro la media 2001-2020 (null se NASA non li ha dati) */
  tendenza: { anni: { anno: number; deltaT: number; deltaMmPct: number | null }[]; deltaTMedio: number; deltaMmPctMedio: number | null } | null;
  /** Temperatura del mare per mese (null se non c'è mare entro ~30 km); bagno = mesi con acqua ≥ 22° */
  mare: { mesi: { m: number; t: number | null }[]; bagno: number[]; attribuzione: string } | null;
  attribuzione: string;
  analisi: string | null;
  /** true = l'analisi non c'è ancora e la genera solo un utente con account */
  analisiRichiedeAccesso: boolean;
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 30000;

/** Colore del punteggio: verde ottimo, giallo buono, arancio discreto, rosso scarso. */
export function coloreClima(p: number): string {
  if (p >= 75) return '#16a34a';
  if (p >= 60) return '#84cc16';
  if (p >= 45) return '#eab308';
  if (p >= 30) return '#f97316';
  return '#dc2626';
}

export function livelloClima(p: number): string {
  if (p >= 75) return 'ottimo';
  if (p >= 60) return 'buono';
  if (p >= 45) return 'discreto';
  return 'scarso';
}

/** Nome del mese nella lingua dell'app («gen», «Jan», «янв»). */
export function nomeMese(m: number, lingua: string, lungo = false): string {
  try {
    return new Intl.DateTimeFormat(String(lingua || 'it').toLowerCase().slice(0, 2), { month: lungo ? 'long' : 'short' })
      .format(new Date(2000, m - 1, 1)).replace(/\.$/, '');
  } catch { return String(m); }
}

/** «apr–giu, set–ott» */
export function testoPeriodi(periodi: Periodo[], lingua: string): string {
  return periodi.map((p) => (p.da === p.a ? nomeMese(p.da, lingua) : `${nomeMese(p.da, lingua)}–${nomeMese(p.a, lingua)}`)).join(', ');
}

/** Il mese di adesso: dove sta rispetto al periodo migliore. */
export function consiglioMeseCorrente(d: DatiClima, lingua: string): string {
  const l = String(lingua || 'IT').toUpperCase() as Language;
  const m = new Date().getMonth() + 1;
  const mese = d.mesi.find((x) => x.m === m);
  if (!mese) return '';
  const dentro = (p: Periodo) => (p.da <= p.a ? m >= p.da && m <= p.a : m >= p.da || m <= p.a);
  if (d.migliori.some(dentro)) return getTranslation('mp_clima_oggi_migliore', l);
  if (d.peggiori.some(dentro)) return getTranslation('mp_clima_oggi_peggiore', l);
  return getTranslation('mp_clima_oggi_medio', l).replace('{p}', String(mese.punteggio));
}

/**
 * Ore di luce del giorno 15 del mese, per il report («quante ore ho per
 * visitare»). Formula astronomica standard (declinazione solare + angolo
 * orario), precisione di qualche minuto: basta per una tabella mensile.
 */
export function oreLuceMese(lat: number, m: number): number {
  const giorno = Math.round((m - 1) * 30.4 + 15);
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + giorno)) / 365);
  const r = Math.PI / 180;
  const x = -Math.tan(lat * r) * Math.tan(decl * r);
  if (x <= -1) return 24;
  if (x >= 1) return 0;
  return Math.round((2 * Math.acos(x) / r / 15) * 10) / 10;
}

export interface GiornoMeteo { data: string; tmax: number | null; tmin: number | null; mm: number; code: number | null }
export interface ConfrontoAdesso {
  giorni: GiornoMeteo[];
  /** media delle massime dei prossimi giorni meno la massima media del mese */
  deltaTmax: number | null;
  /** pioggia prevista in 7 giorni contro la pioggia media di 7 giorni del mese */
  mmPrevisti: number; mmAttesi: number | null;
  attribuzione: string;
}

/** «Adesso rispetto al solito»: i prossimi 7 giorni (MET Norway) contro la media del mese. */
export async function fetchConfrontoAdesso(lat: number, lon: number, clima: DatiClima): Promise<ConfrontoAdesso | null> {
  try {
    const r = await fetch(getApiUrl(`/api/meteo/punto?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = await r.json();
    const giorni: GiornoMeteo[] = Array.isArray(j?.giorni) ? j.giorni : [];
    if (!giorni.length) return null;
    const mese = clima.mesi.find((x) => x.m === new Date().getMonth() + 1);
    const tmax = giorni.map((g) => g.tmax).filter((v): v is number => v != null);
    const mediaTmax = tmax.length ? tmax.reduce((a, b) => a + b, 0) / tmax.length : null;
    const mmPrevisti = Math.round(giorni.reduce((a, g) => a + (g.mm || 0), 0));
    return {
      giorni,
      deltaTmax: mediaTmax != null && mese?.tmax != null ? Math.round((mediaTmax - mese.tmax) * 10) / 10 : null,
      mmPrevisti,
      mmAttesi: mese?.mm != null ? Math.round((mese.mm / 30) * giorni.length) : null,
      attribuzione: j?.attribuzione || 'MET Norway',
    };
  } catch { return null; }
}

/** Il mese dell'anno migliore/peggiore per una data scelta: per l'avviso nel pianificatore. */
export function giudizioMese(d: DatiClima, m: number): 'migliore' | 'peggiore' | 'medio' {
  const dentro = (p: Periodo) => (p.da <= p.a ? m >= p.da && m <= p.a : m >= p.da || m <= p.a);
  if (d.migliori.some(dentro)) return 'migliore';
  if (d.peggiori.some(dentro)) return 'peggiore';
  return 'medio';
}

/** Posizione del mese nella classifica dei 12 (1 = il migliore). */
export function classificaMese(d: DatiClima, m: number): number {
  return [...d.mesi].sort((a, b) => b.punteggio - a.punteggio).findIndex((x) => x.m === m) + 1;
}

export interface ReportMese {
  citta: string; m: number; classifica: number;
  sezioni: {
    cosa_aspettarsi: string; dal_web: VoceReport[]; esperienze: VoceReport[]; eventi: VoceReport[];
    cosa_portare: string; orari_migliori: string; alternativa: string; conclusioni: string;
  };
  fontiWeb: { url: string; host: string; tier: 'A' | 'B' | 'C' }[];
  generatoIl: string; attribuzione: string;
}

/** La scheda AI di UN mese (modo «Mese»): generata da chi ha l'account, poi in cache per tutti. */
export async function fetchReportMese(lat: number, lon: number, m: number, lingua: string): Promise<{ report: ReportMese | null; errore: 'accesso' | 'non_disponibile' | null }> {
  const lang = String(lingua || 'it').toLowerCase().slice(0, 2);
  const chiave = `wip_clima_mese_${(Math.round(lat * 2) / 2).toFixed(1)}_${(Math.round(lon * 2) / 2).toFixed(1)}_${lang}_${m}`;
  try {
    const raw = localStorage.getItem(chiave);
    if (raw) { const p = JSON.parse(raw); if (p?.report && Date.now() - p.ts < 30 * 24 * 60 * 60 * 1000) return { report: p.report, errore: null }; }
  } catch { /* niente */ }
  try {
    // 240 s: in diretta il server prova Gonka due volte (90 s ciascuna) prima di Groq (25/09/2026).
    const r = await apiFetch(getApiUrl(`/api/meteo/clima/mese?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&lang=${lang}&m=${m}`), undefined, 240000);
    if (r.status === 401) return { report: null, errore: 'accesso' };
    if (!r.ok) return { report: null, errore: 'non_disponibile' };
    const j = await r.json();
    if (!j?.ok || !j.sezioni) return { report: null, errore: 'non_disponibile' };
    const report: ReportMese = { citta: j.citta || '', m: Number(j.m) || m, classifica: Number(j.classifica) || 0,
      sezioni: { dal_web: [], esperienze: [], eventi: [], cosa_aspettarsi: '', cosa_portare: '', orari_migliori: '', alternativa: '', conclusioni: '', ...j.sezioni },
      fontiWeb: j.fontiWeb || [], generatoIl: j.generatoIl || '', attribuzione: j.attribuzione || 'NASA POWER' };
    try { localStorage.setItem(chiave, JSON.stringify({ ts: Date.now(), report })); } catch { /* pieno */ }
    return { report, errore: null };
  } catch { return { report: null, errore: 'non_disponibile' }; }
}

/** Città → coordinate, con la stessa rotta rigorosa del pianificatore (solo località). */
export async function cercaCitta(nome: string, lingua: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const q = String(nome || '').trim();
  if (q.length < 2) return null;
  try {
    const r = await fetch(getApiUrl(`/api/geocode?q=${encodeURIComponent(q)}&limit=1&types=place,locality,region,country&lang=${String(lingua || 'it').toLowerCase()}`), { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    const f = (await r.json())?.features?.[0];
    if (!f || !Number.isFinite(f.lat) || !Number.isFinite(f.lon)) return null;
    return { lat: f.lat, lon: f.lon, label: String(f.name || f.label || q) };
  } catch { return null; }
}

/** Il testo da leggere ad alta voce: panoramica, periodo migliore e conclusioni. */
export function testoDaLeggere(citta: string, r: ReportClima | null, rm: ReportMese | null, lingua: string): string {
  const parti: string[] = [];
  if (rm) {
    parti.push(`${citta} — ${nomeMese(rm.m, lingua, true)}.`, rm.sezioni.cosa_aspettarsi, rm.sezioni.alternativa, rm.sezioni.conclusioni);
  } else if (r) {
    parti.push(`${citta}.`, r.sezioni.panoramica, r.sezioni.periodo_migliore, r.sezioni.conclusioni);
  }
  return parti.filter(Boolean).join(' ');
}

export interface VoceReport { testo: string; fonte: string }
export interface ReportClima {
  citta: string;
  sezioni: {
    panoramica: string;
    periodo_migliore: string;
    dal_web: VoceReport[];
    esperienze: VoceReport[];
    mese_per_mese: { m: number; testo: string }[];
    cosa_portare: string;
    orari_migliori: string;
    avvertenze: string;
    statistiche: { voce: string; valore: string }[];
    /** Il verdetto dell'AI: quando andare, per chi, e l'alternativa */
    conclusioni: string;
  };
  fontiWeb: { url: string; host: string; tier: 'A' | 'B' | 'C' }[];
  generatoIl: string;
  attribuzione: string;
}

/**
 * Il report completo (statistiche + tutto quello che il web dice su quando
 * visitare la città). Lo genera chi ha l'account; poi resta in cache per
 * tutti. Torna { report } oppure { errore: 'accesso' | 'non_disponibile' }.
 */
export async function fetchReportClima(lat: number, lon: number, lingua: string): Promise<{ report: ReportClima | null; errore: 'accesso' | 'non_disponibile' | null }> {
  const lang = String(lingua || 'it').toLowerCase().slice(0, 2);
  const chiave = `wip_clima_report_${(Math.round(lat * 2) / 2).toFixed(1)}_${(Math.round(lon * 2) / 2).toFixed(1)}_${lang}`;
  try {
    const raw = localStorage.getItem(chiave);
    if (raw) { const p = JSON.parse(raw); if (p?.report && Date.now() - p.ts < 30 * 24 * 60 * 60 * 1000) return { report: p.report, errore: null }; }
  } catch { /* niente */ }
  try {
    // Ricerca web + AI: di solito un minuto; in diretta il server prova Gonka due volte (90 s) prima di Groq.
    const r = await apiFetch(getApiUrl(`/api/meteo/clima/report?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&lang=${lang}`), undefined, 240000);
    if (r.status === 401) return { report: null, errore: 'accesso' };
    if (!r.ok) return { report: null, errore: 'non_disponibile' };
    const j = await r.json();
    if (!j?.ok || !j.sezioni) return { report: null, errore: 'non_disponibile' };
    const report: ReportClima = { citta: j.citta || '', sezioni: { dal_web: [], esperienze: [], mese_per_mese: [], statistiche: [], panoramica: '', periodo_migliore: '', cosa_portare: '', orari_migliori: '', avvertenze: '', conclusioni: '', ...j.sezioni }, fontiWeb: j.fontiWeb || [], generatoIl: j.generatoIl || '', attribuzione: j.attribuzione || 'NASA POWER' };
    try { localStorage.setItem(chiave, JSON.stringify({ ts: Date.now(), report })); } catch { /* pieno */ }
    return { report, errore: null };
  } catch { return { report: null, errore: 'non_disponibile' }; }
}

/**
 * `senzaAnalisi`: solo i numeri (righe dell'itinerario, chip della libreria). Si chiama SENZA Bearer,
 * così il server non genera l'analisi AI della cella: servirebbe solo alla scheda del livello Clima.
 */
export async function fetchDatiClima(lat: number, lon: number, lingua: string, senzaAnalisi = false): Promise<DatiClima | null> {
  const lang = String(lingua || 'it').toLowerCase().slice(0, 2);
  const chiave = `wip_clima_${(Math.round(lat * 2) / 2).toFixed(1)}_${(Math.round(lon * 2) / 2).toFixed(1)}_${lang}`;
  try {
    const raw = localStorage.getItem(chiave);
    if (raw) {
      const p = JSON.parse(raw);
      // Una copia senza analisi si riprova: magari nel frattempo qualcuno l'ha generata.
      if (p && typeof p.ts === 'number' && Date.now() - p.ts < CACHE_TTL_MS && p.dati && (senzaAnalisi || p.dati.analisi || !p.dati.analisiRichiedeAccesso)) return p.dati as DatiClima;
    }
  } catch { /* storage non disponibile */ }
  try {
    // apiFetch: mette il Bearer se c'è una sessione, così l'analisi si genera; l'ospite legge la cache.
    const url = getApiUrl(`/api/meteo/clima?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&lang=${lang}`);
    const r = senzaAnalisi
      ? await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      : await apiFetch(url, undefined, FETCH_TIMEOUT_MS);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok || !Array.isArray(j.mesi)) return null;
    const dati: DatiClima = {
      mesi: j.mesi, migliori: j.migliori || [], peggiori: j.peggiori || [],
      piuPiovoso: j.piuPiovoso ?? null, piuCaldo: j.piuCaldo ?? null, piuFreddo: j.piuFreddo ?? null,
      tendenza: j.tendenza && Array.isArray(j.tendenza.anni) ? j.tendenza : null,
      mare: j.mare && Array.isArray(j.mare.mesi) ? j.mare : null,
      attribuzione: j.attribuzione || 'NASA POWER', analisi: j.analisi || null, analisiRichiedeAccesso: !!j.analisiRichiedeAccesso,
    };
    try { localStorage.setItem(chiave, JSON.stringify({ ts: Date.now(), dati })); } catch { /* storage pieno */ }
    return dati;
  } catch { return null; }
}

/** I 7 giorni di MET Norway per un punto (una chiamata, cache 30 minuti per cella di ~11 km). */
const inCorsoPrevisione = new Map<string, Promise<GiornoMeteo[] | null>>();
export function previsioneGiorni(lat: number, lon: number): Promise<GiornoMeteo[] | null> {
  const chiave = `wip_meteo_giorni_${lat.toFixed(1)}_${lon.toFixed(1)}`;
  try {
    const p = JSON.parse(localStorage.getItem(chiave) || 'null');
    if (p && Date.now() - p.ts < 30 * 60 * 1000 && Array.isArray(p.giorni)) return Promise.resolve(p.giorni);
  } catch { /* niente */ }
  const gia = inCorsoPrevisione.get(chiave);
  if (gia) return gia;
  const pr = (async () => {
    const r = await fetch(getApiUrl(`/api/meteo/punto?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = await r.json();
    const giorni: GiornoMeteo[] = Array.isArray(j?.giorni) ? j.giorni : [];
    if (!giorni.length) return null;
    try { localStorage.setItem(chiave, JSON.stringify({ ts: Date.now(), giorni })); } catch { /* pieno */ }
    return giorni;
  })().catch(() => null).finally(() => { inCorsoPrevisione.delete(chiave); });
  inCorsoPrevisione.set(chiave, pr);
  return pr;
}

/** Icona dal codice WMO (quelli che /api/meteo/punto produce dai simboli MET). */
export function iconaMeteo(code: number | null | undefined): string {
  if (code == null) return '🌤';
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤';
  if (code === 3) return '☁️';
  if (code === 45) return '🌫';
  if (code >= 95) return '⛈';
  if (code >= 71 && code <= 77) return '🌨';
  if (code >= 51) return '🌧';
  return '🌤';
}

/** Codice WMO di pioggia (pioviggine, pioggia, rovesci, temporali). */
export function codicePioggia(code: number | null | undefined): boolean {
  return code != null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95);
}

/** Consiglio per un giorno di PREVISIONE (soglie giornaliere: mm ≥ 3, max ≥ 30, max ≤ 6). */
export function consiglioPrevisione(g: GiornoMeteo | undefined | null): 'mp_clima_consiglio_pioggia_giorno' | 'mp_clima_consiglio_caldo' | 'mp_clima_consiglio_freddo' | null {
  if (!g) return null;
  if ((g.mm || 0) >= 3) return 'mp_clima_consiglio_pioggia_giorno';
  if (g.tmax != null && g.tmax >= 30) return 'mp_clima_consiglio_caldo';
  if (g.tmax != null && g.tmax <= 6) return 'mp_clima_consiglio_freddo';
  return null;
}

/** Il consiglio più rilevante per un mese, calcolato dai numeri (niente AI): chiave di traduzione o null. */
export function consiglioMese(x: MeseClima | undefined | null): 'mp_clima_consiglio_pioggia' | 'mp_clima_consiglio_caldo' | 'mp_clima_consiglio_freddo' | null {
  if (!x) return null;
  if (x.mm != null && x.mm >= 100) return 'mp_clima_consiglio_pioggia';
  if (x.tmax != null && x.tmax >= 30) return 'mp_clima_consiglio_caldo';
  if (x.tmax != null && x.tmax <= 6) return 'mp_clima_consiglio_freddo';
  return null;
}

// ── «Periodo migliore» per città (chip della libreria) ──────────────────
// Le righe della libreria hanno solo città e paese: geocodifica + clima, al
// massimo 3 richieste insieme, poi cache per città 30 giorni.
const PERIODO_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const inCorsoPeriodo = new Map<string, Promise<Periodo[] | null>>();
let attivePeriodo = 0;
const codaPeriodo: Array<() => void> = [];
async function conPosto<T>(fn: () => Promise<T>): Promise<T> {
  if (attivePeriodo >= 3) await new Promise<void>((r) => codaPeriodo.push(r));
  attivePeriodo++;
  try { return await fn(); } finally { attivePeriodo--; codaPeriodo.shift()?.(); }
}

export function periodoMiglioreCitta(citta: string, paese: string | undefined, lingua: string, coords?: { lat: number; lon: number } | null): Promise<Periodo[] | null> {
  const nome = [citta, paese].map((s) => String(s || '').trim()).filter(Boolean).join(', ');
  if (!nome && !coords) return Promise.resolve(null);
  const chiave = `wip_clima_periodo_${coords ? `${(Math.round(coords.lat * 2) / 2).toFixed(1)}_${(Math.round(coords.lon * 2) / 2).toFixed(1)}` : nome.toLowerCase()}`;
  try {
    const p = JSON.parse(localStorage.getItem(chiave) || 'null');
    if (p && Date.now() - p.ts < PERIODO_TTL_MS) return Promise.resolve(Array.isArray(p.migliori) ? p.migliori : null);
  } catch { /* niente */ }
  const gia = inCorsoPeriodo.get(chiave);
  if (gia) return gia;
  const pr = conPosto(async () => {
    const c = coords || await cercaCitta(nome, lingua);
    if (!c) return null;
    const d = await fetchDatiClima(c.lat, c.lon, lingua, true);
    if (!d) return null;
    try { localStorage.setItem(chiave, JSON.stringify({ ts: Date.now(), migliori: d.migliori })); } catch { /* pieno */ }
    return d.migliori;
  }).catch(() => null).finally(() => { inCorsoPeriodo.delete(chiave); });
  inCorsoPeriodo.set(chiave, pr);
  return pr;
}
