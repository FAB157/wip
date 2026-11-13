package com.itaintasca.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.graphics.Bitmap
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import com.itaintasca.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject
import java.text.DateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

/**
 * UNDICI WIDGET NUOVI DELLA HOME (23/09/2026) — lato Android.
 *
 *   7 Ultima audioguida · 5 Luogo del giorno · 39 Cosa vedo · 10 Meteo e
 *   garanzia pioggia · 38 Ascolta ora · 6 Eventi e mostre · 60 Gemma della
 *   regione · 33 Confronto opere · 48 Ripeti in un'altra lingua · 59 Guida
 *   stampata · 13 Foto dalla community.
 *
 * Stesso schema dei quattro di WipHomeWidgets.kt: leggono i blocchi opzionali
 * dello snapshot (rev 2, v resta 1), nessuna rete tranne le foto (in cache), un
 * tocco = itainta://widget/<azione> e l'app fa il resto (coda in App.tsx).
 * Dal widget non parte MAI una riproduzione ne' una generazione: il gate dei
 * crediti resta quello dell'app. Foto solo quelle che manda il JS (gia' filtrate
 * da migliorFoto: reali, https, mai Unsplash); se manca, resta lo sfondo blu.
 * Date e ore arrivano gia' scritte nella lingua dell'app (campi `quando`/`testo`).
 */
internal object WipW2 {
    private val ID_POI = Regex("^[A-Za-z0-9_.:-]{1,80}$")
    private val CHIAVE = Regex("^[0-9a-f]{8}$")

    fun idPoi(id: String?): Boolean = !id.isNullOrEmpty() && ID_POI.matches(id)
    fun chiave(k: String?): Boolean = !k.isNullOrEmpty() && CHIAVE.matches(k)

    /** Numero opzionale: null se assente o null nel JSON (non 0). */
    fun numero(o: JSONObject?, campo: String): Double? =
        if (o != null && o.has(campo) && !o.isNull(campo)) o.optDouble(campo).takeIf { !it.isNaN() } else null

    /** Metri dal campo `metri`, altrimenti dalla posizione dello snapshot. */
    fun metri(dati: WipWidgetDati, o: JSONObject): Double? {
        numero(o, "metri")?.let { return it }
        val p = dati.posizione ?: return null
        val lat = numero(o, "lat") ?: return null
        val lon = numero(o, "lon") ?: return null
        if (lat == 0.0 && lon == 0.0) return null
        return WipWidgetDati.metriTra(p.optDouble("lat"), p.optDouble("lon"), lat, lon)
    }

    fun riga(vararg parti: String?): String = parti.filter { !it.isNullOrBlank() }.joinToString(" · ")

    fun mostra(v: RemoteViews, id: Int, testo: String) {
        v.setTextViewText(id, testo)
        v.setViewVisibility(id, if (testo.isEmpty()) View.GONE else View.VISIBLE)
    }

    /** Stato pieno: via la riga d'invito, dentro il corpo. */
    fun pieno(v: RemoteViews, idVuoto: Int, idCorpo: Int) {
        v.setViewVisibility(idVuoto, View.GONE)
        v.setViewVisibility(idCorpo, View.VISIBLE)
    }

    /** Foto grande: senza bitmap l'ImageView resta GONE e fa da ripiego lo sfondo blu. */
    fun fotoGrande(v: RemoteViews, id: Int, foto: Bitmap?) {
        if (foto != null) { v.setImageViewBitmap(id, foto); v.setViewVisibility(id, View.VISIBLE) }
        else v.setViewVisibility(id, View.GONE)
    }

    private fun stessoGiorno(a: Long, b: Long): Boolean {
        val ca = Calendar.getInstance().apply { timeInMillis = a }
        val cb = Calendar.getInstance().apply { timeInMillis = b }
        return ca.get(Calendar.YEAR) == cb.get(Calendar.YEAR) && ca.get(Calendar.DAY_OF_YEAR) == cb.get(Calendar.DAY_OF_YEAR)
    }

