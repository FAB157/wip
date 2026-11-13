package com.itaintasca.app.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * LO SNAPSHOT DEI WIDGET — lettura (14/09/2026).
 *
 * Stesso JSON di iOS (WipWidgetDati.swift), composto da src/lib/widgetDati.ts.
 * Ogni campo ha un default: uno snapshot vecchio con meno campi non rompe il
 * widget. Le etichette arrivano gia' tradotte dall'app.
 */
class WipWidgetDati private constructor(private val json: JSONObject) {

    val versione: Int get() = json.optInt("v", 0)
    val ts: Long get() = json.optLong("ts", 0)
    val etichette: JSONObject get() = json.optJSONObject("etichette") ?: JSONObject()
    val crediti: JSONObject? get() = json.optJSONObject("crediti")
    val visita: JSONObject? get() = json.optJSONObject("visita")
    val itinerario: JSONObject? get() = json.optJSONObject("itinerario")
    val vicini: JSONArray get() = json.optJSONArray("vicini") ?: JSONArray()
    val posizione: JSONObject? get() = json.optJSONObject("posizione")

    // ── Undici widget nuovi (23/09/2026): blocchi opzionali dello snapshot
    //    (rev 2, v resta 1). Uno snapshot vecchio li da' tutti null/vuoti. ──
    val sessione: Boolean get() = json.optBoolean("sessione", false)
    val ultimoAscolto: JSONObject? get() = json.optJSONObject("ultimoAscolto")
    val linguaAlt: JSONObject? get() = json.optJSONObject("linguaAlt")
    val luogoGiorno: JSONArray get() = json.optJSONArray("luogoGiorno") ?: JSONArray()
    val meteo: JSONObject? get() = json.optJSONObject("meteo")
    val garanzia: JSONObject? get() = json.optJSONObject("garanzia")
    val ascoltaOra: JSONObject? get() = json.optJSONObject("ascoltaOra")
    val eventi: JSONArray get() = json.optJSONArray("eventi") ?: JSONArray()
    val gemmaRegione: JSONObject? get() = json.optJSONObject("gemmaRegione")
    val confronto: JSONObject? get() = json.optJSONObject("confronto")
    val guidaStampata: JSONObject? get() = json.optJSONObject("guidaStampata")
    val fotoCommunity: JSONObject? get() = json.optJSONObject("fotoCommunity")

    /** Il luogo del giorno con la data di OGGI (il JS ne manda tre: oggi, domani,
     *  dopodomani), cosi' il ciclo di 30 minuti cambia voce la mattina anche ad
     *  app chiusa. Data locale del telefono, formato AAAA-MM-GG. */
    fun luogoDiOggi(): JSONObject? {
        val oggi = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val lista = luogoGiorno
        for (i in 0 until lista.length()) lista.optJSONObject(i)?.let { if (it.optString("giorno") == oggi) return it }
        return null
    }

    fun e(chiave: String, default: String): String = etichette.optString(chiave, default).ifEmpty { default }

    companion object {
        fun salva(context: Context, dati: String) {
            WipWidgetsPlugin.prefs(context).edit().putString(WipWidgetsPlugin.CHIAVE, dati).apply()
        }

        /** null = l'app non ha mai scritto: il widget invita ad aprire WIP. */
        fun carica(context: Context): WipWidgetDati? {
            val raw = try { WipWidgetsPlugin.prefs(context).getString(WipWidgetsPlugin.CHIAVE, null) } catch (_: Exception) { null }
            if (raw.isNullOrEmpty()) return null
            return try {
                val d = WipWidgetDati(JSONObject(raw))
                if (d.versione == 1) d else null
            } catch (_: Exception) { null }
        }

        fun distanza(metri: Double): String =
            if (metri < 1000) "${metri.roundToInt()} m"
            else String.format(Locale.getDefault(), "%.1f km", metri / 1000).replace(".0 km", " km").replace(",0 km", " km")

        /** Minuti a piedi: linea d'aria x 1,3 a 4 km/h. */
        fun minutiAPiedi(metri: Double): Int = max(1, (metri * 1.3 / 4000 * 60).roundToInt())

        fun ora(epochMs: Long): String = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(epochMs))

        fun metriTra(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
            val r = Math.PI / 180; val R = 6371000.0
            val dLat = (bLat - aLat) * r; val dLon = (bLon - aLon) * r
            val x = sin(dLat / 2).pow(2) + cos(aLat * r) * cos(bLat * r) * sin(dLon / 2).pow(2)
            return 2 * R * asin(sqrt(x))
        }

