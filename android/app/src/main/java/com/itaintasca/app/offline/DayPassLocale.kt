package com.itaintasca.app.offline

import android.content.Context
import android.content.SharedPreferences

/**
 * (25/10/2026) IL MIRROR NATIVO DEL DAY PASS, IN UN POSTO SOLO.
 *
 * Regola del server (CLAUDE.md, 23/10/2026: «Il Day Pass conta una volta per
 * luogo, anche per approfondimenti e cambio di personaggio. Il contatore nativo
 * non può abbassare quello del server»). Fin qui tre punti diversi
 * (ArrivalWorker, consumeDayPassGuide e playOfflineGuide nel plugin) facevano
 * `daypass_used + 1` a OGNI ascolto, e `setDayPass` riscriveva il contatore con
 * quello che arrivava dal JS anche se piu' basso di quello gia' contato qui a
 * schermo spento.
 *
 * Adesso:
 *  - `consuma(poiId)` incrementa SOLO se il luogo non e' gia' fra quelli contati
 *    per il pass CORRENTE (insieme di id in prefs, legato alla `expiresAt` del
 *    pass: un pass nuovo riparte da zero);
 *  - `copre(poiId)`: il pass vale per un luogo gia' contato anche a cap
 *    raggiunto — l'ha gia' pagato;
 *  - `imposta(...)` (da setDayPass): stesso pass → `used = max(nativo, JS)`;
 *    pass diverso → si prende quello del JS e si azzera l'insieme.
 * Stesse chiavi prefs di prima (`daypass_expires_at`, `daypass_cap`,
 * `daypass_used`): chi le legge soltanto (dayPassSuffix, getDayPassState) non
 * cambia.
 */
object DayPassLocale {

    const val PREF_EXPIRES_AT = "daypass_expires_at"
    const val PREF_CAP = "daypass_cap"
    const val PREF_USED = "daypass_used"
    /** Id dei luoghi gia' contati per il pass corrente (string set). */
    const val PREF_CONTATI = "daypass_poi_contati"
    /** La `expiresAt` del pass a cui appartiene l'insieme qui sopra. */
    const val PREF_CONTATI_PASS = "daypass_poi_contati_pass"

    private val lock = Any()

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)

    data class Stato(val expiresAt: Long, val used: Int, val cap: Int)

    fun stato(context: Context): Stato {
        val p = prefs(context)
        return Stato(p.getLong(PREF_EXPIRES_AT, 0L), p.getInt(PREF_USED, 0), p.getInt(PREF_CAP, 0))
    }

    /** I luoghi gia' contati per il pass con questa scadenza (vuoto se l'insieme e' di un altro pass). */
    private fun contati(p: SharedPreferences, expiresAt: Long): Set<String> {
        if (p.getLong(PREF_CONTATI_PASS, -1L) != expiresAt) return emptySet()
        return p.getStringSet(PREF_CONTATI, null)?.toSet() ?: emptySet()
    }

    /** Il luogo e' gia' stato contato sul pass corrente? */
    fun giaContato(context: Context, poiId: String): Boolean {
        val p = prefs(context)
        return contati(p, p.getLong(PREF_EXPIRES_AT, 0L)).contains(poiId)
    }

    /** Pass attivo (non scaduto, cap non esaurito): lo stesso di BillingLogic.isPassActive. */
    fun attivo(context: Context, nowMs: Long = System.currentTimeMillis()): Boolean {
        val s = stato(context)
        return BillingLogic.isPassActive(nowMs, s.expiresAt, s.used, s.cap)
    }

    /**
     * Il pass COPRE questo luogo: attivo, oppure non scaduto e il luogo gia'
     * contato (a cap raggiunto chi ha gia' pagato un luogo lo riascolta).
     */
    fun copre(context: Context, poiId: String, nowMs: Long = System.currentTimeMillis()): Boolean {
        val s = stato(context)
        if (s.expiresAt <= nowMs || s.cap <= 0) return false
        if (s.used < s.cap) return true
        return giaContato(context, poiId)
    }

    /**
     * L'utente ha DIRITTO alla guida completa di questo luogo senza addebito:
     * gia' acquistato (storico/possesso) oppure coperto dal pass. E' la stessa
     * condizione di ArrivalWorker.run, usata anche dal prefetch all'avvicinamento.
     */
    fun haDiritto(context: Context, poiId: String): Boolean =
        com.itaintasca.app.service.ListeningHistoryStore.isAlreadyPurchased(context, poiId) || copre(context, poiId)

    /**
     * Conta il luogo sul pass corrente. Ritorna il contatore dopo la chiamata.
     * Incrementa SOLO se il luogo e' nuovo per questo pass; un luogo gia'
     * contato non tocca nulla. Non verifica che il pass sia attivo: lo fa il
     * chiamante con `copre`.
     */
    fun consuma(context: Context, poiId: String): Int {
        synchronized(lock) {
            val p = prefs(context)
            val expiresAt = p.getLong(PREF_EXPIRES_AT, 0L)
            val used = p.getInt(PREF_USED, 0)
            val gia = contati(p, expiresAt)
            if (poiId.isNotBlank() && gia.contains(poiId)) return used
            val nuovo = HashSet(gia)
            if (poiId.isNotBlank()) nuovo.add(poiId)
            p.edit()
                .putInt(PREF_USED, used + 1)
                .putStringSet(PREF_CONTATI, nuovo)
                .putLong(PREF_CONTATI_PASS, expiresAt)
                .apply()
            return used + 1
        }
    }

    /**
     * Mirror dal JS (setDayPass). Stesso pass (stessa `expiresAt`): il contatore
     * non scende mai sotto quello nativo — a schermo spento il servizio ha
     * contato ascolti che il JS puo' non avere ancora visto. Pass diverso: si
     * prende tutto dal JS e l'insieme dei luoghi contati riparte vuoto.
     */
    fun imposta(context: Context, expiresAt: Long, cap: Int, used: Int) {
        synchronized(lock) {
            val p = prefs(context)
            val stessoPass = p.getLong(PREF_EXPIRES_AT, 0L) == expiresAt && expiresAt > 0L
            val usedFinale = if (stessoPass) maxOf(p.getInt(PREF_USED, 0), used) else used
            val e = p.edit()
                .putLong(PREF_EXPIRES_AT, expiresAt)
                .putInt(PREF_CAP, cap)
                .putInt(PREF_USED, usedFinale)
            if (!stessoPass) e.remove(PREF_CONTATI).putLong(PREF_CONTATI_PASS, expiresAt)
            e.apply()
        }
    }
}
