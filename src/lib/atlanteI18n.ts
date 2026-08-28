/**
 * LE VOCI DELL'ATLANTE NELLA LINGUA DI CHI LEGGE.
 * ==============================================
 * I beni vincolati (tabella `beni_culturali`, 1,78 milioni) arrivano dai
 * registri nazionali e parlano la lingua del registro: "battistero" in Italia,
 * "Grade II listed building" in Inghilterra, "monument historique" in Francia.
 * Chi apre la scheda a Londra o a Ravenna leggeva la lingua dell'altro.
 *
 * Qui si traducono SOLO le stringhe brevi e descrittive — tipologia e
 * descrizione del registro — mai il nome proprio del bene, che resta com'e'
 * (regola dei nomi geografici, la stessa di poiNameI18n).
 *
 * Tre livelli di cache, dal piu' vicino:
 *   1. `memoria`  — la sessione corrente, per non richiedere due volte;
 *   2. localStorage — sopravvive al ricaricamento, tetto di 500 voci;
 *   3. api_cache lato server, per testo: le tipologie sono poche centinaia
 *      ripetute su milioni di righe, quindi il traduttore AI si paga una volta
 *      sola per tutti gli utenti.
 *
 * Fallisce in silenzio: senza rete, senza chiave AI o con una risposta strana
 * si tiene l'originale. Una voce non tradotta e' leggibile; uno spazio vuoto no.
 */
import { getApiUrl, apiFetch } from './api';

const CHIAVE_LS = 'wip_atlante_i18n';
const MAX_VOCI = 500;

const memoria = new Map<string, string>();
let caricato = false;

function chiave(lang: string, testo: string): string {
  return `${lang}|${testo.toLowerCase()}`;
}

function caricaDaLocalStorage(): void {
  if (caricato) return;
  caricato = true;
  try {
    const grezzo = JSON.parse(localStorage.getItem(CHIAVE_LS) || '{}');
    for (const [k, v] of Object.entries(grezzo)) {
      if (typeof v === 'string') memoria.set(k, v);
    }
  } catch { /* cache illeggibile: si riparte da zero */ }
}

function salvaSuLocalStorage(): void {
  try {
    // Le piu' recenti in coda: si buttano le piu' vecchie quando si sfora.
    const voci = [...memoria.entries()].slice(-MAX_VOCI);
    localStorage.setItem(CHIAVE_LS, JSON.stringify(Object.fromEntries(voci)));
  } catch { /* quota piena o modalita' privata: pazienza */ }
}

/** La traduzione gia' nota, senza rete. `null` se non c'e'. */
export function tradotto(lang: string, testo: string): string | null {
  caricaDaLocalStorage();
  return memoria.get(chiave(lang.toLowerCase().slice(0, 2), testo)) || null;
}

/**
 * Traduce le voci indicate. Restituisce la mappa originale → tradotto per
 * quelle andate a buon fine (le altre semplicemente non ci sono).
 */
export async function traduciVoci(lang: string, voci: string[]): Promise<Record<string, string>> {
  const l = String(lang || '').toLowerCase().slice(0, 2);
  caricaDaLocalStorage();
  const puliti = [...new Set(voci.map(v => String(v || '').trim()).filter(v => v.length >= 2))];
  const fuori: Record<string, string> = {};
  const mancanti: string[] = [];
  for (const v of puliti) {
    const hit = memoria.get(chiave(l, v));
    if (hit) fuori[v] = hit; else mancanti.push(v);
  }
  if (!mancanti.length) return fuori;

  try {
    // apiFetch: Bearer automatico (all'anonimo la rotta risponde degradata).
    const r = await apiFetch(getApiUrl('/api/atlante/traduci'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang: l, testi: mancanti.slice(0, 40) }),
    }, 30000);
    if (!r.ok) return fuori;
    const j = await r.json();
    for (const [o, t] of Object.entries(j?.testi || {})) {
      if (typeof t !== 'string' || !t.trim()) continue;
      memoria.set(chiave(l, o), t);
      fuori[o] = t;
    }
    salvaSuLocalStorage();
  } catch { /* offline: si tiene l'originale */ }
  return fuori;
}
