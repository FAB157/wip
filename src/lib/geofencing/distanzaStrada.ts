// =====================================================================
// DISTANZA DI STRADA (03/10/2026, committente: «deve essere tutto in strada
// reale, mai linea d'aria»; modello: Google Maps / Mappe).
//
// Le stesse polilinee che roadSnap scarica per agganciare il GPS alla via
// (/api/roads/tile: rete pedonale e rete auto attorno all'utente) diventano
// un GRAFO, e la distanza da un luogo si misura camminandoci sopra:
//
//   metri = (GPS → via più vicina) + (cammino minimo sulla rete) + (via → punto d'arrivo)
//
// I due tratti estremi sono gli «ultimi metri» fuori rete (il tratteggio di
// Maps) e restano in linea d'aria per forza: lì una strada non c'è.
//
// TRE TRAPPOLE DEI DATI, tutte gestite in `creaGrafoStrade`:
//  1. Il server semplifica le polilinee (3 m): il nodo di un incrocio a metà
//     via sparisce se è allineato. Gli incroci si RICOSTRUISCONO: due segmenti
//     che si attraversano, o un capo che finisce su un altro segmento (entro
//     4 m), sono collegati. Un cavalcavia risulta collegato alla strada sotto:
//     errore accettato (accorcia, non allunga, ed è raro a piedi).
//  2. Più incroci sullo stesso segmento: i punti di taglio si ordinano e si
//     concatenano, altrimenti da un incrocio all'altro si passerebbe dal capo.
//  3. «LINEA D'ARIA MAI» (committente, 03/10/2026). Utente o luogo lontani
//     dalla via (in mezzo a una piazza, in un cortile) NON tornano alla linea
//     d'aria: si agganciano comunque alla via più vicina, fino a 120 m, e quei
//     metri si sommano. `null` resta solo quando attorno non c'è NESSUNA strada
//     nota (tile non scaricata, mare aperto): lì non c'è nulla da misurare e
//     chi chiama non ha altro che la distanza diretta.
//
// PORT ESATTO in RoadGraph.kt (Android) e RoadGraph.swift (iOS): stesse
// costanti, stessi passi. Collaudo: npx tsx scratch/collaudo-distanza-strada.mts
// =====================================================================

/** Fin qui si cerca la via più vicina all'UTENTE: oltre, non ci sono strade note attorno (dati assenti). */
export const STRADA_UTENTE_MAX_M = 120;
/** Fin qui si cerca la via più vicina al LUOGO: oltre, non ci sono strade note attorno (dati assenti). */
export const STRADA_LUOGO_MAX_M = 120;
/** Un capo di polilinea entro questi metri da un altro segmento è un incrocio. */
export const STRADA_INNESTO_M = 4;
/** Entro questi metri in linea d'aria si è arrivati comunque: un buco nei dati non deve zittire la guida. */
export const STRADA_SICUREZZA_M = 15;

/** Una componente della rete con meno metri di così è un'isola: non ci si aggancia. */
export const STRADA_ISOLA_M = 150;

const CELLA_M = 60;

interface Segmento {
  ax: number; ay: number; bx: number; by: number; len: number;
  /** Punti lungo il segmento, ordinati per t: capi (t=0, t=1) e tagli degli incroci. */
  catena: Array<{ t: number; nodo: number }>;
}

export interface SorgenteStrada {
  /** Metri di strada fino al punto; Infinity se oltre il raggio di ricerca; null se il luogo è fuori rete. */
  verso(lat: number, lon: number): number | null;
}
export interface GrafoStrade {
  /** Prepara le distanze da una posizione. null se l'utente è fuori rete (o il grafo è vuoto). */
  da(lat: number, lon: number, maxM: number): SorgenteStrada | null;
  readonly nodi: number;
  readonly segmenti: number;
}

