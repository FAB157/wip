// Nome da mostrare/leggere per un POI: se `name` è in uno script non latino
// (cinese, giapponese, coreano, russo, arabo, thai...) e /api/poi/enrich ha
// già prodotto una traduzione/traslitterazione per la lingua corrente, la
// usa; altrimenti torna al nome originale (mai sostituito, solo aggiunto).

// (09/10/2026, San Pietroburgo: «А. А. Рылову», «in cirillico non si capisce») Mappa e liste arrivano da RPC a
// colonne fisse e NON portano `name_translated`: lo porta /api/poi/details. Fumetto e scheda lo ricordano qui
// quando leggono i dettagli, e displayName lo trova anche se l'oggetto del POI non ce l'ha.
const nomiRicordati = new Map<string, Record<string, string>>();
export function ricordaNomeTradotto(id: unknown, nomi: unknown): void {
  if (id == null || !nomi || typeof nomi !== 'object') return;
  if (nomiRicordati.size > 600) nomiRicordati.clear();
  nomiRicordati.set(String(id), nomi as Record<string, string>);
}

/**
 * REGOLA 23/10/2026 (ricollaudo Lugano: «Kirche Santa Maria degli Angioli» letto e mostrato a un italiano). Un nome
 * che COMINCIA con una parola di tipo di un'altra lingua (Kirche, Church, Église, Iglesia…) non si legge così a chi
 * usa un'altra lingua: prima name_translated nella sua lingua, poi il nome dell'itinerario (`alternativa`, il titolo
 * del modello), altrimenti la sola parola di tipo tradotta («Chiesa Santa Maria degli Angioli»).
 */
const TIPI_INIZIALI: Array<{ re: RegExp; lingua: string; tipo: Record<string, string> }> = [
  { re: /^(kirche|church|église|eglise|iglesia|chiesa|igreja|kerk)\s+/i, lingua: '', tipo: { it: 'Chiesa', en: 'Church', fr: 'Église', es: 'Iglesia', de: 'Kirche' } },
  { re: /^(kathedrale|cathedral|cathédrale|cathedrale|catedral|cattedrale|dom)\s+/i, lingua: '', tipo: { it: 'Cattedrale', en: 'Cathedral', fr: 'Cathédrale', es: 'Catedral', de: 'Kathedrale' } },
  { re: /^(kapelle|chapel|chapelle|capilla|cappella)\s+/i, lingua: '', tipo: { it: 'Cappella', en: 'Chapel', fr: 'Chapelle', es: 'Capilla', de: 'Kapelle' } },
  { re: /^(basilika|basilica|basilique|basílica)\s+/i, lingua: '', tipo: { it: 'Basilica', en: 'Basilica', fr: 'Basilique', es: 'Basílica', de: 'Basilika' } },
  { re: /^(museum|musée|musee|museo)\s+/i, lingua: '', tipo: { it: 'Museo', en: 'Museum', fr: 'Musée', es: 'Museo', de: 'Museum' } },
  { re: /^(schloss|castle|château|chateau|castillo|castello)\s+/i, lingua: '', tipo: { it: 'Castello', en: 'Castle', fr: 'Château', es: 'Castillo', de: 'Schloss' } },
];
const LINGUA_DEL_TIPO: Record<string, string> = {
  kirche: 'de', kathedrale: 'de', dom: 'de', kapelle: 'de', basilika: 'de', schloss: 'de', museum: 'en|de',
  church: 'en', cathedral: 'en', chapel: 'en', castle: 'en',
  'église': 'fr', eglise: 'fr', 'cathédrale': 'fr', cathedrale: 'fr', chapelle: 'fr', basilique: 'fr', 'musée': 'fr', musee: 'fr', 'château': 'fr', chateau: 'fr',
  iglesia: 'es', catedral: 'es', capilla: 'es', 'basílica': 'es', castillo: 'es', museo: 'it|es',
  chiesa: 'it', cattedrale: 'it', cappella: 'it', basilica: 'it|en', castello: 'it', igreja: 'pt', kerk: 'nl',
};
/** La parola di tipo iniziale è in una lingua diversa da quella dell'utente? Restituisce la regola che l'ha presa. */
export function tipoInizialeStraniero(nome: string, lang: string): { re: RegExp; tipo: Record<string, string> } | null {
  const key = String(lang || 'it').toLowerCase().slice(0, 2);
  const s = String(nome || '').trim();
  for (const r of TIPI_INIZIALI) {
    const m = s.match(r.re);
    if (!m) continue;
    const lingue = (LINGUA_DEL_TIPO[m[1].toLowerCase()] || '').split('|');
    return lingue.includes(key) ? null : r;
  }
  return null;
}
export function nomeNellaLinguaUtente(nome: string, lang: string, alternativa?: string | null): string {
  const r = tipoInizialeStraniero(nome, lang);
  if (!r) return nome;
  const alt = String(alternativa || '').trim();
  if (alt && !tipoInizialeStraniero(alt, lang)) return alt;
  const key = String(lang || 'it').toLowerCase().slice(0, 2);
  const parola = r.tipo[key];
  if (!parola) return nome;
  // Solo la parola di tipo si traduce, e solo se il resto del nome non è anch'esso nella lingua straniera
  // («Museum of Modern Art» resta com'è: «Museo of Modern Art» sarebbe peggio).
  const resto = String(nome).trim().replace(r.re, '');
  if (/\b(of|the|and|der|die|das|des|von|und|für|zum|zur|du|aux|et|sainte?|de los|de las|y)\b/i.test(resto)) return nome;
  return `${parola} ${resto}`;
}

