package com.itaintasca.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import com.itaintasca.app.MainActivity
import com.itaintasca.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * I QUATTRO WIDGET DELLA HOME (14/09/2026), scelti dal committente:
 *   2. Itinerario di oggi  — prossima tappa con ora e minuti a piedi, poi le seguenti
 *   3. Continua la visita  — museo in corso, opere ascoltate/totali, prossima opera
 *   5. Crediti e Pass      — saldo e Day Pass con scadenza
 *   1. Vicino a te         — gemme e luoghi con audioguida vicino all'ultima posizione
 *
 * Tutti leggono lo stesso snapshot scritto dall'app (WipWidgetDati.kt):
 * nessuna rete per i dati, solo le miniature (in cache). Solo view che
 * RemoteViews supporta: righe fisse (max 5) accese/spente, niente liste.
 * Tocco: itainta://widget/<azione> → l'app apre la scheda giusta; su un
 * luogo itainta://widget/poi/<id> apre il POI con l'audioguida.
 */
object WipHomeWidgets {
    private const val TAG = "WipHomeWidgets"

    private val provider = listOf(
        WipItinerarioWidget::class.java, WipVisitaWidget::class.java,
        WipCreditiWidget::class.java, WipViciniWidget::class.java,
        // Undici widget nuovi (23/09/2026), in WipHomeWidgets2.kt
        WipUltimoAscoltoWidget::class.java, WipLuogoGiornoWidget::class.java,
        WipVisionWidget::class.java, WipMeteoWidget::class.java,
        WipAscoltaWidget::class.java, WipEventiWidget::class.java,
        WipGemmaRegioneWidget::class.java, WipConfrontoWidget::class.java,
        WipAltraLinguaWidget::class.java, WipGuidaStampataWidget::class.java,
        WipFotoCommunityWidget::class.java,
    )

    /** Chiede a ogni provider con almeno un widget in home di ridisegnarsi. */
    fun aggiornaTutti(context: Context) {
        pulisciUnaVoltaAlGiorno(context)
        val mgr = AppWidgetManager.getInstance(context)
        for (p in provider) {
            try {
                val ids = mgr.getAppWidgetIds(ComponentName(context, p))
                if (ids.isEmpty()) continue
                context.sendBroadcast(Intent(context, p).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                })
            } catch (e: Exception) { Log.w(TAG, "aggiornamento ${p.simpleName} fallito: ${e.message}") }
        }
    }

    /** Pulizia delle miniature vecchie (14 giorni), al massimo una volta al giorno. */
    private fun pulisciUnaVoltaAlGiorno(context: Context) {
        try {
            val prefs = WipWidgetsPlugin.prefs(context)
            val adesso = System.currentTimeMillis()
            if (adesso - prefs.getLong("pulizia", 0L) < 24L * 3600 * 1000) return
            prefs.edit().putLong("pulizia", adesso).apply()
            Thread { WipWidgetDati.pulisciMiniature(context.applicationContext) }.start()
        } catch (e: Exception) { Log.w(TAG, "pulizia miniature: ${e.message}") }
    }

    fun apri(context: Context, azione: String, requestCode: Int): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("itainta://widget/$azione"), context, MainActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    /** Stato «vuoto»: riga di invito, resto nascosto. */
    fun vuoto(views: RemoteViews, idTesto: Int, idCorpo: Int, testo: String) {
        views.setTextViewText(idTesto, testo)
        views.setViewVisibility(idTesto, View.VISIBLE)
        views.setViewVisibility(idCorpo, View.GONE)
    }
}

/** Base comune: goAsync + coroutine (miniature in rete fuori dal main thread). */
abstract class WipWidgetBase : AppWidgetProvider() {
    abstract fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val views = costruisci(context, WipWidgetDati.carica(context))
                appWidgetIds.forEach { appWidgetManager.updateAppWidget(it, views) }
            } catch (e: Exception) {
                Log.w("WipHomeWidgets", "${javaClass.simpleName}: ${e.message}")
            } finally { pending.finish() }
        }
    }
}