/** Heap binario minimo su (distanza, nodo): Dijkstra senza dipendenze. */
class Coda {
  private d: number[] = []; private n: number[] = [];
  get vuota() { return this.d.length === 0; }
  metti(dist: number, nodo: number) {
    let i = this.d.length; this.d.push(dist); this.n.push(nodo);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.d[p] <= this.d[i]) break;
      [this.d[p], this.d[i]] = [this.d[i], this.d[p]]; [this.n[p], this.n[i]] = [this.n[i], this.n[p]]; i = p;
    }
  }
  togli(): [number, number] {
    const dist = this.d[0], nodo = this.n[0];
    const ld = this.d.pop() as number, ln = this.n.pop() as number;
    if (this.d.length > 0) {
      this.d[0] = ld; this.n[0] = ln;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < this.d.length && this.d[l] < this.d[m]) m = l;
        if (r < this.d.length && this.d[r] < this.d[m]) m = r;
        if (m === i) break;
        [this.d[m], this.d[i]] = [this.d[i], this.d[m]]; [this.n[m], this.n[i]] = [this.n[i], this.n[m]]; i = m;
      }
    }
    return [dist, nodo];
  }
}

/** Grafo dalle polilinee `[[lat, lon], ...]` di una rete (pedonale o auto). */
export function creaGrafoStrade(polilinee: number[][][]): GrafoStrade {
  let lat0 = NaN, lon0 = NaN;
  for (const p of polilinee || []) { if (p?.[0]) { lat0 = p[0][0]; lon0 = p[0][1]; break; } }
  const vuoto: GrafoStrade = { da: () => null, nodi: 0, segmenti: 0 };
  if (!Number.isFinite(lat0)) return vuoto;
  const mLat = 111_320, mLon = 111_320 * Math.cos((lat0 * Math.PI) / 180) || 1;
  const X = (lon: number) => (lon - lon0) * mLon, Y = (lat: number) => (lat - lat0) * mLat;

  // ── Nodi (vertici, uniti al metro) e segmenti ──
  const idNodo = new Map<string, number>();
  const nx: number[] = [], ny: number[] = [];
  const nodo = (x: number, y: number): number => {
    const k = `${Math.round(x)},${Math.round(y)}`;
    let id = idNodo.get(k);
    if (id === undefined) { id = nx.length; idNodo.set(k, id); nx.push(x); ny.push(y); }
    return id;
  };
  const segmenti: Segmento[] = [];
  const capi: Array<{ nodo: number; seg: number }> = []; // capi di polilinea, per gli innesti a T
  for (const poli of polilinee || []) {
    if (!Array.isArray(poli) || poli.length < 2) continue;
    let primo = -1, ultimo = -1;
    for (let i = 0; i + 1 < poli.length; i++) {
      const ax = X(poli[i][1]), ay = Y(poli[i][0]), bx = X(poli[i + 1][1]), by = Y(poli[i + 1][0]);
      if (![ax, ay, bx, by].every(Number.isFinite)) continue;
      const a = nodo(ax, ay), b = nodo(bx, by);
      if (a === b) continue;
      const len = Math.hypot(nx[b] - nx[a], ny[b] - ny[a]);
      segmenti.push({ ax: nx[a], ay: ny[a], bx: nx[b], by: ny[b], len, catena: [{ t: 0, nodo: a }, { t: 1, nodo: b }] });
      if (primo < 0) primo = segmenti.length - 1;
      ultimo = segmenti.length - 1;
    }
    if (primo >= 0) {
      capi.push({ nodo: segmenti[primo].catena[0].nodo, seg: primo });
      capi.push({ nodo: segmenti[ultimo].catena[1].nodo, seg: ultimo });
    }
  }
  if (segmenti.length === 0) return vuoto;

  // ── Griglia spaziale dei segmenti ──
  const griglia = new Map<string, number[]>();
  const cella = (v: number) => Math.floor(v / CELLA_M);
  segmenti.forEach((s, i) => {
    const x0 = cella(Math.min(s.ax, s.bx)), x1 = cella(Math.max(s.ax, s.bx));
    const y0 = cella(Math.min(s.ay, s.by)), y1 = cella(Math.max(s.ay, s.by));
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = `${cx},${cy}`; const arr = griglia.get(k);
      if (arr) arr.push(i); else griglia.set(k, [i]);
    }
  });
  const proietta = (s: Segmento, x: number, y: number) => {
    const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / l2));
    const px = s.ax + t * dx, py = s.ay + t * dy;
    return { t, d: Math.hypot(x - px, y - py) };
  };

  // ── 1. Incroci ricostruiti: attraversamenti fra segmenti ──
  for (const lista of griglia.values()) {
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      const p = segmenti[lista[i]], q = segmenti[lista[j]];
      const rX = p.bx - p.ax, rY = p.by - p.ay, sX = q.bx - q.ax, sY = q.by - q.ay;
      const den = rX * sY - rY * sX;
      if (Math.abs(den) < 1e-9) continue; // paralleli
      const t = ((q.ax - p.ax) * sY - (q.ay - p.ay) * sX) / den;
      const u = ((q.ax - p.ax) * rY - (q.ay - p.ay) * rX) / den;
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) continue; // si toccano ai capi: già uniti dal nodo comune
      const n = nodo(p.ax + t * rX, p.ay + t * rY);
      if (!p.catena.some(c => c.nodo === n)) p.catena.push({ t, nodo: n });
      if (!q.catena.some(c => c.nodo === n)) q.catena.push({ t: u, nodo: n });
    }
  }
  // ── 1-bis. Innesti a T: un capo di polilinea che finisce su un altro segmento ──
  const innesti: Array<[number, number, number]> = []; // [capo, punto sul segmento, metri]
  for (const capo of capi) {
    const x = nx[capo.nodo], y = ny[capo.nodo];
    const cx = cella(x), cy = cella(y);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const i of griglia.get(`${cx + dx},${cy + dy}`) || []) {
        if (i === capo.seg) continue;
        const s = segmenti[i];
        if (s.catena.some(c => c.nodo === capo.nodo)) continue;
        const p = proietta(s, x, y);
        if (p.d > STRADA_INNESTO_M) continue;
        // Il capo non sta ESATTAMENTE sul segmento: il taglio va nel punto
        // proiettato e i metri che mancano diventano un arco a parte, o ogni
        // innesto regalerebbe fino a 4 m (visto sui dati veri: distanze più
        // corte della linea d'aria).
        const n = nodo(s.ax + p.t * (s.bx - s.ax), s.ay + p.t * (s.by - s.ay));
        if (!s.catena.some(c => c.nodo === n)) s.catena.push({ t: p.t, nodo: n });
        if (n !== capo.nodo) innesti.push([capo.nodo, n, p.d]);
      }
    }
  }

  // ── 2. Archi: lungo ogni segmento, da un punto della catena al successivo ──
  const archi: Array<Array<[number, number]>> = nx.map(() => []);
  for (const s of segmenti) {
    s.catena.sort((a, b) => a.t - b.t);
    for (let i = 0; i + 1 < s.catena.length; i++) {
      const a = s.catena[i], b = s.catena[i + 1];
      if (a.nodo === b.nodo) continue;
      const w = Math.max(0, (b.t - a.t) * s.len);
      archi[a.nodo].push([b.nodo, w]); archi[b.nodo].push([a.nodo, w]);
    }
  }
  for (const [a, b, w] of innesti) { archi[a].push([b, w]); archi[b].push([a, w]); }

  // ── 3. ISOLE: pezzetti di rete staccati da tutto (un vialetto dentro un
  // cortile, un corridoio interno, una banchina). Se il punto d'arrivo o il
  // GPS si agganciano lì, il luogo risulta irraggiungibile pur avendo la
  // strada a dieci metri (Pantheon, 03/10/2026: avviso a 17 m invece che a
  // 150). Le componenti con meno di STRADA_ISOLA_M metri di rete non si usano
  // per l'aggancio: si passa alla via vera più vicina.
  const comp = new Int32Array(nx.length).fill(-1);
  const metriComp: number[] = [];
  for (let n0 = 0; n0 < nx.length; n0++) {
    if (comp[n0] >= 0) continue;
    const c = metriComp.length; let tot = 0;
    const pila = [n0]; comp[n0] = c;
    while (pila.length) {
      const n = pila.pop() as number;
      for (const [m, w] of archi[n]) { tot += w; if (comp[m] < 0) { comp[m] = c; pila.push(m); } }
    }
    metriComp.push(tot / 2);
  }
  const isola = segmenti.map(s => metriComp[comp[s.catena[0].nodo]] < STRADA_ISOLA_M);

  /** Segmento più vicino a un punto entro `maxM`, con la posizione lungo di esso. */
  const aggancia = (x: number, y: number, maxM: number): { seg: number; t: number; d: number } | null => {
    const cx = cella(x), cy = cella(y);
    const r = Math.ceil(maxM / CELLA_M);
    let best: { seg: number; t: number; d: number } | null = null;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      for (const i of griglia.get(`${cx + dx},${cy + dy}`) || []) {
        if (isola[i]) continue;
        const p = proietta(segmenti[i], x, y);
        if (p.d <= maxM && (!best || p.d < best.d)) best = { seg: i, t: p.t, d: p.d };
      }
    }
    return best;
  };
  /** I due punti della catena che racchiudono t, con i metri da t a ciascuno. */
  const vicini = (seg: number, t: number): Array<[number, number]> => {
    const s = segmenti[seg]; const c = s.catena;
    let i = 0;
    while (i + 1 < c.length - 1 && c[i + 1].t <= t) i++;
    return [[c[i].nodo, Math.abs(t - c[i].t) * s.len], [c[i + 1].nodo, Math.abs(c[i + 1].t - t) * s.len]];
  };

  return {
    nodi: nx.length,
    segmenti: segmenti.length,
    da(lat, lon, maxM) {
      const ux = X(lon), uy = Y(lat);
      const partenza = aggancia(ux, uy, STRADA_UTENTE_MAX_M);
      if (!partenza) return null; // utente fuori rete
      const dist = new Map<number, number>();
      const coda = new Coda();
      for (const [n, w] of vicini(partenza.seg, partenza.t)) {
        const d = partenza.d + w;
        if (d < (dist.get(n) ?? Infinity)) { dist.set(n, d); coda.metti(d, n); }
      }
      while (!coda.vuota) {
        const [d, n] = coda.togli();
        if (d > (dist.get(n) ?? Infinity)) continue;
        if (d > maxM) break;
        for (const [m, w] of archi[n]) {
          const nd = d + w;
          if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); coda.metti(nd, m); }
        }
      }
      return {
        verso(pLat, pLon) {
          const px = X(pLon), py = Y(pLat);
          const arrivo = aggancia(px, py, STRADA_LUOGO_MAX_M);
          if (!arrivo) return null; // luogo fuori rete
          let best = Infinity;
          // Stesso segmento: ci si arriva camminandoci sopra, senza passare da un nodo.
          if (arrivo.seg === partenza.seg) {
            best = partenza.d + Math.abs(arrivo.t - partenza.t) * segmenti[arrivo.seg].len;
          }
          for (const [n, w] of vicini(arrivo.seg, arrivo.t)) {
            const d = dist.get(n);
            if (d !== undefined && d + w < best) best = d + w;
          }
          if (!Number.isFinite(best)) return Infinity;
          const tot = best + arrivo.d;
          return tot > maxM ? Infinity : tot;
        },
      };
    },
  };
}

/**
 * LA REGOLA D'USO, una sola per tutti i chiamanti: la distanza che decide.
 *  • strada nota → metri di strada;
 *  • nessuna strada nota attorno (tile non scaricata) → distanza diretta:
 *    è l'unico caso, e l'alternativa sarebbe una guida muta;
 *  • entro STRADA_SICUREZZA_M (15 m) dal punto si è arrivati comunque: chi è
 *    in mezzo alla piazza accanto alla fontana c'è, anche se la via più
 *    vicina a lui e quella più vicina alla fontana sono su lati diversi.
 */
export function distanzaCheDecide(aria: number, strada: number | null | undefined): number {
  if (strada === null || strada === undefined) return aria;
  if (aria <= STRADA_SICUREZZA_M) return Math.min(aria, strada);
  return Math.max(aria, strada);
}
