package com.itaintasca.app.service

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import org.json.JSONObject

/**
 * (SEC-10) Scope UNICO per il lavoro di rete dello storico ascolti.
 *
 * Prima ogni recordListening e ogni setUserContext lanciavano un
 * `CoroutineScope(Dispatchers.IO).launch` fire-and-forget: senza tetto di
 * tempo (una rete zombie teneva il thread appeso per sempre) e senza
 * serializzazione (due flush in parallelo leggevano la stessa coda pending e
 * inserivano due volte la stessa riga). Ora: SupervisorJob (un fallimento
 * non abbatte gli altri), un Mutex che serializza sync e flush, e
 * withTimeout(20 s) per chiamata.
 */
object HistoryScope {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val mutex = Mutex()
    const val CALL_TIMEOUT_MS = 20_000L
}

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
 * (SEC-02, 28/08/2026) CHIAVI PER UTENTE. Prima il mirror era una chiave
 * globale (`listened_poi_ids`): l'utente B, sullo stesso telefono, trovava
 * "già acquistati" i POI ascoltati da A; e la coda pending, senza user_id,
 * veniva assegnata a chi era loggato al momento del flush. Ora:
 *  - `listened_poi_ids_<userId>` e `listened_pending_sync_<userId>`;
 *  - senza utente loggato non c'e' mirror e isAlreadyPurchased = false;
 *  - ogni voce pending porta `user_id` e viene scartata se non e' quello
 *    corrente;
 *  - migrazione una tantum: la vecchia chiave globale passa sotto l'utente
 *    corrente alla prima lettura e viene cancellata.
 *
 * Stesse chiavi prefs del port iOS (ListeningHistoryStore in
 * WipSupabaseClient.swift): tenere allineati (anche il suffisso utente).
 */
object ListeningHistoryStore {
    private const val TAG = "ListeningHistory"
    private const val PREFS_NAME = "ItaintaPrefs"
    /** Chiave LEGACY globale: sopravvive solo per la migrazione. */
    const val PREF_LISTENED_IDS = "listened_poi_ids"
    /** Chiave LEGACY globale della coda pending: solo per la migrazione. */
    const val PREF_PENDING = "listened_pending_sync"
    const val PREF_USER_ID = "wip_user_id"
    const val PREF_ACCESS_TOKEN = "wip_supabase_token"

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun idsKey(userId: String) = "${PREF_LISTENED_IDS}_$userId"
    private fun pendingKey(userId: String) = "${PREF_PENDING}_$userId"

    /** Utente corrente dallo store cifrato; "" se nessuno e' loggato. */
    private fun currentUserId(context: Context): String = try {
        SecurePrefs.get(context).getString(PREF_USER_ID, "") ?: ""
    } catch (_: Exception) {
        ""
    }

    // Mirror in memoria (userId → id ascoltati): evita di deserializzare
    // lo StringSet a ogni trigger. Azzerato da clearMemory() al logout.
    @Volatile private var cacheUserId: String? = null
    @Volatile private var cacheIds: Set<String> = emptySet()

    /** Da chiamare al logout (clearUserContext) e al cambio utente. */
    fun clearMemory() {
        synchronized(this) {
            cacheUserId = null
            cacheIds = emptySet()
        }
    }

