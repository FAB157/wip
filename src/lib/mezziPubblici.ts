/**
 * MEZZI PUBBLICI SULLE TRATTE LUNGHE (06/10/2026, committente: «Punto 1 ok»
 * + «una legenda che spiega ciò che dice il tasto»).
 *
 * Lisbona 2 giorni: una tratta di 3,8 km a piedi fra il centro e i Jerónimos.
 * L'itinerario e il giro dicevano solo «🚶 48 min · taxi ~9€». Qui si aggiunge
 * un tasto «Mezzi» che apre Google Maps in modalità trasporto pubblico fra la
 * tappa e la successiva: linea, fermata dove salire e scendere, orari — in
 * tutto il mondo, gratis, senza chiavi. WIP non scrive niente da sé (nessuna
 * linea inventata): il dato lo dà Google, noi apriamo la domanda giusta.
 *
 * Soglia: da 1,5 km di strada in su. Sotto, a piedi si fa prima.
 */
export const SOGLIA_MEZZI_M = 1500;

export function linkMezzi(da: { lat: number; lon: number }, a: { lat: number; lon: number }): string | null {
  const ok = (p: any) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat !== 0;
  if (!ok(da) || !ok(a)) return null;
  const f = (n: number) => n.toFixed(6);
  return `https://www.google.com/maps/dir/?api=1&origin=${f(da.lat)},${f(da.lon)}&destination=${f(a.lat)},${f(a.lon)}&travelmode=transit`;
}

export function trattaLunga(metri: number | null | undefined): boolean {
  return metri != null && Number.isFinite(metri) && metri >= SOGLIA_MEZZI_M;
}
