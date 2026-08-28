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
 * (29/08/2026) POSSESSO. «Chi acquista un'audioguida non la paga mai piu':
 * quel POI e' suo, in tutte le lingue e con tutti i personaggi.» Il registro
 * vero e' `user_poi_purchases`, che solo il server scrive dopo un addebito
 * riuscito; lo storico ascolti qui sopra NON e' piu' la fonte di verita' (e'
 * scrivibile dal client e "ascoltato" non vuol dire "pagato"). Questo store
 * ne tiene un mirror per utente — `owned_poi_ids_<userId>` — perche' il
 * trigger in background deve decidere a schermo spento e senza rete. Lo
 * storico resta come RIPIEGO, mai come prova contraria: se il mirror nuovo
 * non e' ancora sceso, un POI nello storico si riascolta gratis lo stesso.
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
    /**
     * POSSESSO (29/08/2026). Prefisso del mirror di `user_poi_purchases`:
     * la chiave reale e' `owned_poi_ids_<userId>`. NON si riusa quella dello
     * storico: lo storico dice "ascoltato" (scrivibile dal client, e da ieri
     * non e' piu' una prova di acquisto), questa dice "e' suo per sempre".
     */
    const val PREF_OWNED_IDS = "owned_poi_ids"
    /** Ultima sync del possesso, per utente: `owned_sync_at_<userId>` (ms). */
    const val PREF_OWNED_SYNC_AT = "owned_sync_at"
    /** Il registro si rilegge al massimo ogni 6 ore (o se il mirror e' vuoto). */
    private const val OWNED_SYNC_EVERY_MS = 6L * 60 * 60 * 1000

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun idsKey(userId: String) = "${PREF_LISTENED_IDS}_$userId"
    private fun pendingKey(userId: String) = "${PREF_PENDING}_$userId"
    private fun ownedKey(userId: String) = "${PREF_OWNED_IDS}_$userId"
    private fun ownedSyncAtKey(userId: String) = "${PREF_OWNED_SYNC_AT}_$userId"

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

    // Stessa cosa per il POSSESSO (owned_poi_ids_<userId>): letto a ogni
    // trigger, quindi mai dalle prefs due volte di fila.
    @Volatile private var ownedCacheUserId: String? = null
    @Volatile private var ownedCacheIds: Set<String> = emptySet()

    /** Da chiamare al logout (clearUserContext) e al cambio utente. */
    fun clearMemory() {
        synchronized(this) {
            cacheUserId = null
            cacheIds = emptySet()
            ownedCacheUserId = null
            ownedCacheIds = emptySet()
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

    /** Id POSSEDUTI dell'utente indicato (mirror di user_poi_purchases). */
    private fun ownedFor(context: Context, userId: String): Set<String> {
        if (userId.isBlank()) return emptySet()
        synchronized(this) {
            if (ownedCacheUserId == userId) return ownedCacheIds
            val ids = (prefs(context).getStringSet(ownedKey(userId), emptySet()) ?: emptySet()).toSet()
            ownedCacheUserId = userId
            ownedCacheIds = ids
            return ids
        }
    }

    /**
     * Aggiunge un POI al mirror del possesso: da chiamare SOLO dopo un
     * addebito a crediti chiesto esplicitamente dall'utente (mai per il Day
     * Pass, che e' accesso a tempo e non possesso, e mai per un'anteprima
     * 402). Il registro vero resta `user_poi_purchases` sul server: questo e'
     * l'anticipo locale, perche' il riascolto offline subito dopo l'acquisto
     * deve essere gratis anche senza rete.
     */
    fun markOwned(context: Context, poiId: String) {
        if (poiId.isBlank()) return
        val appContext = context.applicationContext
        val userId = currentUserId(appContext)
        if (userId.isBlank()) return
        try {
            synchronized(this) {
                val p = prefs(appContext)
                val ids = (p.getStringSet(ownedKey(userId), emptySet()) ?: emptySet()).toMutableSet()
                if (!ids.add(poiId)) return
                p.edit().putStringSet(ownedKey(userId), ids).apply()
                ownedCacheUserId = userId
                ownedCacheIds = ids.toSet()
            }
            Log.d(TAG, "Possesso locale: $poiId e' ora dell'utente")
        } catch (e: Exception) {
            Log.w(TAG, "markOwned fallita: ${e.message}")
        }
    }

    /**
     * DIRITTO A RIASCOLTARE GRATIS (29/08/2026).
     *
     * Ordine: prima il mirror del POSSESSO (`owned_poi_ids_<userId>`, copia
     * di user_poi_purchases, la fonte di verita' anche per il server); se il
     * POI non c'e', si ripiega sul vecchio mirror degli ascolti. Il ripiego
     * NON e' pigrizia: il backfill ha importato nel registro gli acquisti
     * storici, ma un telefono appena aggiornato e offline puo' non aver
     * ancora scaricato il mirror nuovo — e fra "fargli ripagare un POI che e'
     * suo" e "regalargli un riascolto" si sceglie sempre il secondo.
     *
     * Nessuna rete qui: si legge solo dalle prefs, il trigger deve restare
     * istantaneo. Senza utente: false (fail-closed), come prima.
     */
    fun isAlreadyPurchased(context: Context, poiId: String): Boolean = try {
        if (poiId.isBlank()) false
        else {
            val userId = currentUserId(context)
            userId.isNotBlank() &&
                (ownedFor(context, userId).contains(poiId) || idsFor(context, userId).contains(poiId))
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
        // POSSESSO: giro a parte, con il SUO tetto di tempo. Accodarlo dentro
        // quello dello storico voleva dire che una rete lenta consumava i 20 s
        // in due chiamate e ne moriva una delle due, a caso; cosi' invece ne
        // fallisce al massimo una, e l'altra fa comunque il suo lavoro. Resta
        // dentro lo stesso mutex: mai due giri di rete in parallelo.
        try {
            HistoryScope.mutex.withLock {
                withTimeout(HistoryScope.CALL_TIMEOUT_MS) { syncOwnershipEntryLocked(appContext) }
            }
        } catch (e: Exception) {
            Log.w(TAG, "syncOwnership failed: ${e.message}")
        }
    }

    /** Legge identita' e stato rete, poi delega a syncOwnershipLocked. */
    private suspend fun syncOwnershipEntryLocked(appContext: Context) {
        if (!com.itaintasca.app.offline.ConnectivityMonitor.isOnline(appContext)) return
        val securePrefs = SecurePrefs.get(appContext)
        val userId = securePrefs.getString(PREF_USER_ID, "") ?: ""
        if (userId.isBlank()) return
        val token = securePrefs.getString(PREF_ACCESS_TOKEN, "") ?: ""
        syncOwnershipLocked(appContext, userId, token)
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
     * Scarica il registro `user_poi_purchases` e lo specchia in
     * `owned_poi_ids_<userId>`. Va chiamata sotto HistoryScope.mutex.
     *
     * Frequenza: al massimo una volta ogni 6 ore, tranne quando il mirror e'
     * vuoto (primo avvio dopo l'aggiornamento: li' serve subito, altrimenti
     * il possesso resterebbe appeso al solo ripiego sullo storico).
     *
     * UNIONE, mai sostituzione: il server e' l'unico che scrive il registro,
     * ma gli id segnati da markOwned dopo un addebito OFFLINE non sono ancora
     * arrivati lassu' (la riconciliazione la fa il JS quando torna la rete).
     * Sostituire vorrebbe dire far sparire un acquisto appena fatto e farlo
     * ripagare: il possesso non si toglie mai da qui.
     *
     * FAIL-SAFE: se la lettura fallisce (rete, 401, RLS) non si tocca niente
     * e non si aggiorna il timestamp: si riproverA' al giro dopo, e nel
     * frattempo vale il mirror che c'e'. Mai svuotarlo su un errore.
     */
    private suspend fun syncOwnershipLocked(appContext: Context, userId: String, token: String) {
        try {
            if (userId.isBlank() || token.isBlank()) return
            val p = prefs(appContext)
            val locali = (p.getStringSet(ownedKey(userId), emptySet()) ?: emptySet())
            val ultimaSync = p.getLong(ownedSyncAtKey(userId), 0L)
            val scaduta = System.currentTimeMillis() - ultimaSync > OWNED_SYNC_EVERY_MS
            if (!scaduta && locali.isNotEmpty()) return
            val cloudIds = SupabaseClient(appContext).fetchOwnedPoiIds(userId, token)
            if (cloudIds == null) {
                Log.w(TAG, "Possesso: lettura di user_poi_purchases fallita, resta il mirror locale")
                return
            }
            synchronized(this) {
                val aggiornati = (p.getStringSet(ownedKey(userId), emptySet()) ?: emptySet()).toMutableSet()
                aggiornati.addAll(cloudIds)
                p.edit()
                    .putStringSet(ownedKey(userId), aggiornati)
                    .putLong(ownedSyncAtKey(userId), System.currentTimeMillis())
                    .apply()
                ownedCacheUserId = userId
                ownedCacheIds = aggiornati.toSet()
            }
            Log.d(TAG, "Possesso: ${cloudIds.size} POI dal registro (utente $userId)")
        } catch (e: Exception) {
            Log.w(TAG, "syncOwnership fallita: ${e.message}")
        }
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
