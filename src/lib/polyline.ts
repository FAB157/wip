// =====================================================================
// POLYLINE — il formato in cui teniamo i tracciati dei percorsi
// =====================================================================
//
// I tracciati (cammini, sentieri, strade del vino) stanno nella tabella
// `route_geometries` come polyline Google precisione 5: lo stesso formato
// che parla OSRM, ~5 byte a punto invece dei ~20 di un array JSON. Su
// 30.000 percorsi la differenza e' fra 15 MB e 60 MB di database.
//
// Un percorso puo' avere PIU' SEGMENTI, separati da ';'. Non e' un
// vezzo: una relazione OSM torna come raccolta di tratti che NON sono in
// ordine, e unirli in una linea sola disegna zigzag attraverso mezza
// valle. Meglio tante linee separate che una sbagliata.
// Il ';' non compare mai in una polyline: l'alfabeto va da '?' (63) a
// '~' (126).
// =====================================================================

/** Un singolo tratto codificato → [[lat, lon], …]. */
export function decodePolyline(codificata: string): [number, number][] {
  const punti: [number, number][] = [];
  let i = 0, lat = 0, lon = 0;
  while (i < codificata.length) {
    let risultato = 0, spostamento = 0, byte = 0;
    do {
      byte = codificata.charCodeAt(i++) - 63;
      risultato |= (byte & 0x1f) << spostamento;
      spostamento += 5;
    } while (byte >= 0x20 && i < codificata.length);
    lat += risultato & 1 ? ~(risultato >> 1) : risultato >> 1;

    risultato = 0; spostamento = 0;
    do {
      byte = codificata.charCodeAt(i++) - 63;
      risultato |= (byte & 0x1f) << spostamento;
      spostamento += 5;
    } while (byte >= 0x20 && i < codificata.length);
    lon += risultato & 1 ? ~(risultato >> 1) : risultato >> 1;

    punti.push([lat / 1e5, lon / 1e5]);
  }
  return punti;
}

/** La colonna `line` intera: uno o piu' tratti separati da ';'. */
export function decodeSegments(line: string): [number, number][][] {
  if (!line) return [];
  return line.split(';').map(decodePolyline).filter((s) => s.length >= 2);
}