    /**
     * Il `quando` del JS è relativo («oggi 10:42»): vale solo nel giorno in cui
     * e' stato scritto lo snapshot. Se l'app non si apre da un giorno o piu',
     * «oggi» diventerebbe falso: allora si ripiega su data e ora assolute nel
     * formato del telefono (unico caso in cui il nativo formatta).
     */
    fun quando(testo: String, ts: Long, tsSnapshot: Long): String {
        if (ts <= 0L) return testo
        if (testo.isNotEmpty() && tsSnapshot > 0L && stessoGiorno(tsSnapshot, System.currentTimeMillis())) return testo
        // ts a mezzanotte = solo la data (mostre, eventi di un giorno intero): niente «00:00».
        val c = Calendar.getInstance().apply { timeInMillis = ts }
        val soloData = c.get(Calendar.HOUR_OF_DAY) == 0 && c.get(Calendar.MINUTE) == 0
        return if (soloData) DateFormat.getDateInstance(DateFormat.SHORT).format(Date(ts))
        else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(ts))
    }

    /** Codice WMO → emoji (RemoteViews non ha icone vettoriali di sistema). */
    fun emojiMeteo(code: Int): String = when (code) {
        0 -> "☀️"
        1 -> "🌤"
        2 -> "⛅"
        3 -> "☁️"
        45, 48 -> "🌫"
        in 51..65 -> "🌧"
        in 66..77, 85, 86 -> "❄️"
        in 80..82 -> "🌦"
        in 95..99 -> "⛈"
        else -> "🌡"
    }

    /** Un simbolo per categoria di evento (niente foto: decisione A.6). */
    fun simboloEvento(categoria: String): String {
        val c = categoria.lowercase(Locale.ROOT)
        return when {
            c.contains("teatr") || c.contains("theat") || c.contains("danz") || c.contains("dance") || c.contains("opera") -> "🎭"
            c.contains("music") || c.contains("concer") || c.contains("festival") -> "🎵"
            c.contains("mostr") || c.contains("exhib") || c.contains("muse") || c.contains("arte") || c.contains("art") -> "🖼"
            else -> "🎪"
        }
    }

    /**
     * Piu' miniature in parallelo con un tetto totale di 8 s. I download sono
     * lanciati fuori dallo scope (le chiamate HTTP sono bloccanti e un
     * coroutineScope aspetterebbe comunque la fine di tutte): allo scadere si
     * consegna quello che c'e', e il resto finisce di scaricarsi in cache per il
     * giro successivo.
     */
    fun miniatureInParallelo(context: Context, urls: List<String>, lato: Int): List<Bitmap?> = runBlocking {
        val lavori = urls.map { u -> CoroutineScope(Dispatchers.IO).async { WipWidgetDati.miniatura(context, u, lato) } }
        withTimeoutOrNull(8000) { lavori.map { it.await() } }
            ?: lavori.map { d -> if (d.isCompleted) runCatching { d.await() }.getOrNull() else null }
    }

    const val LATO_GRANDE = 400
}

