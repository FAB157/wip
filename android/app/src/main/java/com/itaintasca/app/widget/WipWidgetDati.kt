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
         * Miniatura (max ~160 px) o null. Tempo massimo 4 s per immagine, mai
         * un'eccezione: senza foto resta l'icona della categoria.
         */
        fun miniatura(context: Context, url: String, lato: Int = 160): Bitmap? {
            if (url.isEmpty() || !url.startsWith("http")) return null
            return try {
                val dir = File(context.cacheDir, "widget-miniature").apply { mkdirs() }
                val file = File(dir, nomeFile(url))
                if (file.exists()) {
                    BitmapFactory.decodeFile(file.absolutePath)?.let { return it }
                }
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 4000; readTimeout = 4000
                    setRequestProperty("User-Agent", "WIPWorldInPocket/1.0 (widget)")
                    instanceFollowRedirects = true
                }
                if (conn.responseCode !in 200..299) return null
                val byteArray = conn.inputStream.use { it.readBytes() }
                val limiti = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(byteArray, 0, byteArray.size, limiti)
                var campione = 1
                while (max(limiti.outWidth, limiti.outHeight) / campione > lato * 2) campione *= 2
                val piena = BitmapFactory.decodeByteArray(byteArray, 0, byteArray.size, BitmapFactory.Options().apply { inSampleSize = campione }) ?: return null
                val scala = minOf(1f, lato.toFloat() / max(piena.width, piena.height))
                val piccola = if (scala < 1f) Bitmap.createScaledBitmap(piena, (piena.width * scala).toInt().coerceAtLeast(1), (piena.height * scala).toInt().coerceAtLeast(1), true) else piena
                try { file.outputStream().use { piccola.compress(Bitmap.CompressFormat.JPEG, 80, it) } } catch (_: Exception) { }
                piccola
            } catch (_: Exception) { null }
        }
    }
}