    /**
     * Migrazione una tantum della chiave globale: gli id e le voci pending
     * senza utente passano sotto l'utente CORRENTE (l'unico a cui e'
     * ragionevole attribuirli: e' chi sta usando il telefono adesso) e la
     * chiave globale viene rimossa. Va chiamata sotto synchronized(this).
     */
    private fun migrateLegacyLocked(p: SharedPreferences, userId: String) {
        if (userId.isBlank()) return
        if (!p.contains(PREF_LISTENED_IDS) && !p.contains(PREF_PENDING)) return
        try {
            val legacyIds = p.getStringSet(PREF_LISTENED_IDS, emptySet()) ?: emptySet()
            val legacyPending = p.getStringSet(PREF_PENDING, emptySet()) ?: emptySet()
            val ids = (p.getStringSet(idsKey(userId), emptySet()) ?: emptySet()).toMutableSet()
            ids.addAll(legacyIds)
            val pending = (p.getStringSet(pendingKey(userId), emptySet()) ?: emptySet()).toMutableSet()
            for (raw in legacyPending) {
                try {
                    val o = JSONObject(raw)
                    if (!o.has("user_id")) o.put("user_id", userId)
                    pending.add(o.toString())
                } catch (_: Exception) { /* voce corrotta: si scarta */ }
            }
            p.edit()
                .putStringSet(idsKey(userId), ids)
                .putStringSet(pendingKey(userId), pending)
                .remove(PREF_LISTENED_IDS)
                .remove(PREF_PENDING)
                .apply()
            Log.d(TAG, "Mirror legacy migrato sotto l'utente corrente (${legacyIds.size} id, ${legacyPending.size} pending)")
        } catch (e: Exception) {
            Log.w(TAG, "Migrazione mirror legacy fallita: ${e.message}")
        }
    }

    /** Id ascoltati dell'utente indicato (con migrazione e cache). */
    private fun idsFor(context: Context, userId: String): Set<String> {
        if (userId.isBlank()) return emptySet()
        synchronized(this) {
            if (cacheUserId == userId) return cacheIds
            val p = prefs(context)
            migrateLegacyLocked(p, userId)
            val ids = (p.getStringSet(idsKey(userId), emptySet()) ?: emptySet()).toSet()
            cacheUserId = userId
            cacheIds = ids
            return ids
        }
    }

    /** Mirror locale, vale anche offline. In dubbio (o senza utente): NON acquistato. */
    fun isAlreadyPurchased(context: Context, poiId: String): Boolean = try {
        if (poiId.isBlank()) false
        else {
            val userId = currentUserId(context)
            userId.isNotBlank() && idsFor(context, userId).contains(poiId)
        }
    } catch (_: Exception) {
        false
    }

    /**
     * Registra un ascolto completato: mirror subito (sincrono, vale anche
     * offline), poi insert cloud best-effort nello scope serializzato
     * (HistoryScope) per non bloccare il receiver/servizio. Se il cloud
     * fallisce la voce resta in coda pending e viene ritentata alla prossima
     * sync. Senza utente loggato non si registra nulla: non c'e' a chi
     * attribuire l'ascolto.
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
        val userId = currentUserId(appContext)
        if (userId.isBlank()) {
            Log.d(TAG, "recordListening ignorato: nessun utente loggato")
            return
        }
        try {
            synchronized(this) {
                val p = prefs(appContext)
                migrateLegacyLocked(p, userId)
                // Copie difensive: i StringSet restituiti dalle prefs non vanno mai mutati
                val ids = (p.getStringSet(idsKey(userId), emptySet()) ?: emptySet()).toMutableSet()
                val pending = (p.getStringSet(pendingKey(userId), emptySet()) ?: emptySet()).toMutableSet()
                ids.add(poiId)
                pending.add(JSONObject().apply {
                    put("user_id", userId)
                    put("poi_id", poiId)
                    put("poi_name", poiName?.takeIf { it.isNotBlank() } ?: "Luogo d'interesse")
                    put("category", category?.takeIf { it.isNotBlank() } ?: "Altro")
                    if (!imageUrl.isNullOrBlank()) put("image_url", imageUrl)
                }.toString())
                p.edit()
                    .putStringSet(idsKey(userId), ids)
                    .putStringSet(pendingKey(userId), pending)
                    .apply()
                cacheUserId = userId
                cacheIds = ids.toSet()
            }
        } catch (e: Exception) {
            Log.w(TAG, "recordListening mirror failed: ${e.message}")
        }
        // Cloud best-effort, serializzato e con tetto di tempo (SEC-10)
        HistoryScope.scope.launch {
            try {
                HistoryScope.mutex.withLock {
                    withTimeout(HistoryScope.CALL_TIMEOUT_MS) { flushPendingLocked(appContext) }
                }
            } catch (e: Exception) {
                Log.w(TAG, "flush pending: ${e.message}")
            }
        }
    }

    /**
     * All'avvio del servizio (e quando il JS aggiorna l'identità utente):
     * scarica gli id dallo storico cloud e li UNISCE al mirror DELL'UTENTE
     * (mai sostituire: gli ascolti offline non ancora sincronizzati non vanno
     * persi), poi ritenta l'upload dei pending. Serializzata dal mutex di
     * HistoryScope e con tetto di 20 s (SEC-10).
     */
    suspend fun syncFromCloud(context: Context) {
        val appContext = context.applicationContext
        try {
            HistoryScope.mutex.withLock {
                withTimeout(HistoryScope.CALL_TIMEOUT_MS) { syncFromCloudLocked(appContext) }
            }
        } catch (e: Exception) {
            Log.w(TAG, "syncFromCloud failed: ${e.message}")
        }
    }

