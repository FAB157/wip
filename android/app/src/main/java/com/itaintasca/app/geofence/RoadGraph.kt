package com.itaintasca.app.geofence

import java.util.PriorityQueue
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/**
 * DISTANZA DI STRADA (03/10/2026, committente: «deve essere tutto in strada
 * reale, mai linea d'aria»; modello: Google Maps / Mappe).
 *
 * PORT ESATTO di src/lib/geofencing/distanzaStrada.ts (li' il commento per
 * esteso e il collaudo: scratch/collaudo-distanza-strada.mts) e gemello di
 * RoadGraph in fondo a ios/App/App/RoadSnap.swift: stesse costanti, stessi passi.
 *
 * Le polilinee che RoadSnap scarica per agganciare il GPS alla via diventano
 * un grafo; la distanza da un luogo e':
 *   (GPS → via piu' vicina) + (cammino minimo sulla rete) + (via → punto d'arrivo)
 * Gli incroci spariti con la semplificazione del server si ricostruiscono
 * (segmenti che si attraversano, capi che finiscono su un altro segmento).
 * null solo se attorno non c'e' nessuna strada nota: vedi UTENTE_MAX_M.
 */
/** Punto agganciato alla rete: segmento, posizione lungo di esso (0..1), metri dalla via. */
internal class AggancioStrada(val seg: Int, val t: Double, val d: Double)

