package com.itaintasca.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.location.Location
import android.util.Log
import android.widget.RemoteViews
import com.itaintasca.app.MainActivity
import com.itaintasca.app.R
import com.itaintasca.app.db.PoiDatabase
import com.itaintasca.app.db.PoiEntity
import com.itaintasca.app.service.WebViewPrefs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Locale

/**
 * Widget home screen "WipWidget": saldo crediti, prossima tappa dell'itinerario
 * attivo e POI più vicino con distanza. Brand WIP (sfondo blu #1e3a8a).
 *
 * FONTI DATI (in ordine di preferenza):
 *  1. CapacitorStorage — chiavi che il WebView popolerà:
 *     wip_widget_credits, wip_widget_next_stop, wip_widget_nearest_poi
 *     (vedi WebViewPrefs per il contratto).
 *  2. Fallback nativi già esistenti:
 *     - crediti → snapshot "wallet_snapshot_credits" (ItaintaPrefs, spinto
 *       dal JS via ItaintaBackgroundPoiPlugin.setWalletBalance);
 *     - POI più vicino / prossima tappa → Room (poi_cache) + ultima posizione
 *       persistita dal servizio ("lastFixLat"/"lastFixLon" in ItaintaPrefs).
 *
 * AGGIORNAMENTO: updatePeriodMillis 30 min (wip_widget_info.xml), tap sul
 * simbolo ⟳ per il refresh manuale, push best-effort dal servizio dopo ogni
 * fetch POI (pushUpdate). Tap sul corpo del widget → apre l'app.
 */
class WipWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val TAG = "WipWidget"
        const val ACTION_REFRESH = "com.itaintasca.app.widget.REFRESH"

        /**
         * Aggiornamento push (chiamato dal servizio dopo un fetch POI riuscito):
         * best-effort, non fa nulla se non ci sono widget sulla home.
         */
        fun pushUpdate(context: Context) {
            try {
                val mgr = AppWidgetManager.getInstance(context)
                val ids = mgr.getAppWidgetIds(ComponentName(context, WipWidgetProvider::class.java))
                if (ids.isEmpty()) return
                val intent = Intent(context, WipWidgetProvider::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                }
                context.sendBroadcast(intent)
            } catch (e: Exception) {
                Log.w(TAG, "pushUpdate fallito: ${e.message}")
            }
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        // Room va interrogato fuori dal main thread: goAsync tiene vivo il
        // receiver finché la coroutine non ha finito (ben sotto i 10s limite).
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val views = buildViews(context)
                appWidgetIds.forEach { id -> appWidgetManager.updateAppWidget(id, views) }
            } catch (e: Exception) {
                Log.w(TAG, "Aggiornamento widget fallito: ${e.message}")
            } finally {
                pending.finish()
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_REFRESH) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, WipWidgetProvider::class.java))
            if (ids.isNotEmpty()) onUpdate(context, mgr, ids)
        }
    }

    private suspend fun buildViews(context: Context): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.wip_widget)
        val itainta = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val empty = context.getString(R.string.wip_widget_empty_value)

        // ── 1) Saldo crediti ─────────────────────────────────────────────
        val credits = WebViewPrefs.getString(context, WebViewPrefs.KEY_WIDGET_CREDITS)
            ?.takeIf { it.isNotBlank() }
            ?: itainta.takeIf { it.contains("wallet_snapshot_credits") }
                ?.getInt("wallet_snapshot_credits", 0)?.toString()
        views.setTextViewText(
            R.id.wip_widget_credits,
            if (credits != null) context.getString(R.string.wip_widget_credits_fmt, credits) else empty
        )

        // ── 2+3) Prossima tappa e POI più vicino ─────────────────────────
        var nextStop = WebViewPrefs.getString(context, WebViewPrefs.KEY_WIDGET_NEXT_STOP)
            ?.takeIf { it.isNotBlank() }
        var nearest = WebViewPrefs.getString(context, WebViewPrefs.KEY_WIDGET_NEAREST_POI)
            ?.takeIf { it.isNotBlank() }?.let { formatNearestFromPref(it) }

        if (nextStop == null || nearest == null) {
            try {
                // Ultima posizione persistita dal servizio a ogni fix GPS
                val lat = itainta.getFloat("lastFixLat", 0f)
                val lon = itainta.getFloat("lastFixLon", 0f)
                if (lat != 0f || lon != 0f) {
                    val here = Location("widget").apply {
                        latitude = lat.toDouble()
                        longitude = lon.toDouble()
                    }
                    val pois = PoiDatabase.getInstance(context).poiDao().getAllPois()
                    if (pois.isNotEmpty()) {
                        val withDist = pois.map { it to distanceTo(here, it) }
                        if (nearest == null) {
                            withDist.minByOrNull { it.second }?.let { (poi, dist) ->
                                nearest = "${poi.nome} · ${formatDistance(dist)}"
                            }
                        }
                        if (nextStop == null) {
                            // Prossima tappa = la più vicina tra i POI marcati
                            // isFromItinerary (sync dal JS via syncManualSelection)
                            withDist.filter { it.first.isFromItinerary }
                                .minByOrNull { it.second }
                                ?.let { (poi, dist) ->
                                    nextStop = "${poi.nome} · ${formatDistance(dist)}"
                                }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Lettura Room per il widget fallita: ${e.message}")
            }
        }

        views.setTextViewText(R.id.wip_widget_next_stop, nextStop ?: empty)
        views.setTextViewText(R.id.wip_widget_nearest, nearest ?: empty)

        // ── Tap: corpo → apre l'app; ⟳ → refresh del widget ──────────────
        val openIntent = Intent(context, MainActivity::class.java)
        views.setOnClickPendingIntent(
            R.id.wip_widget_root,
            PendingIntent.getActivity(context, 0, openIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        )
        val refreshIntent = Intent(context, WipWidgetProvider::class.java).apply { action = ACTION_REFRESH }
        views.setOnClickPendingIntent(
            R.id.wip_widget_refresh,
            PendingIntent.getBroadcast(context, 1, refreshIntent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        )
        return views
    }

    private fun distanceTo(here: Location, poi: PoiEntity): Float {
        val poiLoc = Location("").apply {
            latitude = poi.entranceLat ?: poi.lat
            longitude = poi.entranceLon ?: poi.lon
        }
        return here.distanceTo(poiLoc)
    }

    /** Formato pref: "Nome POI|123" (metri) oppure solo il nome. */
    private fun formatNearestFromPref(raw: String): String {
        val parts = raw.split("|")
        val name = parts[0].trim()
        val meters = parts.getOrNull(1)?.trim()?.toFloatOrNull()
        return if (meters != null) "$name · ${formatDistance(meters)}" else name
    }

    private fun formatDistance(meters: Float): String =
        if (meters < 1000f) "${meters.toInt()} m"
        else String.format(Locale.ITALY, "%.1f km", meters / 1000f)
}
