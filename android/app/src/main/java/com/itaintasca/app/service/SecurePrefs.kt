package com.itaintasca.app.service

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Storage cifrato per i soli dati sensibili di identità utente (userId,
 * accessToken Supabase — vedi ItaintaBackgroundPoiPlugin.setUserContext).
 *
 * Prima vivevano in chiaro dentro "ItaintaPrefs" insieme a decine di altre
 * chiavi non sensibili (raggi, categorie, stato servizio, ...), che restano
 * SharedPreferences normali: cifrare tutto il file avrebbe un costo di I/O
 * inutile per dati che non sono un token di sessione.
 *
 * Il file "ItaintaSecurePrefs" è protetto da una master key AES256-GCM
 * gestita dall'Android Keystore (androidx.security.crypto / Tink).
 *
 * (SEC-08, 28/08/2026) RIPIEGO IN CHIARO: se il Keystore non e' disponibile
 * si ricade su SharedPreferences normali, ma in un file DIVERSO
 * ("ItaintaSecurePrefs_fallback"): prima si usava lo STESSO nome del file
 * cifrato, e al ritorno del Keystore EncryptedSharedPreferences trovava
 * valori in chiaro dove si aspettava ciphertext (crash o perdita dei dati).
 * Nel ripiego il servizio e' `isDegraded` e l'ACCESS TOKEN NON viene mai
 * salvato su disco: resta il solo userId (che serve alle chiavi per utente
 * dello storico). Le chiamate autenticate degradano al ruolo anon.
 */
object SecurePrefs {
    private const val TAG = "SecurePrefs"
    private const val FILE_NAME = "ItaintaSecurePrefs"
    private const val FALLBACK_FILE_NAME = "ItaintaSecurePrefs_fallback"
    private const val LEGACY_PREFS_NAME = "ItaintaPrefs"

    @Volatile
    private var instance: SharedPreferences? = null

    /** true = Keystore non disponibile, store in chiaro senza token. */
    @Volatile
    var isDegraded: Boolean = false
        private set

    fun get(context: Context): SharedPreferences {
        instance?.let { return it }
        synchronized(this) {
            instance?.let { return it }
            val appContext = context.applicationContext
            val created = try {
                val masterKey = MasterKey.Builder(appContext)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                val secure = EncryptedSharedPreferences.create(
                    appContext,
                    FILE_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
                isDegraded = false
                secure
            } catch (e: Exception) {
                // Non deve mai bloccare login/servizio: se il Keystore non è
                // disponibile (dispositivo rotto, downgrade OS, ecc.) si
                // ricade su SharedPreferences normali invece di crashare —
                // in un file separato e SENZA token (vedi sopra).
                Log.e(TAG, "EncryptedSharedPreferences non disponibile, ripiego in chiaro (senza token): ${e.message}")
                isDegraded = true
                val fallback = appContext.getSharedPreferences(FALLBACK_FILE_NAME, Context.MODE_PRIVATE)
                // Un token eventualmente scritto da una versione precedente nel
                // file di ripiego va tolto: in chiaro non deve restare.
                if (fallback.contains(ListeningHistoryStore.PREF_ACCESS_TOKEN)) {
                    fallback.edit().remove(ListeningHistoryStore.PREF_ACCESS_TOKEN).apply()
                }
                fallback
            }
            migrateLegacyValues(appContext, created)
            instance = created
            return created
        }
    }

    /**
     * (SEC-08) UNICO punto di scrittura dell'identita' utente: nello store
     * cifrato userId + token; nel ripiego in chiaro SOLO lo userId.
     */
    fun putUserContext(context: Context, userId: String, accessToken: String) {
        val store = get(context)
        val ed = store.edit().putString(ListeningHistoryStore.PREF_USER_ID, userId)
        if (isDegraded) {
            ed.remove(ListeningHistoryStore.PREF_ACCESS_TOKEN)
            Log.w(TAG, "Store degradato: access token NON salvato su disco")
        } else {
            ed.putString(ListeningHistoryStore.PREF_ACCESS_TOKEN, accessToken)
        }
        ed.apply()
    }

    /** (SEC-02) Logout: via userId e token dallo store (cifrato o di ripiego). */
    fun clearUserContext(context: Context) {
        try {
            get(context).edit()
                .remove(ListeningHistoryStore.PREF_USER_ID)
                .remove(ListeningHistoryStore.PREF_ACCESS_TOKEN)
                .apply()
        } catch (e: Exception) {
            Log.w(TAG, "clearUserContext fallita: ${e.message}")
        }
    }

    /**
     * Migrazione una tantum: le installazioni esistenti hanno userId/token
     * ancora in chiaro dentro "ItaintaPrefs" (chiavi ListeningHistoryStore
     * .PREF_USER_ID / .PREF_ACCESS_TOKEN). Li sposta nello store cifrato e li
     * rimuove dalla copia in chiaro, così un utente già loggato non perde la
     * sessione nativa dopo l'update che introduce questo fix.
     * Nel ripiego in chiaro migra il solo userId.
     */
    private fun migrateLegacyValues(context: Context, secure: SharedPreferences) {
        try {
            if (secure.contains(ListeningHistoryStore.PREF_USER_ID)) return
            val legacy = context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
            val legacyUserId = legacy.getString(ListeningHistoryStore.PREF_USER_ID, null)
            val legacyToken = legacy.getString(ListeningHistoryStore.PREF_ACCESS_TOKEN, null)
            if (legacyUserId.isNullOrBlank() && legacyToken.isNullOrBlank()) return
            val ed = secure.edit().putString(ListeningHistoryStore.PREF_USER_ID, legacyUserId ?: "")
            if (!isDegraded) ed.putString(ListeningHistoryStore.PREF_ACCESS_TOKEN, legacyToken ?: "")
            ed.apply()
            legacy.edit()
                .remove(ListeningHistoryStore.PREF_USER_ID)
                .remove(ListeningHistoryStore.PREF_ACCESS_TOKEN)
                .apply()
            Log.d(TAG, "userId/accessToken migrati nello store ${if (isDegraded) "di ripiego (solo userId)" else "cifrato"}")
        } catch (e: Exception) {
            Log.w(TAG, "Migrazione userId/accessToken fallita: ${e.message}")
        }
    }
}