// ── 2. Itinerario di oggi ────────────────────────────────────────────────
class WipItinerarioWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_itinerario)
        val it = dati?.itinerario
        val tappe = it?.optJSONArray("tappe")
        v.setOnClickPendingIntent(R.id.w_it_root, WipHomeWidgets.apri(context, "itinerario", 11))
        val titolo = it?.optString("titolo").orEmpty().ifEmpty { dati?.e("itinerario", "Itinerario di oggi") ?: "Itinerario di oggi" }
        v.setTextViewText(R.id.w_it_titolo, titolo.uppercase())
        if (dati == null || it == null || tappe == null || tappe.length() == 0) {
            WipHomeWidgets.vuoto(v, R.id.w_it_vuoto, R.id.w_it_corpo, dati?.e("apri", "Apri WIP") ?: "Apri WIP per aggiornare")
            v.setTextViewText(R.id.w_it_conta, "")
            return v
        }
        v.setViewVisibility(R.id.w_it_vuoto, View.GONE)
        v.setViewVisibility(R.id.w_it_corpo, View.VISIBLE)
        val idx = it.optInt("prossimaIdx", 0).coerceIn(0, tappe.length() - 1)
        val prossima = tappe.optJSONObject(idx) ?: JSONObject()
        val totali = it.optInt("totali", 0)
        v.setTextViewText(R.id.w_it_conta, if (totali > 0) "${it.optInt("fatte", 0)}/$totali ${dati.e("fatte", "fatte")}" else "")
        v.setTextViewText(R.id.w_it_etichetta, dati.e("prossima", "Prossima tappa").uppercase())
        v.setTextViewText(R.id.w_it_icona, WipWidgetDati.simbolo(prossima.optString("tipo")))
        v.setTextViewText(R.id.w_it_nome, prossima.optString("titolo"))
        val metri: Double? = if (prossima.has("metri") && !prossima.isNull("metri")) prossima.optDouble("metri") else {
            val p = dati.posizione
            if (p != null && prossima.has("lat") && !prossima.isNull("lat") && prossima.has("lon") && !prossima.isNull("lon"))
                WipWidgetDati.metriTra(p.optDouble("lat"), p.optDouble("lon"), prossima.optDouble("lat"), prossima.optDouble("lon")) else null
        }
        val dettagli = listOfNotNull(
            prossima.optString("ora").ifEmpty { null },
            metri?.let { "${WipWidgetDati.distanza(it)} · ${WipWidgetDati.minutiAPiedi(it)} min" },
        ).joinToString("  ")
        v.setTextViewText(R.id.w_it_dettagli, dettagli)
        v.setViewVisibility(R.id.w_it_dettagli, if (dettagli.isEmpty()) View.GONE else View.VISIBLE)
        val righe = listOf(
            Triple(R.id.w_it_r1, R.id.w_it_r1_ora, R.id.w_it_r1_nome),
            Triple(R.id.w_it_r2, R.id.w_it_r2_ora, R.id.w_it_r2_nome),
            Triple(R.id.w_it_r3, R.id.w_it_r3_ora, R.id.w_it_r3_nome),
        )
        righe.forEachIndexed { i, (riga, ora, nome) ->
            val t = tappe.optJSONObject(idx + 1 + i)
            if (t == null) { v.setViewVisibility(riga, View.GONE); return@forEachIndexed }
            v.setViewVisibility(riga, View.VISIBLE)
            v.setTextViewText(ora, t.optString("ora").ifEmpty { "·" })
            v.setTextViewText(nome, "${WipWidgetDati.simbolo(t.optString("tipo"))} ${t.optString("titolo")}")
        }
        return v
    }
}

