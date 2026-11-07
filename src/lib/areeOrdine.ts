// =====================================================================
// REGOLA PER OGNI LIVELLO AD AREE (committente, 10/10/2026: «deve essere
// regola per tutte le aree»): le aree si disegnano DALLA PIÙ GRANDE ALLA
// PIÙ PICCOLA. Leaflet mette sopra l'ultima disegnata e il tocco va al
// poligono più in alto: con l'ordine inverso il Basilico Genovese DOP
// (5.429 km², tutta la Liguria) copriva i Colli di Luni (14 km²) e prendeva
// ogni tocco. Vale per denominazioni, aree protette, ZTL e per ogni livello
// nuovo: una grande area è una campitura di sfondo, la piccola deve restare
// toccabile.
// =====================================================================

/** Ordina dalla più grande alla più piccola; chi non ha misura va per primo (sfondo). */
export function ordinaAreeGrandiPrima<T>(aree: T[], kmq: (a: T) => number | null | undefined): T[] {
  return [...aree].sort((x, y) => {
    const kx = Number(kmq(x)), ky = Number(kmq(y));
    return (Number.isFinite(ky) ? ky : Infinity) - (Number.isFinite(kx) ? kx : Infinity);
  });
}

/** Area approssimata in km² di un anello [lat, lon][] (Gauss, basta per ordinare). */
export function kmqAnello(ring: Array<[number, number]> | Array<{ lat: number; lng: number }>): number {
  const pts = ring.map((p: any) => Array.isArray(p) ? { lat: p[0], lon: p[1] } : { lat: p.lat, lon: p.lng });
  if (pts.length < 3) return 0;
  const latMedia = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const kx = 111.32 * Math.cos(latMedia * Math.PI / 180), ky = 110.57;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += (p.lon * kx) * (q.lat * ky) - (q.lon * kx) * (p.lat * ky);
  }
  return Math.abs(a) / 2;
}