// ── 7. Ultima audioguida ascoltata ───────────────────────────────────────
class WipUltimoAscoltoWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_ultimo)
        v.setOnClickPendingIntent(R.id.w_ua_root, WipHomeWidgets.apri(context, "riascolta", 15))
        v.setTextViewText(R.id.w_ua_titolo, (dati?.e("ultimoAscolto", "Ultima audioguida") ?: "Ultima audioguida").uppercase())
        val u = dati?.ultimoAscolto
        if (dati == null || u == null || u.optString("nome").isEmpty()) {
            WipHomeWidgets.vuoto(v, R.id.w_ua_vuoto, R.id.w_ua_corpo, dati?.e("nessunAscolto", "Nessun ascolto ancora") ?: "Nessun ascolto ancora")
            return v
        }
        WipW2.pieno(v, R.id.w_ua_vuoto, R.id.w_ua_corpo)
        v.setTextViewText(R.id.w_ua_nome, u.optString("nome"))
        WipW2.mostra(v, R.id.w_ua_luogo, u.optString("luogo"))
        WipW2.mostra(v, R.id.w_ua_quando, WipW2.quando(u.optString("quando"), u.optLong("ts", 0), dati.ts))
        val dur = u.optDouble("durSec", 0.0).let { if (it.isNaN()) 0.0 else it }
        val pos = u.optDouble("posSec", 0.0).let { if (it.isNaN()) 0.0 else it }
        if (dur > 0) {
            v.setViewVisibility(R.id.w_ua_barra, View.VISIBLE)
            v.setProgressBar(R.id.w_ua_barra, dur.roundToInt().coerceAtLeast(1), pos.roundToInt().coerceIn(0, dur.roundToInt()), false)
        } else v.setViewVisibility(R.id.w_ua_barra, View.GONE)
        v.setTextViewText(R.id.w_ua_riascolta, "↻ ${dati.e("riascolta", "Riascolta")}")
        v.setOnClickPendingIntent(R.id.w_ua_riascolta, WipHomeWidgets.apri(context, "riascolta", 200))
        // «Riprendi» solo per un POI con un punto sensato (per le opere non c'e' una posizione).
        if (u.optString("tipo") == "poi" && pos > 5 && pos < dur - 5) {
            v.setViewVisibility(R.id.w_ua_riprendi, View.VISIBLE)
            v.setTextViewText(R.id.w_ua_riprendi, "▶ ${dati.e("riprendi", "Riprendi")}")
            v.setOnClickPendingIntent(R.id.w_ua_riprendi, WipHomeWidgets.apri(context, "riprendi", 201))
        } else v.setViewVisibility(R.id.w_ua_riprendi, View.GONE)
        val foto = WipWidgetDati.miniatura(context, u.optString("foto"))
        if (foto != null) v.setImageViewBitmap(R.id.w_ua_foto, foto) else v.setImageViewResource(R.id.w_ua_foto, R.mipmap.ic_launcher)
        return v
    }
}

// ── 5. Luogo del giorno ──────────────────────────────────────────────────
class WipLuogoGiornoWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_luogo)
        v.setTextViewText(R.id.w_lg_titolo, (dati?.e("luogoGiorno", "Luogo del giorno") ?: "Luogo del giorno").uppercase())
        val l = dati?.luogoDiOggi()
        val id = l?.optString("id")
        v.setOnClickPendingIntent(R.id.w_lg_root,
            if (WipW2.idPoi(id)) WipHomeWidgets.apri(context, "luogo/$id", 16) else WipHomeWidgets.apri(context, "vicini", 16))
        if (dati == null || l == null || l.optString("nome").isEmpty()) {
            v.setViewVisibility(R.id.w_lg_foto, View.GONE)
            WipHomeWidgets.vuoto(v, R.id.w_lg_vuoto, R.id.w_lg_corpo, dati?.e("nessuno", "Apri WIP per aggiornare") ?: "Apri WIP per aggiornare")
            return v
        }
        WipW2.pieno(v, R.id.w_lg_vuoto, R.id.w_lg_corpo)
        v.setTextViewText(R.id.w_lg_nome, l.optString("nome"))
        WipW2.mostra(v, R.id.w_lg_citta, WipW2.riga(l.optString("citta"), WipW2.metri(dati, l)?.let { WipWidgetDati.distanza(it) }))
        WipW2.mostra(v, R.id.w_lg_attrib, l.optString("attribuzione"))
        WipW2.fotoGrande(v, R.id.w_lg_foto, WipWidgetDati.miniatura(context, l.optString("foto"), WipW2.LATO_GRANDE))
        return v
    }
}

// ── 39. Cosa vedo davanti ────────────────────────────────────────────────
/**
 * Statico: nessun dato, apre la fotocamera in modalita' riconoscimento. Funziona
 * anche senza snapshot. La scritta si spegne quando il widget e' largo una
 * cella sola (si misura dalle opzioni del widget, per ciascun id).
 */
class WipVisionWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews = vista(context, dati, 999)

    private fun vista(context: Context, dati: WipWidgetDati?, larghezzaDp: Int): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_vision)
        v.setOnClickPendingIntent(R.id.w_vs_root, WipHomeWidgets.apri(context, "vision", 17))
        // Senza snapshot: la scritta nella lingua del telefono (values-xx).
        val ripiego = context.getString(R.string.wip_w_vision_breve)
        v.setTextViewText(R.id.w_vs_testo, dati?.e("cosaVedo", ripiego) ?: ripiego)
        v.setViewVisibility(R.id.w_vs_testo, if (larghezzaDp < 100) View.GONE else View.VISIBLE)
        return v
    }

    private fun larghezza(mgr: AppWidgetManager, id: Int): Int =
        try { mgr.getAppWidgetOptions(id)?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)?.takeIf { it > 0 } ?: 999 } catch (_: Exception) { 999 }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        // Niente rete: si disegna subito, senza goAsync.
        val dati = WipWidgetDati.carica(context)
        appWidgetIds.forEach { id ->
            try { appWidgetManager.updateAppWidget(id, vista(context, dati, larghezza(appWidgetManager, id))) } catch (_: Exception) { }
        }
    }

    override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle?) {
        val l = newOptions?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)?.takeIf { it > 0 } ?: 999
        try { appWidgetManager.updateAppWidget(appWidgetId, vista(context, WipWidgetDati.carica(context), l)) } catch (_: Exception) { }
    }
}

// ── 10. Meteo e garanzia pioggia ─────────────────────────────────────────
class WipMeteoWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_meteo)
        v.setOnClickPendingIntent(R.id.w_me_root, WipHomeWidgets.apri(context, "meteo", 18))
        v.setTextViewText(R.id.w_me_titolo, (dati?.e("meteo", "Meteo") ?: "Meteo").uppercase())
        val m = dati?.meteo
        val adesso = System.currentTimeMillis()
        // Un meteo di piu' di 12 ore fa (app mai riaperta) non si mostra come attuale.
        val vecchio = m != null && m.optLong("ts", 0) > 0 && adesso - m.optLong("ts", 0) > 12L * 3600 * 1000
        if (dati == null || m == null || vecchio) {
            WipHomeWidgets.vuoto(v, R.id.w_me_vuoto, R.id.w_me_corpo, dati?.e("nessuno", "Apri WIP per aggiornare") ?: "Apri WIP per aggiornare")
            return v
        }
        WipW2.pieno(v, R.id.w_me_vuoto, R.id.w_me_corpo)
        // Ora attuale: la prima ora della serie non ancora passata (tolleranza 30 min), se no i campi radice.
        val codeRadice = m.optInt("code", -1)
        var temp = WipW2.numero(m, "temp")
        var code = codeRadice
        val ore = m.optJSONArray("ore")
        if (ore != null) for (i in 0 until ore.length()) {
            val o = ore.optJSONObject(i) ?: continue
            if (o.optLong("ts", 0) >= adesso - 30 * 60 * 1000L) {
                WipW2.numero(o, "temp")?.let { temp = it }
                if (o.has("code") && !o.isNull("code")) code = o.optInt("code", code)
                break
            }
        }
        v.setTextViewText(R.id.w_me_icona, WipW2.emojiMeteo(code))
        v.setTextViewText(R.id.w_me_temp, temp?.let { "${it.roundToInt()}°" } ?: "–")
        // La descrizione e' del codice radice: se l'ora scelta ha un altro tempo, meglio niente che una frase sbagliata.
        WipW2.mostra(v, R.id.w_me_descr, if (code == codeRadice) m.optString("descr") else "")
        WipW2.mostra(v, R.id.w_me_luogo, m.optString("luogo"))
        val finestra = m.optJSONObject("oraMigliore")
        val ora = when (m.optString("esito")) {
            "finestra" -> if (finestra != null && finestra.optLong("a", 0) > adesso && finestra.optString("testo").isNotEmpty())
                "${dati.e("oraMigliore", "Ora migliore")} ${finestra.optString("testo")}" else ""
            "tuttoIlGiorno" -> dati.e("tuttoIlGiorno", "Bel tempo tutto il giorno")
            "musei" -> "🏛 ${dati.e("giornoMusei", "Giornata da musei")}"
            else -> ""
        }
        WipW2.mostra(v, R.id.w_me_ora, ora)
        // Garanzia pioggia: solo se il JS l'ha verificata sul server; mai una promessa inventata.
        val g = dati.garanzia
        if (g != null && g.optString("testo").isNotEmpty()) {
            v.setViewVisibility(R.id.w_me_garanzia, View.VISIBLE)
            v.setTextViewText(R.id.w_me_garanzia, "☂ ${dati.e("garanzia", "Garanzia pioggia")} · ${g.optString("testo")}")
            v.setOnClickPendingIntent(R.id.w_me_garanzia, WipHomeWidgets.apri(context, "garanzia", 210))
        } else v.setViewVisibility(R.id.w_me_garanzia, View.GONE)
        // Attribuzione obbligatoria (MET Norway, CC BY 4.0).
        v.setTextViewText(R.id.w_me_attrib, m.optString("attribuzione").ifEmpty { "MET Norway" })
        return v
    }
}