// ── 3. Continua la visita ────────────────────────────────────────────────
class WipVisitaWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_visita)
        v.setOnClickPendingIntent(R.id.w_vi_root, WipHomeWidgets.apri(context, "visita", 12))
        v.setTextViewText(R.id.w_vi_titolo, (dati?.e("visita", "Continua la visita") ?: "Continua la visita").uppercase())
        val vis = dati?.visita
        if (dati == null || vis == null || vis.optString("museo").isEmpty()) {
            WipHomeWidgets.vuoto(v, R.id.w_vi_vuoto, R.id.w_vi_corpo, dati?.e("apri", "Apri WIP") ?: "Apri WIP per aggiornare")
            v.setTextViewText(R.id.w_vi_conta, "")
            return v
        }
        v.setViewVisibility(R.id.w_vi_vuoto, View.GONE)
        v.setViewVisibility(R.id.w_vi_corpo, View.VISIBLE)
        val ascoltate = vis.optInt("ascoltate", 0); val totale = vis.optInt("totale", 0)
        v.setTextViewText(R.id.w_vi_conta, if (totale > 0) "$ascoltate/$totale" else "")
        v.setTextViewText(R.id.w_vi_museo, vis.optString("museo"))
        val prossima = vis.optString("prossima")
        v.setTextViewText(R.id.w_vi_prossima, if (prossima.isEmpty()) "" else "${dati.e("prossimaOpera", "Prossima opera")}: $prossima")
        v.setViewVisibility(R.id.w_vi_prossima, if (prossima.isEmpty()) View.GONE else View.VISIBLE)
        val sala = vis.optString("sala")
        v.setTextViewText(R.id.w_vi_sala, sala)
        v.setViewVisibility(R.id.w_vi_sala, if (sala.isEmpty()) View.GONE else View.VISIBLE)
        v.setProgressBar(R.id.w_vi_barra, totale.coerceAtLeast(1), ascoltate, false)
        v.setTextViewText(R.id.w_vi_ascoltate, "$ascoltate ${dati.e("ascoltate", "ascoltate")}")
        v.setTextViewText(R.id.w_vi_tasto, "▶ ${dati.e("visita", "Continua")}")
        val foto = WipWidgetDati.miniatura(context, vis.optString("foto"))
        if (foto != null) v.setImageViewBitmap(R.id.w_vi_foto, foto) else v.setImageViewResource(R.id.w_vi_foto, R.mipmap.ic_launcher)
        return v
    }
}

// ── 5. Crediti e Pass ────────────────────────────────────────────────────
class WipCreditiWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_crediti)
        v.setOnClickPendingIntent(R.id.w_cr_root, WipHomeWidgets.apri(context, "crediti", 13))
        val c = dati?.crediti
        if (dati == null || c == null) {
            WipHomeWidgets.vuoto(v, R.id.w_cr_vuoto, R.id.w_cr_corpo, dati?.e("apri", "Apri WIP") ?: "Apri WIP per aggiornare")
            return v
        }
        v.setViewVisibility(R.id.w_cr_vuoto, View.GONE)
        v.setViewVisibility(R.id.w_cr_corpo, View.VISIBLE)
        v.setTextViewText(R.id.w_cr_saldo, "${c.optInt("totale", 0)}")
        v.setTextViewText(R.id.w_cr_unita, dati.e("crediti", "crediti"))
        if (c.optBoolean("passAttivo", false)) {
            v.setViewVisibility(R.id.w_cr_pass, View.VISIBLE)
            val scade = c.optLong("passScade", 0)
            val cap = c.optInt("passCap", 0)
            val riga2 = buildString {
                if (scade > 0) append("${dati.e("scade", "scade alle")} ${WipWidgetDati.ora(scade)}")
                if (cap > 0) { if (isNotEmpty()) append(" · "); append("${c.optInt("passUsate", 0)}/$cap ${dati.e("guide", "guide")}") }
            }
            v.setTextViewText(R.id.w_cr_pass_titolo, "🎟 ${dati.e("pass", "Day Pass attivo")}")
            v.setTextViewText(R.id.w_cr_pass_dettaglio, riga2)
            v.setViewVisibility(R.id.w_cr_pass_dettaglio, if (riga2.isEmpty()) View.GONE else View.VISIBLE)
            v.setViewVisibility(R.id.w_cr_apri, View.GONE)
        } else {
            v.setViewVisibility(R.id.w_cr_pass, View.GONE)
            v.setViewVisibility(R.id.w_cr_apri, View.VISIBLE)
            v.setTextViewText(R.id.w_cr_apri, dati.e("apri", "Apri WIP"))
        }
        return v
    }
}