    private suspend fun syncFromCloudLocked(appContext: Context) {
        if (!com.itaintasca.app.offline.ConnectivityMonitor.isOnline(appContext)) return
        val p = prefs(appContext)
        // userId/accessToken vivono nello store cifrato (SecurePrefs), non
        // più in chiaro dentro "ItaintaPrefs".
        val securePrefs = SecurePrefs.get(appContext)
        val userId = securePrefs.getString(PREF_USER_ID, "") ?: ""
        if (userId.isBlank()) return
        val token = securePrefs.getString(PREF_ACCESS_TOKEN, "") ?: ""
        val cloudIds = SupabaseClient(appContext).fetchListeningHistoryPoiIds(userId, token) ?: return
        synchronized(this) {
            migrateLegacyLocked(p, userId)
            val ids = (p.getStringSet(idsKey(userId), emptySet()) ?: emptySet()).toMutableSet()
            ids.addAll(cloudIds)
            p.edit().putStringSet(idsKey(userId), ids).apply()
            cacheUserId = userId
            cacheIds = ids.toSet()
        }
        Log.d(TAG, "Mirror synced: ${cloudIds.size} listened POIs from cloud (utente $userId)")
        flushPendingLocked(appContext)
    }

    /**
     * Ritenta l'insert cloud delle voci pending DELL'UTENTE CORRENTE. Una
     * voce con `user_id` diverso (o assente) viene scartata: non si
     * attribuisce mai un ascolto a un altro account. Best-effort, mai
     * eccezioni. Va chiamata sotto HistoryScope.mutex.
     */
    private suspend fun flushPendingLocked(appContext: Context) {
        try {
            if (!com.itaintasca.app.offline.ConnectivityMonitor.isOnline(appContext)) return
            val p = prefs(appContext)
            // userId/accessToken: stesso store cifrato di syncFromCloud.
            val securePrefs = SecurePrefs.get(appContext)
            val userId = securePrefs.getString(PREF_USER_ID, "") ?: ""
            if (userId.isBlank()) return
            val token = securePrefs.getString(PREF_ACCESS_TOKEN, "") ?: ""
            val pending = synchronized(this) {
                migrateLegacyLocked(p, userId)
                (p.getStringSet(pendingKey(userId), emptySet()) ?: emptySet()).toList()
            }
            if (pending.isEmpty()) return
            val client = SupabaseClient(appContext)
            val done = mutableSetOf<String>()
            for (raw in pending) {
                try {
                    val o = JSONObject(raw)
                    val owner = o.optString("user_id", "")
                    if (owner != userId) {
                        // Voce di un altro utente (o senza proprietario) finita
                        // nella coda sbagliata: via, senza inviarla.
                        Log.w(TAG, "Voce pending scartata: user_id '$owner' ≠ utente corrente")
                        done.add(raw)
                        continue
                    }
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
                    val rest = (p.getStringSet(pendingKey(userId), emptySet()) ?: emptySet()).toMutableSet()
                    rest.removeAll(done)
                    p.edit().putStringSet(pendingKey(userId), rest).apply()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "flushPending failed: ${e.message}")
        }
    }
}
