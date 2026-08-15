package com.itaintasca.app.service

import android.content.Context
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Storico ascolti lato nativo: mirror locale (SharedPreferences) dei poi_id
 * già ascoltati + registrazione best-effort su user_listening_history.
 *
 * Un POI già nello storico è già "acquistato": il trigger in background lo
 * riproduce GRATIS senza consumare il Day Pass né chiedere pagamento, come
 * fa il web (dayPassService.authorizeGuidePlayback).
 *
 * Il mirror viene sincronizzato all'avvio del servizio scaricando gli id dal
 * cloud (syncFromCloud), così il check funziona anche offline. Gli ascolti
 * registrati offline finiscono in una coda pending e vengono ritentati alla
 * prossima sync. Fail-closed: in dubbio il POI NON è considerato acquistato
 * (si applica il comportamento attuale: Day Pass o pagamento).
 *
 * Stesse chiavi prefs del port iOS (ListeningHistoryStore in
 * WipSupabaseClient.swift): tenere allineati.
 */
object ListeningHistoryStore {
    private const val TAG = "ListeningHistory"
    private const val PREFS_NAME = "ItaintaPrefs"
    const val PREF_LISTENED_IDS = "listened_poi_ids"
    const val PREF_PENDING = "listened_pending_sync"
    const val PREF_USER_ID = "wip_user_id"
    const val PREF_ACCESS_TOKEN = "wip_supabase_token"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** Mirror locale, vale anche offline. In dubbio: NON acquistato. */
    fun isAlreadyPurchased(context: Context, poiId: String): Boolean = try {
        poiId.isNotBlank() &&
            prefs(context).getStringSet(PREF_LISTENED_IDS, emptySet())?.contains(poiId) == true
    } catch (_: Exception) {
        false
    }

    /**
     * Registra un ascolto completato: mirror subito (sincrono, vale anche
     * offline), poi insert cloud best-effort in una coroutine separata per
     * non bloccare il receiver/servizio. Se il cloud fallisce la voce resta
     * in coda pending e viene ritentata alla prossima sync.
     */
    fun recordListening(
        context: Context,
        poiId: String,
        poiName: String?,
        category: String?,
        imageUrl: String? = null
    ) {
        if (poiId.isBlank()) return
        val appContext = context.applicationContext
        try {
            synchronized(this) {
                val p = prefs(appContext)
                // Copie difensive: i StringSet restituiti dalle prefs non vanno mai mutati
                val ids = (p.getStringSet(PREF_LISTENED_IDS, emptySet()) ?: emptySet()).toMutableSet()
                val pending = (p.getStringSet(PREF_PENDING, emptySet()) ?: emptySet()).toMutableSet()
                ids.add(poiId)
                pending.add(JSONObject().apply {
                    put("poi_id", poiId)
                    put("poi_name", poiName?.takeIf { it.isNotBlank() } ?: "Luogo d'interesse")
                    put("category", category?.takeIf { it.isNotBlank() } ?: "Altro")
                    if (!imageUrl.isNullOrBlank()) put("image_url", imageUrl)
                }.toString())
                p.edit()
                    .putStringSet(PREF_LISTENED_IDS, ids)
                    .putStringSet(PREF_PENDING, pending)
                    .apply()
            }
        } catch (e: Exception) {
            Log.w(TAG, "recordListening mirror failed: ${e.message}")
        }
        // Cloud best-effort, fuori dal ciclo di vita del chiamante
        CoroutineScope(Dispatchers.IO).launch { flushPending(appContext) }
    }

    /**
     * All'avvio del servizio (e quando il JS aggiorna l'identità utente):
     * scarica gli id dallo storico cloud e li UNISCE al mirror (mai
     * sostituire: gli ascolti offline non ancora sincronizzati non vanno
     * persi), poi ritenta l'upload dei pending.
     */
    suspend fun syncFromCloud(context: Context) {
        val appContext = context.applicationContext
        try {
            if (!com.itaintasca.app.offline.ConnectivityMonitor.isOnline(appContext)) return
            val p = prefs(appContext)
            // userId/accessToken vivono nello store cifrato (SecurePrefs), non
            // più in chiaro dentro "ItaintaPrefs".
            val securePrefs = SecurePrefs.get(appContext)
            val userId = securePrefs.getString(PREF_USER_ID, "") ?: ""
            if (userId.isBlank()) return
            val token = securePrefs.getString(PREF_ACCESS_TOKEN, "") ?: ""
            val cloudIds = SupabaseClient().fetchListeningHistoryPoiIds(userId, token) ?: return
            synchronized(this) {
                val ids = (p.getStringSet(PREF_LISTENED_IDS, emptySet()) ?: emptySet()).toMutableSet()
                ids.addAll(cloudIds)
                p.edit().putStringSet(PREF_LISTENED_IDS, ids).apply()
            }
            Log.d(TAG, "Mirror synced: ${cloudIds.size} listened POIs from cloud")
            flushPending(appContext)
        } catch (e: Exception) {
            Log.w(TAG, "syncFromCloud failed: ${e.message}")
        }
    }

    /** Ritenta l'insert cloud delle voci pending. Best-effort, mai eccezioni. */
    private suspend fun flushPending(appContext: Context) {
        try {
            if (!com.itaintasca.app.offline.ConnectivityMonitor.isOnline(appContext)) return
            val p = prefs(appContext)
            // userId/accessToken: stesso store cifrato di syncFromCloud.
            val securePrefs = SecurePrefs.get(appContext)
            val userId = securePrefs.getString(PREF_USER_ID, "") ?: ""
            if (userId.isBlank()) return
            val token = securePrefs.getString(PREF_ACCESS_TOKEN, "") ?: ""
            val pending = (p.getStringSet(PREF_PENDING, emptySet()) ?: emptySet()).toList()
            if (pending.isEmpty()) return
            val client = SupabaseClient()
            val done = mutableSetOf<String>()
            for (raw in pending) {
                try {
                    val o = JSONObject(raw)
                    val ok = client.recordListeningHistory(
                        userId = userId,
                        accessToken = token,
                        poiId = o.optString("poi_id"),
                        poiName = o.optString("poi_name", "Luogo d'interesse"),
                        category = o.optString("category", "Altro"),
                        imageUrl = o.optString("image_url", "").takeIf { it.isNotBlank() }
                    )
                    if (ok) done.add(raw)
                } catch (_: Exception) { /* resta pending */ }
            }
            if (done.isNotEmpty()) {
                synchronized(this) {
                    val rest = (p.getStringSet(PREF_PENDING, emptySet()) ?: emptySet()).toMutableSet()
                    rest.removeAll(done)
                    p.edit().putStringSet(PREF_PENDING, rest).apply()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "flushPending failed: ${e.message}")
        }
    }
}
