/**
 * AGGANCIO AL TRACCIATO (03/10/2026) — collaudo del committente a Montecatini:
 * «non andava bene, né come svolte né come matching map».
 *
 * Il GPS grezzo balla di 10-20 m e la distanza in linea d'aria dal punto della
 * manovra non è quella che si cammina: dietro una curva «fra 40 metri» erano 70.
 * Qui la posizione si PROIETTA sul tracciato, in una finestra che parte
 * dall'aggancio precedente (15 m indietro, in avanti quanto si può aver
 * camminato dal fix prima): è ciò che tiene sulla strada giusta in un anello o
 * su un'andata e ritorno, dove il tratto di ritorno passa accanto. Tre fix di
 * fila senza aggancio → si riparte dalla prima corrispondenza in avanti.
 *
 * Stesso algoritmo, stesse costanti del follower nativo (NavFollower.kt,
 * NavFollower in BackgroundPoiManager.swift, docs/nav-nativo-spec.md): se si
 * tocca un numero qui, va toccato anche là.
 */

const RAGGIO_TERRA_M = 6_371_000;
export const MATCH_INDIETRO_M = 15;
export const MATCH_AVANTI_MIN_M = 60;
export const MATCH_CROSS_MIN_M = 25;
export const MATCH_CROSS_MAX_M = 60;
export const MATCH_PERSI_MAX = 3;
/** Metri di «distanza» in più per ogni metro all'indietro rispetto all'aggancio precedente. */
export const MATCH_PENALITA_INDIETRO = 0.5;
export const VEL_DEFAULT_MS = 1.3;
export const VEL_MIN_MS = 0.5;
export const VEL_MAX_MS = 2.5;
export const VEL_SALTO_MS = 4;
/** Senza velocità GPS: la si misura lungo la strada su almeno 10 secondi. */
export const VEL_FINESTRA_MS = 10_000;
export const NEAR_SEC = 12;
export const NEAR_MIN_M = 18;
export const NEAR_MAX_M = 35;
export const FAR_SEC = 70;
export const FAR_DYN_MIN_M = 70;
export const FAR_MAX_M = 150;
export const FAR_STACCO_M = 20;
export const PASSATO_STRADA_M = 12;

const stringi = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