// ── 1. Vicino a te ───────────────────────────────────────────────────────
class WipViciniWidget : WipWidgetBase() {
    override fun costruisci(context: Context, dati: WipWidgetDati?): RemoteViews {
        val v = RemoteViews(context.packageName, R.layout.wip_w_vicini)
        v.setOnClickPendingIntent(R.id.w_vc_root, WipHomeWidgets.apri(context, "vicini", 14))
        v.setTextViewText(R.id.w_vc_titolo, (dati?.e("vicini", "Vicino a te") ?: "Vicino a te").uppercase())
        v.setTextViewText(R.id.w_vc_agg, dati?.let { "${it.e("aggiornato", "agg.")} ${WipWidgetDati.ora(it.ts)}" } ?: "")
        val lista = dati?.vicini
        val righe = listOf(
            intArrayOf(R.id.w_vc_r1, R.id.w_vc_r1_foto, R.id.w_vc_r1_icona, R.id.w_vc_r1_nome, R.id.w_vc_r1_dettagli, R.id.w_vc_r1_gemma),
            intArrayOf(R.id.w_vc_r2, R.id.w_vc_r2_foto, R.id.w_vc_r2_icona, R.id.w_vc_r2_nome, R.id.w_vc_r2_dettagli, R.id.w_vc_r2_gemma),
            intArrayOf(R.id.w_vc_r3, R.id.w_vc_r3_foto, R.id.w_vc_r3_icona, R.id.w_vc_r3_nome, R.id.w_vc_r3_dettagli, R.id.w_vc_r3_gemma),
            intArrayOf(R.id.w_vc_r4, R.id.w_vc_r4_foto, R.id.w_vc_r4_icona, R.id.w_vc_r4_nome, R.id.w_vc_r4_dettagli, R.id.w_vc_r4_gemma),
            intArrayOf(R.id.w_vc_r5, R.id.w_vc_r5_foto, R.id.w_vc_r5_icona, R.id.w_vc_r5_nome, R.id.w_vc_r5_dettagli, R.id.w_vc_r5_gemma),
        )
        if (dati == null || lista == null || lista.length() == 0) {
            WipHomeWidgets.vuoto(v, R.id.w_vc_vuoto, R.id.w_vc_corpo, dati?.e("nessuno", "Apri WIP per aggiornare") ?: "Apri WIP per aggiornare")
            return v
        }
        v.setViewVisibility(R.id.w_vc_vuoto, View.GONE)
        v.setViewVisibility(R.id.w_vc_corpo, View.VISIBLE)
        righe.forEachIndexed { i, ids ->
            val p = lista.optJSONObject(i)
            if (p == null) { v.setViewVisibility(ids[0], View.GONE); return@forEachIndexed }
            v.setViewVisibility(ids[0], View.VISIBLE)
            val metri = p.optDouble("metri", 0.0)
            v.setTextViewText(ids[3], p.optString("nome"))
            v.setTextViewText(ids[4], "${WipWidgetDati.distanza(metri)} · ${WipWidgetDati.minutiAPiedi(metri)} min")
            v.setViewVisibility(ids[5], if (p.optBoolean("gemma", false)) View.VISIBLE else View.GONE)
            v.setTextViewText(ids[5], dati.e("gemma", "Gemma").uppercase())
            val foto = WipWidgetDati.miniatura(context, p.optString("foto"))
            if (foto != null) {
                v.setImageViewBitmap(ids[1], foto)
                v.setViewVisibility(ids[1], View.VISIBLE); v.setViewVisibility(ids[2], View.GONE)
            } else {
                v.setTextViewText(ids[2], WipWidgetDati.simbolo(p.optString("categoria")))
                v.setViewVisibility(ids[1], View.GONE); v.setViewVisibility(ids[2], View.VISIBLE)
            }
            val id = p.optString("id")
            if (id.matches(Regex("^[A-Za-z0-9_.:-]{1,80}$"))) {
                v.setOnClickPendingIntent(ids[0], WipHomeWidgets.apri(context, "poi/$id", 100 + i))
            }
        }
        return v
    }
}