// ── 38. Ascolta ora ──────────────────────────────────────────────────────
class WipAscoltaWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_ascolta)
        v.setTextViewText(R.id.w_as_titolo, (dati?.e("ascoltaOra", "Ascolta ora") ?: "Ascolta ora").uppercase())
        val a = dati?.ascoltaOra
        val id = a?.optString("id")
        // Il widget non riproduce mai: apre la scheda, e il gate dei crediti resta quello dell'app.
        v.setOnClickPendingIntent(R.id.w_as_root,
            if (WipW2.idPoi(id)) WipHomeWidgets.apri(context, "ascolta/$id", 19) else WipHomeWidgets.apri(context, "vicini", 19))
        if (dati == null || a == null || a.optString("nome").isEmpty()) {
            WipHomeWidgets.vuoto(v, R.id.w_as_vuoto, R.id.w_as_corpo, dati?.e("nessunVicino", "Nessuna audioguida qui vicino") ?: "Nessuna audioguida qui vicino")
            return v
        }
        WipW2.pieno(v, R.id.w_as_vuoto, R.id.w_as_corpo)
        v.setTextViewText(R.id.w_as_nome, a.optString("nome"))
        WipW2.mostra(v, R.id.w_as_dist, WipW2.numero(a, "metri")?.let { "${WipWidgetDati.distanza(it)} · ${WipWidgetDati.minutiAPiedi(it)} min" } ?: "")
        WipW2.mostra(v, R.id.w_as_nota, if (dati.sessione) "" else dati.e("accedi", "Accedi per ascoltare"))
        return v
    }
}