/** REGOLA 23/10/2026: stesso luogo per nome — ogni parola propria del nome più corto sta nell'altro (cercaGemelloConFonte). */
export function nomiStessoLuogo(a: string, b: string): boolean {
  const parole = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^(del|della|dei|degli|delle|dal|the|and|des|von|der|die|das)$/.test(w));
  const A = parole(a), B = parole(b);
  if (!A.length || !B.length) return false;
  const [corto, lungo] = A.length <= B.length ? [A, new Set(B)] : [B, new Set(A)];
  return corto.every(w => lungo.has(w));
}

export function displayName(
  poi: { id?: unknown; name?: string | null; name_translated?: Record<string, string> | null } | null | undefined,
  lang: string,
  alternativa?: string | null,
): string {
  const name = poi?.name || '';
  const key = String(lang || 'it').toLowerCase().slice(0, 2);
  const nomi = poi?.name_translated || (poi?.id != null ? nomiRicordati.get(String(poi.id)) : undefined);
  // Lingua dell'utente; se manca, l'inglese vale solo quando il nome originale non è in caratteri latini.
  const tradotto = nomi?.[key] || (/[^\u0000-ɏḀ-ỿ]/.test(name) ? nomi?.en : undefined);
  if (tradotto && tradotto.trim()) return tradotto;
  return nomeNellaLinguaUtente(name, lang, alternativa);
}

/**
 * 23/10/2026 — REGOLA: un POI che arriva da un evento (`wip-poi-trigger`, `focus-poi`) può essere MINIMO:
 * { id, name, lat, lon } — è la forma del giro (App.tsx, riascoltaTappa; giroDriver; TourRouteLayer). Collaudo
 * 7 città: la pagina andava in «Qualcosa è andato storto». Ogni ricevitore lo passa da qui: campi stringa
 * sempre stringhe, coordinate numeri, oggetti annidati presenti. I campi veri, se ci sono, restano.
 */
export function normalizzaPoiMinimo<T extends Record<string, any>>(p: T | null | undefined): T & { id: string; name: string; lat: number; lon: number; category: string } {
  const o: any = { ...(p || {}) };
  o.id = String(o.id ?? o.poiId ?? '');
  o.name = String(o.name ?? o.nome ?? o.title ?? '');
  o.lat = Number(o.lat ?? o.latitude);
  o.lon = Number(o.lon ?? o.lng ?? o.longitude);
  o.category = String(o.category ?? o.categoria ?? '');
  if (o.tags == null || typeof o.tags !== 'object') o.tags = {};
  for (const k of ['description', 'description_short', 'description_long'] as const) {
    if (o[k] != null && typeof o[k] !== 'string') o[k] = String(o[k]);
  }
  return o;
}

/** True se il POI è nella forma minima del giro (solo id/nome/coordinate): conviene rileggerlo dal repository. */
export function ePoiMinimo(p: any): boolean {
  if (!p) return true;
  return !p.description && !p.description_short && !p.description_long && !p.image_url && !p.photo_url && !p.source && !p.status;
}