        /** Un'icona per categoria (emoji: RemoteViews non ha le icone vettoriali di sistema). */
        fun simbolo(categoria: String): String {
            val c = categoria.lowercase(Locale.ROOT)
            return when {
                c.contains("chies") || c.contains("church") || c.contains("relig") -> "⛪"
                c.contains("muse") || c.contains("galler") || c.contains("art") -> "🖼"
                c.contains("castel") || c.contains("fort") || c.contains("castle") -> "🏰"
                c.contains("parc") || c.contains("giardin") || c.contains("natur") || c.contains("park") -> "🌳"
                c.contains("pranzo") || c.contains("cena") || c.contains("colazione") || c.contains("ristor") || c.contains("food") -> "🍽"
                c.contains("panoram") || c.contains("belved") || c.contains("view") -> "🔭"
                c.contains("piazz") || c.contains("square") -> "🏛"
                else -> "📍"
            }
        }

        // ── Miniature: scaricate una volta, in cache nei file dell'app ──
        private fun nomeFile(url: String): String {
            var h = 1469598103934665603uL
            for (b in url.encodeToByteArray()) { h = (h xor b.toUByte().toULong()) * 1099511628211uL }
            return h.toString(16) + ".jpg"
        }

        /**
         * Miniatura (max `lato` px sul lato lungo) o null. Tempo massimo 4 s per
         * immagine, mai un'eccezione: senza foto resta l'icona della categoria.
         *
         * (23/09/2026) Chiave di cache con il lato (le miniature da 160 gia' in
         * cache restano valide: stesso nome di prima), scrittura su .tmp e poi
         * rinomina (un widget che legge a meta' scrittura non trova un JPEG
         * troncato). Sopra 160 px la bitmap e' RGB_565: la «foto grande» da 400
         * pesa ~240 KB, dentro il limite del Binder di RemoteViews.
         */
        fun miniatura(context: Context, url: String, lato: Int = 160): Bitmap? {
            if (url.isEmpty() || !url.startsWith("http")) return null
            return try {
                val dir = File(context.cacheDir, "widget-miniature").apply { mkdirs() }
                val file = File(dir, nomeFile(if (lato == 160) url else "$url#$lato"))
                val leggera = lato > 160
                fun opzioni(campione: Int = 1) = BitmapFactory.Options().apply {
                    inSampleSize = campione
                    if (leggera) inPreferredConfig = Bitmap.Config.RGB_565
                }
                if (file.exists()) {
                    // Rinfresca la data: la pulizia dei 14 giorni tocca solo le foto non piu' usate.
                    BitmapFactory.decodeFile(file.absolutePath, opzioni())?.let { try { file.setLastModified(System.currentTimeMillis()) } catch (_: Exception) { }; return it }
                }
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 4000; readTimeout = 4000
                    setRequestProperty("User-Agent", "WorldInPocket/1.0 (https://wip.guide; support@wip.guide)")
                    instanceFollowRedirects = true
                }
                if (conn.responseCode !in 200..299) return null
                val byteArray = conn.inputStream.use { it.readBytes() }
                val limiti = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(byteArray, 0, byteArray.size, limiti)
                var campione = 1
                while (max(limiti.outWidth, limiti.outHeight) / campione > lato * 2) campione *= 2
                val piena = BitmapFactory.decodeByteArray(byteArray, 0, byteArray.size, opzioni(campione)) ?: return null
                val scala = minOf(1f, lato.toFloat() / max(piena.width, piena.height))
                val piccola = if (scala < 1f) Bitmap.createScaledBitmap(piena, (piena.width * scala).toInt().coerceAtLeast(1), (piena.height * scala).toInt().coerceAtLeast(1), true) else piena
                try {
                    val tmp = File(dir, file.name + ".tmp")
                    tmp.outputStream().use { piccola.compress(Bitmap.CompressFormat.JPEG, 80, it) }
                    if (!tmp.renameTo(file)) tmp.delete()
                } catch (_: Exception) { }
                piccola
            } catch (_: Exception) { null }
        }

        /** Cancella le miniature (e i .tmp orfani) piu' vecchie di 14 giorni. */
        fun pulisciMiniature(context: Context) {
            try {
                val limite = System.currentTimeMillis() - 14L * 24 * 3600 * 1000
                File(context.cacheDir, "widget-miniature").listFiles()?.forEach { f ->
                    if (f.isFile && f.lastModified() < limite) f.delete()
                }
            } catch (_: Exception) { }
        }
    }
}