// ── 6. Eventi e mostre ───────────────────────────────────────────────────
class WipEventiWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_eventi)
        v.setOnClickPendingIntent(R.id.w_ev_root, WipHomeWidgets.apri(context, "eventi", 20))
        v.setTextViewText(R.id.w_ev_titolo, (dati?.e("eventi", "Eventi vicino a te") ?: "Eventi vicino a te").uppercase())
        val righe = listOf(
            intArrayOf(R.id.w_ev_r1, R.id.w_ev_r1_icona, R.id.w_ev_r1_titolo, R.id.w_ev_r1_dettagli, R.id.w_ev_r1_bigl),
            intArrayOf(R.id.w_ev_r2, R.id.w_ev_r2_icona, R.id.w_ev_r2_titolo, R.id.w_ev_r2_dettagli, R.id.w_ev_r2_bigl),
            intArrayOf(R.id.w_ev_r3, R.id.w_ev_r3_icona, R.id.w_ev_r3_titolo, R.id.w_ev_r3_dettagli, R.id.w_ev_r3_bigl),
            intArrayOf(R.id.w_ev_r4, R.id.w_ev_r4_icona, R.id.w_ev_r4_titolo, R.id.w_ev_r4_dettagli, R.id.w_ev_r4_bigl),
        )
        // Gli eventi dei giorni passati spariscono anche ad app chiusa. Il confine e'
        // la mezzanotte di oggi, non «3 ore fa»: mostre e eventi con la sola data
        // (ts = 00:00) sparirebbero alle 3 di notte del giorno stesso.
        val limite = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val lista = mutableListOf<JSONObject>()
        dati?.eventi?.let { arr ->
            for (i in 0 until arr.length()) {
                val e = arr.optJSONObject(i) ?: continue
                if (e.optString("titolo").isEmpty()) continue
                val ts = e.optLong("ts", 0)
                if (ts in 1L until limite) continue
                lista.add(e)
            }
        }
        if (dati == null || lista.isEmpty()) {
            WipHomeWidgets.vuoto(v, R.id.w_ev_vuoto, R.id.w_ev_corpo, dati?.e("nessunEvento", "Nessun evento nei prossimi giorni") ?: "Nessun evento nei prossimi giorni")
            return v
        }
        WipW2.pieno(v, R.id.w_ev_vuoto, R.id.w_ev_corpo)
        val biglietti = dati.e("biglietti", "Biglietti")
        righe.forEachIndexed { i, ids ->
            val e = lista.getOrNull(i)
            if (e == null) { v.setViewVisibility(ids[0], View.GONE); return@forEachIndexed }
            v.setViewVisibility(ids[0], View.VISIBLE)
            v.setTextViewText(ids[1], WipW2.simboloEvento(e.optString("categoria")))
            v.setTextViewText(ids[2], e.optString("titolo"))
            v.setTextViewText(ids[3], WipW2.riga(
                WipW2.quando(e.optString("quando"), e.optLong("ts", 0), dati.ts),
                e.optString("luogo"),
                WipW2.numero(e, "metri")?.let { WipWidgetDati.distanza(it) },
            ))
            if (e.optBoolean("biglietto", false)) {
                v.setViewVisibility(ids[4], View.VISIBLE)
                v.setTextViewText(ids[4], biglietti)
            } else v.setViewVisibility(ids[4], View.GONE)
            val k = e.optString("k")
            if (WipW2.chiave(k)) v.setOnClickPendingIntent(ids[0], WipHomeWidgets.apri(context, "evento/$k", 220 + i))
        }
        return v
    }
}

// ── 60. Gemma della regione ──────────────────────────────────────────────
class WipGemmaRegioneWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_regione)
        v.setTextViewText(R.id.w_gr_titolo, (dati?.e("gemmaRegione", "Gemma della regione") ?: "Gemma della regione").uppercase())
        val g = dati?.gemmaRegione
        val id = g?.optString("id")
        v.setOnClickPendingIntent(R.id.w_gr_root,
            if (WipW2.idPoi(id)) WipHomeWidgets.apri(context, "luogo/$id", 21) else WipHomeWidgets.apri(context, "vicini", 21))
        if (dati == null || g == null || g.optString("nome").isEmpty()) {
            v.setViewVisibility(R.id.w_gr_foto, View.GONE)
            WipHomeWidgets.vuoto(v, R.id.w_gr_vuoto, R.id.w_gr_corpo, dati?.e("nessuno", "Apri WIP per aggiornare") ?: "Apri WIP per aggiornare")
            return v
        }
        WipW2.pieno(v, R.id.w_gr_vuoto, R.id.w_gr_corpo)
        v.setTextViewText(R.id.w_gr_nome, g.optString("nome"))
        WipW2.mostra(v, R.id.w_gr_citta, WipW2.riga(g.optString("regione").ifEmpty { g.optString("citta") }, WipW2.metri(dati, g)?.let { WipWidgetDati.distanza(it) }))
        WipW2.mostra(v, R.id.w_gr_attrib, g.optString("attribuzione"))
        WipW2.fotoGrande(v, R.id.w_gr_foto, WipWidgetDati.miniatura(context, g.optString("foto"), WipW2.LATO_GRANDE))
        return v
    }
}

