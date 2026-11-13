/**
 * I GUSTI SULLE OPERE (23/09/2026, widget «Confronto opere»).
 *
 * Il widget mostra due opere ascoltate oggi e chiede «quale ti è piaciuta di
 * più?». Il tocco apre l'app con `itainta://widget/voto/<vince>/<perde>` e
 * il voto finisce qui: solo in locale (niente tabella, niente server), anche
 * per gli ospiti. `profiloGusti()` è la base per usi futuri (suggerire la
 * prossima opera, ordinare una visita): in questo lavoro nessuna UI lo legge.
 */

/** Un'opera ascoltata, com'è scritta nel registro del widget (wip_widget_opere_oggi). */
export type OperaAscoltata = {
  k: string;
  venueKey: string;
  museo: string;
  nome: string;
  nomeFonte?: string;
  autore?: string;
  anno?: string;
  tipo?: string;
  foto?: string;
  ts: number;
};

export type VotoOpera = {
  vince: string;
  perde: string;
  venueKey: string;
  giorno: string;
  ts: number;
  /** Tratti della vincitrice e della perdente, per il profilo senza dover rileggere il registro (che si azzera ogni giorno). */
  a?: { autore?: string; tipo?: string; anno?: string };
  b?: { autore?: string; tipo?: string; anno?: string };
};

const CHIAVE_VOTI = 'wip_voti_opere';
const MASSIMO_VOTI = 300;
export const VOTO_OPERA_EVENT = 'wip-voto-opera';

/** Giorno locale AAAA-MM-GG (non UTC: «oggi» è quello dell'orologio del telefono). */
export function giornoLocale(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Chiave della coppia, indipendente dall'ordine: min(k)|max(k). */
export const chiaveCoppia = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function leggiVoti(): VotoOpera[] {
  try {
    const raw = localStorage.getItem(CHIAVE_VOTI);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

/** Le coppie già votate, per non riproporle nel widget. */
export function coppieVotate(): Set<string> {
  return new Set(leggiVoti().map(v => chiaveCoppia(v.vince, v.perde)));
}

const tratti = (o: OperaAscoltata) => ({ autore: o.autore || '', tipo: o.tipo || '', anno: o.anno || '' });

/** Registra un voto (FIFO, al massimo 300) ed emette `wip-voto-opera`. */
export function registraVoto(vince: OperaAscoltata, perde: OperaAscoltata): boolean {
  if (!vince?.k || !perde?.k || vince.k === perde.k) return false;
  try {
    const voti = leggiVoti().filter(v => chiaveCoppia(v.vince, v.perde) !== chiaveCoppia(vince.k, perde.k));
    voti.push({ vince: vince.k, perde: perde.k, venueKey: vince.venueKey || perde.venueKey || '', giorno: giornoLocale(), ts: Date.now(), a: tratti(vince), b: tratti(perde) });
    localStorage.setItem(CHIAVE_VOTI, JSON.stringify(voti.slice(-MASSIMO_VOTI)));
  } catch { return false; }
  try { window.dispatchEvent(new CustomEvent(VOTO_OPERA_EVENT, { detail: { vince: vince.k, perde: perde.k } })); } catch { /* niente */ }
  return true;
}

/** Secolo da un anno scritto come capita («1503», «c. 1500», «XV secolo», «1503-1506»). */
function secoloDi(anno?: string): string {
  const s = String(anno || '');
  const m = /(\d{3,4})/.exec(s);
  if (m) { const n = Number(m[1]); if (n > 0) return String(Math.floor((n - 1) / 100) + 1); }
  const r = /\b([IVXL]+)\b/.exec(s.toUpperCase());
  return r ? r[1] : '';
}

export type ProfiloGusti = {
  voti: number;
  autori: Record<string, number>;
  tipi: Record<string, number>;
  secoli: Record<string, number>;
};

/** Conteggio delle vittorie per autore, tipo di opera e secolo. */
export function profiloGusti(): ProfiloGusti {
  const p: ProfiloGusti = { voti: 0, autori: {}, tipi: {}, secoli: {} };
  const piu = (m: Record<string, number>, k?: string) => { const c = String(k || '').trim(); if (c) m[c] = (m[c] || 0) + 1; };
  for (const v of leggiVoti()) {
    p.voti++;
    piu(p.autori, v.a?.autore);
    piu(p.tipi, v.a?.tipo);
    piu(p.secoli, secoloDi(v.a?.anno));
  }
  return p;
}
