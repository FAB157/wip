// =====================================================================
// ALBA, TRAMONTO E ORA D'ORO — calcolati in locale, senza API
//
// È l'unica fonte di tutta la mappa che non dipende da nessun servizio:
// niente chiavi, niente licenze, niente limiti di chiamate, e soprattutto
// FUNZIONA OFFLINE. Per un'app che si usa camminando, con la rete che va
// e viene, è una differenza che si sente.
//
// Algoritmo solare NOAA nella forma compatta di SunCalc: posizione del
// Sole dalla data giuliana, poi l'ora in cui raggiunge una data elevazione.
// Precisione attorno al minuto, più che sufficiente — nessuno programma
// una foto al secondo.
//
// Elevazioni usate:
//   -0.833°  alba e tramonto (bordo superiore del disco + rifrazione)
//    6°      ora d'oro: luce calda e radente, la migliore per fotografare
//   -4°      ora blu: dopo il tramonto, cielo profondo e luci accese
//   -6°      crepuscolo civile: da qui in poi serve luce artificiale
// =====================================================================

import tzLookup from 'tz-lookup';

const rad = Math.PI / 180;
const giornoMs = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const obliquita = rad * 23.4397; // inclinazione dell'asse terrestre
const J0 = 0.0009;

const aGiuliana = (d: Date) => d.valueOf() / giornoMs - 0.5 + J1970;
const daGiuliana = (j: number) => new Date((j + 0.5 - J1970) * giornoMs);
const aGiorni = (d: Date) => aGiuliana(d) - J2000;

const anomaliaMedia = (d: number) => rad * (357.5291 + 0.98560028 * d);
const longitudineEclittica = (M: number) => {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372; // perielio terrestre
  return M + C + P + Math.PI;
};
const declinazione = (L: number) => Math.asin(Math.sin(obliquita) * Math.sin(L));

const transitoSolare = (ds: number, M: number, L: number) =>
  J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const angoloOrario = (h: number, phi: number, dec: number) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

export interface OrariSole {
  alba: Date | null;
  tramonto: Date | null;
  /** Fine dell'ora d'oro del mattino */
  oraOroMattinoFine: Date | null;
  /** Inizio dell'ora d'oro della sera: il momento da non perdere */
  oraOroSeraInizio: Date | null;
  /** Fine dell'ora blu (crepuscolo civile) */
  oraBluFine: Date | null;
  mezzogiornoSolare: Date | null;
  /** Ore di luce, in formato "13h 42m" */
  durataLuce: string | null;
  /** true nelle notti/giorni polari, dove alba e tramonto non esistono */
  sempreGiorno: boolean;
  sempreNotte: boolean;
}

/**
 * Orari del Sole per un punto e un giorno.
 * Alle latitudini estreme alba e tramonto possono non esistere: invece di
 * restituire NaN travestiti da orari, si dichiara giorno o notte polare.
 */
export function orariSole(lat: number, lon: number, quando: Date = new Date()): OrariSole {
  const lw = rad * -lon;
  const phi = rad * lat;
  const d = aGiorni(quando);

  const n = Math.round(d - J0 - lw / (2 * Math.PI));
  const ds = J0 + (0 + lw) / (2 * Math.PI) + n;
  const M = anomaliaMedia(ds);
  const L = longitudineEclittica(M);
  const dec = declinazione(L);
  const Jnoon = transitoSolare(ds, M, L);

  const momento = (elevazione: number): { salita: Date | null; discesa: Date | null } => {
    const h = elevazione * rad;
    const coseno = (Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    // Fuori dall'intervallo [-1,1] il Sole non raggiunge mai quell'altezza:
    // è il caso del sole di mezzanotte e della notte polare.
    if (coseno > 1 || coseno < -1) return { salita: null, discesa: null };
    const w = angoloOrario(h, phi, dec);
    const a = J0 + (w + lw) / (2 * Math.PI) + n;
    const Jset = transitoSolare(a, M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    return { salita: daGiuliana(Jrise), discesa: daGiuliana(Jset) };
  };

  const solare = momento(-0.833);
  const oro = momento(6);
  const blu = momento(-4);

  let durataLuce: string | null = null;
  if (solare.salita && solare.discesa) {
    const minuti = Math.round((solare.discesa.getTime() - solare.salita.getTime()) / 60000);
    durataLuce = `${Math.floor(minuti / 60)}h ${String(minuti % 60).padStart(2, '0')}m`;
  }

  // Senza alba né tramonto: il Sole resta sopra o sotto l'orizzonte tutto il
  // giorno. Si distingue guardando dove sta a mezzogiorno.
  const altezzaMezzogiorno = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec)) / rad;
  const senzaOrari = !solare.salita;

  return {
    alba: solare.salita,
    tramonto: solare.discesa,
    oraOroMattinoFine: oro.salita,
    oraOroSeraInizio: oro.discesa,
    oraBluFine: blu.discesa,
    mezzogiornoSolare: daGiuliana(Jnoon),
    durataLuce,
    sempreGiorno: senzaOrari && altezzaMezzogiorno > 0,
    sempreNotte: senzaOrari && altezzaMezzogiorno <= 0,
  };
}

/** "20:14" nel fuso del dispositivo; stringa vuota se l'orario non esiste. */
/**
 * Il fuso orario IANA del punto (es. "America/New_York"), da tz-lookup:
 * tabella dei confini compressa nel bundle, nessuna chiamata, offline.
 * Null se la libreria non riconosce il punto (oceano aperto) o se il
 * browser non conosce quel fuso.
 */
export function fusoDelPunto(lat: number, lon: number): string | null {
  try {
    const tz = tzLookup(lat, lon);
    if (!tz) return null;
    // Intl rifiuta i fusi che non conosce: meglio scoprirlo qui.
    new Intl.DateTimeFormat('it-IT', { timeZone: tz });
    return tz;
  } catch { return null; }
}

/**
 * Ora breve NEL FUSO DEL LUOGO. Senza `timeZone` usava quello del telefono:
 * guardando Miami dall'Italia il tramonto usciva «01:00» (segnalato il
 * 22/08/2026). Un orario di alba o tramonto ha senso solo nell'ora locale
 * del posto in cui il sole tramonta.
 */
export function oraBreve(d: Date | null, timeZone?: string | null): string {
  if (!d || isNaN(d.getTime())) return '';
  try {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) });
  } catch {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
}

/** Quanto manca all'ora d'oro della sera, se non è già passata. */
export function mancaAllOraOro(o: OrariSole, adesso: Date = new Date()): string | null {
  if (!o.oraOroSeraInizio) return null;
  const minuti = Math.round((o.oraOroSeraInizio.getTime() - adesso.getTime()) / 60000);
  if (minuti < 0 || minuti > 600) return null; // passata, o troppo lontana per interessare
  if (minuti < 60) return `fra ${minuti} min`;
  return `fra ${Math.floor(minuti / 60)}h ${String(minuti % 60).padStart(2, '0')}m`;
}