// ── 33. Confronto opere ──────────────────────────────────────────────────
class WipConfrontoWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_confronto)
        v.setOnClickPendingIntent(R.id.w_co_root, WipHomeWidgets.apri(context, "confronto", 22))
        v.setTextViewText(R.id.w_co_titolo, (dati?.e("confronto", "Confronto opere") ?: "Confronto opere").uppercase())
        val c = dati?.confronto
        val a = c?.optJSONObject("a")
        val b = c?.optJSONObject("b")
        if (dati == null || c == null || a == null || b == null) {
            v.setTextViewText(R.id.w_co_museo, "")
            WipHomeWidgets.vuoto(v, R.id.w_co_vuoto, R.id.w_co_corpo, dati?.e("nessunConfronto", "Ascolta due opere per confrontarle") ?: "Ascolta due opere per confrontarle")
            return v
        }
        WipW2.pieno(v, R.id.w_co_vuoto, R.id.w_co_corpo)
        v.setTextViewText(R.id.w_co_museo, c.optString("museo"))
        v.setTextViewText(R.id.w_co_domanda, dati.e("qualeTiPiace", "Quale ti è piaciuta di più?"))
        val foto = WipW2.miniatureInParallelo(context, listOf(a.optString("foto"), b.optString("foto")), 240)
        val lati = listOf(
            Triple(a, intArrayOf(R.id.w_co_a, R.id.w_co_a_foto, R.id.w_co_a_nome, R.id.w_co_a_autore), foto.getOrNull(0)),
            Triple(b, intArrayOf(R.id.w_co_b, R.id.w_co_b_foto, R.id.w_co_b_nome, R.id.w_co_b_autore), foto.getOrNull(1)),
        )
        lati.forEach { (o, ids, bmp) ->
            v.setTextViewText(ids[2], o.optString("nome"))
            WipW2.mostra(v, ids[3], o.optString("autore"))
            if (bmp != null) v.setImageViewBitmap(ids[1], bmp) else v.setImageViewResource(ids[1], R.mipmap.ic_launcher)
        }
        // Voto: vincente/perdente. Con una chiave non valida il tocco apre solo la visita.
        val ka = a.optString("k"); val kb = b.optString("k")
        if (WipW2.chiave(ka) && WipW2.chiave(kb) && ka != kb) {
            v.setOnClickPendingIntent(R.id.w_co_a, WipHomeWidgets.apri(context, "voto/$ka/$kb", 230))
            v.setOnClickPendingIntent(R.id.w_co_b, WipHomeWidgets.apri(context, "voto/$kb/$ka", 231))
        }
        return v
    }
}

// ── 48. Ripeti in un'altra lingua ────────────────────────────────────────
class WipAltraLinguaWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_lingua)
        val apri = WipHomeWidgets.apri(context, "lingua", 23)
        v.setOnClickPendingIntent(R.id.w_li_root, apri)
        v.setTextViewText(R.id.w_li_titolo, (dati?.e("ultimoAscolto", "Ultima audioguida") ?: "Ultima audioguida").uppercase())
        val u = dati?.ultimoAscolto
        if (dati == null || u == null || u.optString("nome").isEmpty()) {
            WipHomeWidgets.vuoto(v, R.id.w_li_vuoto, R.id.w_li_corpo, dati?.e("nessunAscolto", "Nessun ascolto ancora") ?: "Nessun ascolto ancora")
            return v
        }
        WipW2.pieno(v, R.id.w_li_vuoto, R.id.w_li_corpo)
        v.setTextViewText(R.id.w_li_nome, u.optString("nome"))
        val la = dati.linguaAlt
        val nome = la?.optString("nome").orEmpty()
        val ascoltaIn = dati.e("altraLingua", "Ascolta in")
        v.setTextViewText(R.id.w_li_tasto, "🌐 " + if (nome.isEmpty()) ascoltaIn else "$ascoltaIn $nome")
        v.setOnClickPendingIntent(R.id.w_li_tasto, apri)
        // disponibile: true/false/null (null = non ancora verificato → nessuna nota).
        val nonDisponibile = la != null && la.has("disponibile") && !la.isNull("disponibile") && !la.optBoolean("disponibile", true)
        WipW2.mostra(v, R.id.w_li_nota, if (nonDisponibile && nome.isNotEmpty()) "${dati.e("nonDisponibileIn", "Non ancora disponibile in")} $nome" else "")
        val foto = WipWidgetDati.miniatura(context, u.optString("foto"))
        if (foto != null) v.setImageViewBitmap(R.id.w_li_foto, foto) else v.setImageViewResource(R.id.w_li_foto, R.mipmap.ic_launcher)
        return v
    }
}

