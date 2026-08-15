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
 */
object SecurePrefs {
    private const val TAG = "SecurePrefs"
    private const val FILE_NAME = "ItaintaSecurePrefs"
    private const val LEGACY_PREFS_NAME = "ItaintaPrefs"

    @Volatile
    private var instance: SharedPreferences? = null

    fun get(context: Context): SharedPreferences {
        instance?.let { return it }
        synchronized(this) {
            instance?.let { return it }
            val appContext = context.applicationContext
            val created = try {
                val masterKey = MasterKey.Builder(appContext)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                EncryptedSharedPreferences.create(
                    appContext,
                    FILE_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            } catch (e: Exception) {
                // Non deve mai bloccare login/servizio: se il Keystore non è
                // disponibile (dispositivo rotto, downgrade OS, ecc.) si
                // ricade su SharedPreferences normali invece di crashare.
                Log.e(TAG, "EncryptedSharedPreferences non disponibile, fallback in chiaro: ${e.message}")
                appContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
            }
            migrateLegacyValues(appContext, created)
            instance = created
            return created
        }
    }

    /**
     * Migrazione una tantum: le installazioni esistenti hanno userId/token
     * ancora in chiaro dentro "ItaintaPrefs" (chiavi ListeningHistoryStore
     * .PREF_USER_ID / .PREF_ACCESS_TOKEN). Li sposta nello store cifrato e li
     * rimuove dalla copia in chiaro, così un utente già loggato non perde la
     * sessione nativa dopo l'update che introduce questo fix.
     */
    private fun migrateLegacyValues(context: Context, secure: SharedPreferences) {
        try {
            if (secure.contains(ListeningHistoryStore.PREF_USER_ID)) return
            val legacy = context.getSharedPreferences(LEGACY_PREFS_NAME, Context.MODE_PRIVATE)
            val legacyUserId = legacy.getString(ListeningHistoryStore.PREF_USER_ID, null)
            val legacyToken = legacy.getString(ListeningHistoryStore.PREF_ACCESS_TOKEN, null)
            if (legacyUserId.isNullOrBlank() && legacyToken.isNullOrBlank()) return
            secure.edit()
                .putString(ListeningHistoryStore.PREF_USER_ID, legacyUserId ?: "")
                .putString(ListeningHistoryStore.PREF_ACCESS_TOKEN, legacyToken ?: "")
                .apply()
            legacy.edit()
                .remove(ListeningHistoryStore.PREF_USER_ID)
                .remove(ListeningHistoryStore.PREF_ACCESS_TOKEN)
                .apply()
            Log.d(TAG, "userId/accessToken migrati nello store cifrato")
        } catch (e: Exception) {
            Log.w(TAG, "Migrazione userId/accessToken fallita: ${e.message}")
        }
    }
}