class RoadGraph private constructor(
    private val lat0: Double,
    private val lon0: Double,
    private val mLon: Double,
    private val seg: List<Segmento>,
    private val griglia: Map<Long, IntArray>,
    private val archiNodo: Array<IntArray>,
    private val archiPeso: Array<DoubleArray>
) {
    class Segmento(val ax: Double, val ay: Double, val bx: Double, val by: Double, val len: Double) {
        /** Punti lungo il segmento ordinati per t: capi e tagli degli incroci. */
        var catT: DoubleArray = doubleArrayOf(0.0, 1.0)
        var catN: IntArray = IntArray(2)
        /** Fa parte di un'isola (componente staccata, meno di ISOLA_M metri): non ci si aggancia. */
        var isola: Boolean = false
    }

    /** Le distanze da una posizione, pronte da leggere per ogni luogo. */
    inner class Sorgente internal constructor(
        private val partenza: AggancioStrada,
        private val dist: HashMap<Int, Double>,
        private val maxM: Double
    ) {
        /** Metri di strada; +Infinity se oltre il raggio di ricerca; null se il luogo e' fuori rete. */
        fun verso(lat: Double, lon: Double): Double? {
            val arrivo = aggancia(x(lon), y(lat), LUOGO_MAX_M) ?: return null
            var best = Double.POSITIVE_INFINITY
            if (arrivo.seg == partenza.seg) {
                best = partenza.d + abs(arrivo.t - partenza.t) * seg[arrivo.seg].len
            }
            vicini(arrivo.seg, arrivo.t) { n, w ->
                val d = dist[n]
                if (d != null && d + w < best) best = d + w
            }
            if (best.isInfinite()) return Double.POSITIVE_INFINITY
            val tot = best + arrivo.d
            return if (tot > maxM) Double.POSITIVE_INFINITY else tot
        }
    }

    private fun x(lon: Double) = (lon - lon0) * mLon
    private fun y(lat: Double) = (lat - lat0) * M_LAT

    private fun aggancia(px: Double, py: Double, maxM: Double): AggancioStrada? {
        val cx = cella(px); val cy = cella(py)
        val r = kotlin.math.ceil(maxM / CELLA_M).toInt()
        var best: AggancioStrada? = null
        for (dx in -r..r) for (dy in -r..r) {
            val lista = griglia[chiave(cx + dx, cy + dy)] ?: continue
            for (i in lista) {
                val s = seg[i]
                if (s.isola) continue
                val t = tSu(s, px, py)
                val d = hypot(px - (s.ax + t * (s.bx - s.ax)), py - (s.ay + t * (s.by - s.ay)))
                if (d <= maxM && (best == null || d < best!!.d)) best = AggancioStrada(i, t, d)
            }
        }
        return best
    }

    /** I due punti della catena che racchiudono t, con i metri da t a ciascuno. */
    private inline fun vicini(iSeg: Int, t: Double, f: (Int, Double) -> Unit) {
        val s = seg[iSeg]
        var i = 0
        while (i + 1 < s.catT.size - 1 && s.catT[i + 1] <= t) i++
        f(s.catN[i], abs(t - s.catT[i]) * s.len)
        f(s.catN[i + 1], abs(s.catT[i + 1] - t) * s.len)
    }

    /** Prepara le distanze da una posizione. null se l'utente e' fuori rete. */
    fun da(lat: Double, lon: Double, maxM: Double): Sorgente? {
        val partenza = aggancia(x(lon), y(lat), UTENTE_MAX_M) ?: return null
        val dist = HashMap<Int, Double>()
        val coda = PriorityQueue<DoubleArray>(64) { a, b -> a[0].compareTo(b[0]) }
        vicini(partenza.seg, partenza.t) { n, w ->
            val d = partenza.d + w
            if (d < (dist[n] ?: Double.POSITIVE_INFINITY)) { dist[n] = d; coda.add(doubleArrayOf(d, n.toDouble())) }
        }
        while (coda.isNotEmpty()) {
            val top = coda.poll() ?: break
            val d = top[0]; val n = top[1].toInt()
            if (d > (dist[n] ?: Double.POSITIVE_INFINITY)) continue
            if (d > maxM) break
            val vn = archiNodo[n]; val vw = archiPeso[n]
            for (k in vn.indices) {
                val nd = d + vw[k]
                if (nd < (dist[vn[k]] ?: Double.POSITIVE_INFINITY)) { dist[vn[k]] = nd; coda.add(doubleArrayOf(nd, vn[k].toDouble())) }
            }
        }
        return Sorgente(partenza, dist, maxM)
    }

    companion object {
        /**
         * «LINEA D'ARIA MAI» (committente, 03/10/2026): utente e luogo si agganciano
         * alla via piu' vicina fino a 120 m, e quei metri si sommano. null resta
         * solo quando attorno non c'e' NESSUNA strada nota (tile non scaricata).
         */
        const val UTENTE_MAX_M = 120.0
        const val LUOGO_MAX_M = 120.0
        /** Un capo di polilinea entro questi metri da un altro segmento e' un incrocio. */
        const val INNESTO_M = 4.0
        /** Entro questi metri in linea d'aria si e' arrivati comunque (buco nei dati). */
        const val SICUREZZA_M = 15.0
        /** Una componente della rete con meno metri di cosi' e' un'isola: non ci si aggancia. */
        const val ISOLA_M = 150.0
        private const val CELLA_M = 60.0
        private const val M_LAT = 111_320.0

        /** Raggio di ricerca sul grafo: deve coprire il raggio d'avviso. */
        fun ricercaM(isDriving: Boolean): Double = if (isDriving) 700.0 else 450.0

        private fun cella(v: Double): Long = floor(v / CELLA_M).toLong()
        private fun chiave(cx: Long, cy: Long): Long = cx * 1_000_003L + cy
        private fun tSu(s: Segmento, px: Double, py: Double): Double {
            val dx = s.bx - s.ax; val dy = s.by - s.ay
            val l2 = dx * dx + dy * dy
            return if (l2 == 0.0) 0.0 else max(0.0, min(1.0, ((px - s.ax) * dx + (py - s.ay) * dy) / l2))
        }

        /**
         * LA REGOLA D'USO, una sola per tutti i chiamanti (= distanzaCheDecide):
         * strada nota → metri di strada; fuori rete o senza tile → linea d'aria;
         * entro SICUREZZA_M in linea d'aria si e' arrivati comunque.
         */
        fun cheDecide(aria: Double, strada: Double?): Double {
            if (strada == null) return aria
            if (aria <= SICUREZZA_M) return min(aria, strada)
            return max(aria, strada)
        }

        /** Grafo dalle polilinee di una rete: ogni polilinea e' [lat0, lon0, lat1, lon1, ...]. */
        fun crea(polilinee: List<DoubleArray>): RoadGraph? {
            val prima = polilinee.firstOrNull { it.size >= 2 } ?: return null
            val lat0 = prima[0]; val lon0 = prima[1]
            val mLon = (M_LAT * cos(Math.toRadians(lat0))).let { if (it == 0.0) 1.0 else it }

            val idNodo = HashMap<Long, Int>()
            val nx = ArrayList<Double>(); val ny = ArrayList<Double>()
            fun nodo(px: Double, py: Double): Int {
                val k = px.roundToLong() * 4_000_037L + py.roundToLong()
                return idNodo.getOrPut(k) { nx.add(px); ny.add(py); nx.size - 1 }
            }
            val seg = ArrayList<Segmento>()
            val catene = ArrayList<ArrayList<DoubleArray>>() // per segmento: [t, nodo]
            val capiNodo = ArrayList<Int>(); val capiSeg = ArrayList<Int>()
            for (p in polilinee) {
                var primo = -1; var ultimo = -1
                var i = 0
                while (i + 3 < p.size) {
                    val ax = (p[i + 1] - lon0) * mLon; val ay = (p[i] - lat0) * M_LAT
                    val bx = (p[i + 3] - lon0) * mLon; val by = (p[i + 2] - lat0) * M_LAT
                    i += 2
                    if (ax.isNaN() || ay.isNaN() || bx.isNaN() || by.isNaN()) continue
                    val a = nodo(ax, ay); val b = nodo(bx, by)
                    if (a == b) continue
                    val len = hypot(nx[b] - nx[a], ny[b] - ny[a])
                    seg.add(Segmento(nx[a], ny[a], nx[b], ny[b], len))
                    catene.add(arrayListOf(doubleArrayOf(0.0, a.toDouble()), doubleArrayOf(1.0, b.toDouble())))
                    if (primo < 0) primo = seg.size - 1
                    ultimo = seg.size - 1
                }
                if (primo >= 0) {
                    capiNodo.add(catene[primo][0][1].toInt()); capiSeg.add(primo)
                    capiNodo.add(catene[ultimo][1][1].toInt()); capiSeg.add(ultimo)
                }
            }
            if (seg.isEmpty()) return null

            // Griglia spaziale dei segmenti
            val g = HashMap<Long, ArrayList<Int>>()
            for (i in seg.indices) {
                val s = seg[i]
                val x0 = cella(min(s.ax, s.bx)); val x1 = cella(max(s.ax, s.bx))
                val y0 = cella(min(s.ay, s.by)); val y1 = cella(max(s.ay, s.by))
                for (cx in x0..x1) for (cy in y0..y1) g.getOrPut(chiave(cx, cy)) { ArrayList() }.add(i)
            }
            fun haNodo(c: ArrayList<DoubleArray>, n: Int) = c.any { it[1].toInt() == n }

            // 1. Incroci ricostruiti: attraversamenti fra segmenti
            for (lista in g.values) {
                for (i in 0 until lista.size) for (j in i + 1 until lista.size) {
                    val p = seg[lista[i]]; val q = seg[lista[j]]
                    val rX = p.bx - p.ax; val rY = p.by - p.ay
                    val sX = q.bx - q.ax; val sY = q.by - q.ay
                    val den = rX * sY - rY * sX
                    if (abs(den) < 1e-9) continue
                    val t = ((q.ax - p.ax) * sY - (q.ay - p.ay) * sX) / den
                    val u = ((q.ax - p.ax) * rY - (q.ay - p.ay) * rX) / den
                    if (t <= 0.0 || t >= 1.0 || u <= 0.0 || u >= 1.0) continue
                    val n = nodo(p.ax + t * rX, p.ay + t * rY)
                    val cp = catene[lista[i]]; val cq = catene[lista[j]]
                    if (!haNodo(cp, n)) cp.add(doubleArrayOf(t, n.toDouble()))
                    if (!haNodo(cq, n)) cq.add(doubleArrayOf(u, n.toDouble()))
                }
            }
            // 1-bis. Innesti a T: un capo di polilinea che finisce su un altro segmento
            val innesti = ArrayList<DoubleArray>() // [capo, punto sul segmento, metri]
            for (k in capiNodo.indices) {
                val n = capiNodo[k]
                val px = nx[n]; val py = ny[n]
                val cx = cella(px); val cy = cella(py)
                for (dx in -1..1) for (dy in -1..1) {
                    val lista = g[chiave(cx + dx, cy + dy)] ?: continue
                    for (i in lista) {
                        if (i == capiSeg[k]) continue
                        val c = catene[i]
                        if (haNodo(c, n)) continue
                        val s = seg[i]
                        val t = tSu(s, px, py)
                        val d = hypot(px - (s.ax + t * (s.bx - s.ax)), py - (s.ay + t * (s.by - s.ay)))
                        if (d > INNESTO_M) continue
                        // Il capo non sta ESATTAMENTE sul segmento: il taglio va
                        // nel punto proiettato e i metri che mancano diventano un
                        // arco a parte, o ogni innesto regalerebbe fino a 4 m.
                        val m = nodo(s.ax + t * (s.bx - s.ax), s.ay + t * (s.by - s.ay))
                        if (!haNodo(c, m)) c.add(doubleArrayOf(t, m.toDouble()))
                        if (m != n) innesti.add(doubleArrayOf(n.toDouble(), m.toDouble(), d))
                    }
                }
            }

            // 2. Archi: lungo ogni segmento, da un punto della catena al successivo
            val an = Array(nx.size) { ArrayList<Int>(4) }
            val aw = Array(nx.size) { ArrayList<Double>(4) }
            for (i in seg.indices) {
                val c = catene[i]
                c.sortBy { it[0] }
                val s = seg[i]
                s.catT = DoubleArray(c.size) { c[it][0] }
                s.catN = IntArray(c.size) { c[it][1].toInt() }
                for (k in 0 until c.size - 1) {
                    val a = s.catN[k]; val b = s.catN[k + 1]
                    if (a == b) continue
                    val w = max(0.0, (s.catT[k + 1] - s.catT[k]) * s.len)
                    an[a].add(b); aw[a].add(w); an[b].add(a); aw[b].add(w)
                }
            }
            for (e in innesti) {
                val a = e[0].toInt(); val b = e[1].toInt()
                an[a].add(b); aw[a].add(e[2]); an[b].add(a); aw[b].add(e[2])
            }
            // 3. ISOLE: pezzetti di rete staccati da tutto (un vialetto in un
            // cortile, un corridoio interno, una banchina). Se il punto d'arrivo
            // o il GPS si agganciano li', il luogo risulta irraggiungibile pur
            // avendo la strada a dieci metri (Pantheon, 03/10/2026). Le
            // componenti con meno di ISOLA_M metri di rete non si usano per
            // l'aggancio.
            val comp = IntArray(nx.size) { -1 }
            val metriComp = ArrayList<Double>()
            val pila = ArrayList<Int>()
            for (n0 in 0 until nx.size) {
                if (comp[n0] >= 0) continue
                val c = metriComp.size
                var tot = 0.0
                pila.clear(); pila.add(n0); comp[n0] = c
                while (pila.isNotEmpty()) {
                    val n = pila.removeAt(pila.size - 1)
                    val vn = an[n]; val vw = aw[n]
                    for (k in vn.indices) {
                        tot += vw[k]
                        val m = vn[k]
                        if (comp[m] < 0) { comp[m] = c; pila.add(m) }
                    }
                }
                metriComp.add(tot / 2.0)
            }
            for (s in seg) s.isola = metriComp[comp[s.catN[0]]] < ISOLA_M

            val grigliaFinale = HashMap<Long, IntArray>(g.size * 2)
            for ((k, v) in g) grigliaFinale[k] = v.toIntArray()
            return RoadGraph(
                lat0, lon0, mLon, seg, grigliaFinale,
                Array(nx.size) { an[it].toIntArray() },
                Array(nx.size) { aw[it].toDoubleArray() }
            )
        }
    }
}