function metri(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return RAGGIO_TERRA_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** «Vicino» = a 12 s dalla svolta, mai sotto 18 m e mai sopra 35. */
export function sogliaVicina(velMs: number): number { return stringi(velMs * NEAR_SEC, NEAR_MIN_M, NEAR_MAX_M); }
/** «Lontano» = fino a 70 s dalla svolta, fra 70 e 150 m. */
export function sogliaLontanaMax(velMs: number): number { return stringi(velMs * FAR_SEC, FAR_DYN_MIN_M, FAR_MAX_M); }

export class Aggancio {
  private cum: number[];
  private u: number | null = null;
  private persi = 0;
  private vel = VEL_DEFAULT_MS;
  private precTs = 0;
  /** Riferimento per la velocità lungo la strada (senza velocità GPS). */
  private rif: { u: number; ts: number } | null = null;

  /** `linea`: il tracciato come [lat, lon][]. */
  constructor(private linea: [number, number][]) {
    this.cum = new Array(linea.length).fill(0);
    for (let k = 1; k < linea.length; k++) this.cum[k] = this.cum[k - 1] + metri(linea[k - 1][0], linea[k - 1][1], linea[k][0], linea[k][1]);
  }

  get lunghezza(): number { return this.cum.length ? this.cum[this.cum.length - 1] : 0; }
  get velocita(): number { return this.vel; }
  /** Metri lungo il tracciato dell'ultimo aggancio riuscito, o null. */
  get posizione(): number | null { return this.u; }

  /** Proiezione sul segmento k-1→k in un piano locale centrato sul punto. */
  private proietta(k: number, lat: number, lon: number): { dist: number; along: number } {
    const kx = (Math.PI / 180) * RAGGIO_TERRA_M * Math.cos(lat * Math.PI / 180);
    const ky = (Math.PI / 180) * RAGGIO_TERRA_M;
    const ax = (this.linea[k - 1][1] - lon) * kx, ay = (this.linea[k - 1][0] - lat) * ky;
    const dx = (this.linea[k][1] - lon) * kx - ax, dy = (this.linea[k][0] - lat) * ky - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 <= 0 ? 0 : stringi(-(ax * dx + ay * dy) / len2, 0, 1);
    const px = ax + t * dx, py = ay + t * dy;
    return { dist: Math.sqrt(px * px + py * py), along: this.cum[k - 1] + t * (this.cum[k] - this.cum[k - 1]) };
  }

  /**
   * Il punto PIÙ VICINO fra `da` e `a` entro `maxCross`, o null. A parità (o
   * quasi) di distanza vince chi sta AVANTI rispetto a `uPrec`: tornare indietro
   * costa mezzo metro per metro. Sul ritorno per la stessa strada dell'andata i
   * due tratti sono alla stessa distanza, e senza questo la posizione scivolava
   * all'indietro sull'andata (collaudo-aggancio, 03/10/2026).
   */
  private vicino(lat: number, lon: number, da: number, a: number, maxCross: number, uPrec: number): number | null {
    let best = Infinity, along: number | null = null;
    for (let k = 1; k < this.linea.length; k++) {
      if (this.cum[k] < da) continue;
      if (this.cum[k - 1] > a) break;
      const p = this.proietta(k, lat, lon);
      if (p.along < da || p.along > a || p.dist > maxCross) continue;
      const punteggio = p.dist + (p.along < uPrec ? (uPrec - p.along) * MATCH_PENALITA_INDIETRO : 0);
      if (punteggio < best) { best = punteggio; along = p.along; }
    }
    return along;
  }

  /** La PRIMA corrispondenza in avanti da `da`, entro `maxCross`, o null. */
  primaCorrispondenza(lat: number, lon: number, da: number, maxCross: number): number | null {
    for (let k = 1; k < this.linea.length; k++) {
      if (this.cum[k] < da) continue;
      const p = this.proietta(k, lat, lon);
      if (p.dist <= maxCross && p.along >= da) return p.along;
    }
    return null;
  }

  /**
   * Un fix: ritorna i metri lungo il tracciato, o null se non agganciati.
   * `ripartiDa` = da dove cercare la prima corrispondenza quando l'aggancio
   * manca (di solito 300 m prima della manovra corrente).
   */
  aggiorna(lat: number, lon: number, accuratezzaM: number | undefined, ts: number, ripartiDa = 0, velGpsMs?: number | null): number | null {
    const dt = this.precTs > 0 ? (ts - this.precTs) / 1000 : 2;
    this.precTs = ts;
    if (this.linea.length < 2) { this.u = null; return null; }
    const cross = stringi(Number.isFinite(accuratezzaM as number) ? (accuratezzaM as number) : MATCH_CROSS_MIN_M, MATCH_CROSS_MIN_M, MATCH_CROSS_MAX_M);
    const uPrec = this.u;
    let trovato: number | null = null;
    if (uPrec != null) {
      const avanti = Math.max(MATCH_AVANTI_MIN_M, this.vel * stringi(dt, 0.5, 30) * 3 + 40);
      trovato = this.vicino(lat, lon, uPrec - MATCH_INDIETRO_M, uPrec + avanti, cross, uPrec);
      if (trovato == null) {
        this.persi++;
        if (this.persi < MATCH_PERSI_MAX) return null;
      }
    }
    if (trovato == null) trovato = this.primaCorrispondenza(lat, lon, Math.max(0, ripartiDa), cross);
    if (trovato == null) { this.u = null; this.rif = null; return null; }
    // LA VELOCITÀ. Fra due fix grezzi non si può misurare: il GPS che balla di 8 m
    // ogni 2 s «cammina» a 4 m/s anche da fermi (collaudo-aggancio). Quindi: la
    // velocità del GPS quando c'è (è misurata per effetto Doppler, non dalle
    // posizioni); altrimenti i metri fatti LUNGO LA STRADA su almeno 10 secondi.
    if (Number.isFinite(velGpsMs as number) && (velGpsMs as number) >= 0) {
      if ((velGpsMs as number) <= VEL_SALTO_MS) this.vel = stringi(0.8 * this.vel + 0.2 * (velGpsMs as number), VEL_MIN_MS, VEL_MAX_MS);
      this.rif = null;
    } else if (uPrec == null || !this.rif) {
      this.rif = { u: trovato, ts };
    } else if (ts - this.rif.ts >= VEL_FINESTRA_MS) {
      const v = (trovato - this.rif.u) / ((ts - this.rif.ts) / 1000);
      if (v >= 0 && v <= VEL_SALTO_MS) this.vel = stringi(0.5 * this.vel + 0.5 * v, VEL_MIN_MS, VEL_MAX_MS);
      this.rif = { u: trovato, ts };
    }
    this.persi = 0;
    this.u = trovato;
    return trovato;
  }
}
