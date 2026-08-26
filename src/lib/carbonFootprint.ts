// ── Impronta CO₂ del viaggio ─────────────────────────────────────────────
// Fattori di emissione MEDI per passeggero-km, arrotondati sui valori medi
// europei pubblicati dall'EEA (European Environment Agency, "Transport and
// environment report" — emissioni medie per modo di trasporto in Europa).
// Sono medie di flotta/occupazione, non misure del veicolo specifico: il
// dato mostrato è un ordine di grandezza informativo (🍃), mai un conteggio
// esatto né un giudizio.
//
//   auto   ~120 g CO₂/km  (auto media europea, occupazione media)
//   treno   ~30 g CO₂/km  (media ferrovia europea per passeggero)
//   bus     ~70 g CO₂/km  (autobus/pullman per passeggero)
//   aereo  ~250 g CO₂/km  (corto raggio, per passeggero)
//   piedi/bici 0 g CO₂/km

export type TransportMode = 'car' | 'train' | 'bus' | 'plane' | 'walk' | 'bike';

/** g CO₂ per passeggero-km (medie europee EEA, vedi commento in testa). */
export const EMISSION_FACTORS_G_PER_KM: Record<TransportMode, number> = {
  car: 120,
  train: 30,
  bus: 70,
  plane: 250,
  walk: 0,
  bike: 0,
};

/**
 * Grammi di CO₂ per una tratta di `km` chilometri nel modo indicato.
 * Restituisce null se i km non sono un numero sensato (niente dato = niente UI).
 */
export function gramsForLeg(mode: TransportMode, km: number): number | null {
  if (!Number.isFinite(km) || km <= 0) return null;
  return km * EMISSION_FACTORS_G_PER_KM[mode];
}

/**
 * Formatta i grammi in modo leggibile: "96 g" sotto il chilo, "1,4 kg" sopra
 * (virgola decimale, coerente col resto della UI; ",0" viene omesso).
 */
export function formatCo2(grams: number): string {
  if (!Number.isFinite(grams) || grams < 0) return '';
  if (grams < 1000) return `${Math.round(grams)} g`;
  const kg = grams / 1000;
  // Una cifra decimale fino a 100 kg, poi solo interi (la precisione sarebbe finta)
  const s = kg >= 100 ? String(Math.round(kg)) : kg.toFixed(1).replace(/\.0$/, '');
  return `${s.replace('.', ',')} kg`;
}

/**
 * Totale (in grammi) di una lista di tratte — pensato per un riepilogo
 * giornaliero. AGGANCIO FUTURO: il punto naturale per mostrarlo è il footer
 * del giorno in PlanScreen (fuori dal perimetro di questa modifica); la
 * funzione è già pronta: dayTotal(Object.values(dayLegs[gIdx]).map(l =>
 * ({ mode: 'car', km: l.km }))).
 */
export function dayTotal(legs: Array<{ mode: TransportMode; km: number }>): number {
  return legs.reduce((sum, l) => {
    const g = gramsForLeg(l.mode, l.km);
    return sum + (g ?? 0);
  }, 0);
}

/**
 * Estrae i km da un testo libero (es. l'attività di una tappa "trasferimento"
 * roadtrip: "…SS1 Aurelia, ~250 km…"). Il prompt server impone i km nel testo
 * ma non un campo strutturato, quindi si va di regex. Con più occorrenze si
 * prende la MAGGIORE (di solito il totale della tratta; le minori sono soste
 * intermedie). Restituisce null se non trova nulla di plausibile.
 */
export function extractKmFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  // Numero con eventuale separatore delle migliaia ("1.200 km", "1,200 km",
  // "1 200 km") o decimale ("12,5 km", "12.5 km"); prima "1.200 km" veniva
  // letto come 1,2 km.
  const matches = String(text).match(/\d{1,3}(?:[.,\s ]\d{3})+(?:[.,]\d{1,2})?\s*km\b|\d{1,4}(?:[.,]\d{1,2})?\s*km\b/gi);
  if (!matches) return null;
  let best: number | null = null;
  for (const m of matches) {
    const km = parseKmNumber(m);
    // 1–2000 km: sotto è rumore ("0,3 km dal parcheggio"), sopra è un errore
    if (km !== null && km >= 1 && km <= 2000 && (best === null || km > best)) best = km;
  }
  return best;
}

/** "1.200", "1,200", "1 200", "12,5", "12.5" → numero; null se illeggibile. */
function parseKmNumber(raw: string): number | null {
  let s = raw.replace(/km/i, '').trim();
  // Gruppi di tre cifre dopo un separatore = migliaia ("1.200", "1,200", "1 200")
  if (/^\d{1,3}(?:[.,\s ]\d{3})+(?:[.,]\d{1,2})?$/.test(s)) {
    const dec = s.match(/[.,](\d{1,2})$/);
    const intPart = (dec ? s.slice(0, s.length - dec[0].length) : s).replace(/[.,\s ]/g, '');
    s = dec ? `${intPart}.${dec[1]}` : intPart;
  } else {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