// ── 59. Guida stampata ───────────────────────────────────────────────────
class WipGuidaStampataWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_pdf)
        v.setTextViewText(R.id.w_pd_titolo, (dati?.e("guidaStampata", "Guida stampata") ?: "Guida stampata").uppercase())
        val g = dati?.guidaStampata
        val k = g?.optString("k")
        if (dati == null || g == null || g.optString("nome").isEmpty() || !WipW2.chiave(k)) {
            v.setOnClickPendingIntent(R.id.w_pd_root, WipHomeWidgets.apri(context, "archivio", 24))
            WipHomeWidgets.vuoto(v, R.id.w_pd_vuoto, R.id.w_pd_corpo, dati?.e("nessunaGuida", "Nessuna guida stampata") ?: "Nessuna guida stampata")
            return v
        }
        WipW2.pieno(v, R.id.w_pd_vuoto, R.id.w_pd_corpo)
        val apri = WipHomeWidgets.apri(context, "pdf/$k", 24)
        v.setOnClickPendingIntent(R.id.w_pd_root, apri)
        v.setTextViewText(R.id.w_pd_icona, when (g.optString("tipo")) { "itinerario" -> "🗺"; "museo" -> "🏛"; else -> "📄" })
        v.setTextViewText(R.id.w_pd_nome, g.optString("nome"))
        WipW2.mostra(v, R.id.w_pd_quando, WipW2.quando(g.optString("quando"), g.optLong("ts", 0), dati.ts))
        v.setTextViewText(R.id.w_pd_apri, dati.e("riapri", "Apri"))
        v.setOnClickPendingIntent(R.id.w_pd_apri, apri)
        v.setTextViewText(R.id.w_pd_condividi, dati.e("condividi", "Condividi"))
        v.setOnClickPendingIntent(R.id.w_pd_condividi, WipHomeWidgets.apri(context, "pdf/$k/condividi", 250))
        return v
    }
}

// ── 13. Foto dalla community ─────────────────────────────────────────────
class WipFotoCommunityWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_community)
        v.setTextViewText(R.id.w_fc_titolo, (dati?.e("fotoCommunity", "Foto dalla community") ?: "Foto dalla community").uppercase())
        val f = dati?.fotoCommunity
        val id = f?.optString("poiId")
        v.setOnClickPendingIntent(R.id.w_fc_root,
            if (WipW2.idPoi(id)) WipHomeWidgets.apri(context, "luogo/$id", 25) else WipHomeWidgets.apri(context, "vicini", 25))
        if (dati == null || f == null || f.optString("foto").isEmpty()) {
            v.setViewVisibility(R.id.w_fc_foto, View.GONE)
            WipHomeWidgets.vuoto(v, R.id.w_fc_vuoto, R.id.w_fc_corpo, dati?.e("nessunaFoto", "Nessuna foto verificata qui vicino") ?: "Nessuna foto verificata qui vicino")
            return v
        }
        WipW2.pieno(v, R.id.w_fc_vuoto, R.id.w_fc_corpo)
        v.setTextViewText(R.id.w_fc_nome, f.optString("nome"))
        v.setTextViewText(R.id.w_fc_badge, "✓ ${dati.e("verificata", "verificata")}")
        WipW2.mostra(v, R.id.w_fc_dettagli, WipW2.riga(
            f.optString("citta"),
            WipW2.numero(f, "metri")?.let { WipWidgetDati.distanza(it) },
            f.optString("quando"),
        ))
        WipW2.fotoGrande(v, R.id.w_fc_foto, WipWidgetDati.miniatura(context, f.optString("foto"), WipW2.LATO_GRANDE))
        return v
    }
}
