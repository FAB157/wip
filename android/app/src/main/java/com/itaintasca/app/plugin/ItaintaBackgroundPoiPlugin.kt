package com.itaintasca.app.plugin

import android.Manifest
import android.content.*
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.app.AlertDialog
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.itaintasca.app.service.ItaintaBackgroundPoiService
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.ArrayList

@CapacitorPlugin(
    name = "ItaintaBackgroundPoiPlugin",
    permissions = [
        Permission(
            alias = "location",
            strings = [
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ]
        ),
        Permission(
            alias = "notifications",
            strings = [Manifest.permission.POST_NOTIFICATIONS]
        ),
        Permission(
            alias = "activity",
            strings = [Manifest.permission.ACTIVITY_RECOGNITION]
        )
    ]
)
class ItaintaBackgroundPoiPlugin : Plugin() {

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val event = intent?.getStringExtra("event") ?: return
            val data = JSObject()
            
            val data1 = intent.getStringExtra("data1")
            if (data1 != null) {
                data.put("data", data1)
                try {
                    // Gestione intelligente: prova come oggetto poi come array
                    if (data1.trim().startsWith("{")) {
                        val json = JSONObject(data1)
                        if (json.has("poiId")) data.put("poiId", json.getString("poiId"))
                        if (json.has("poiName")) data.put("poiName", json.getString("poiName"))
                    }
                } catch (e: Exception) {
                    // Ignora errori di parsing, usiamo il campo 'data' raw
                }
            }
            
            // Campi diretti per compatibilità
            intent.getStringExtra("poiId")?.let { data.put("poiId", it) }
            intent.getStringExtra("poiName")?.let { data.put("poiName", it) }

            // retainUntilConsumed=true: se la WebView si sta ancora svegliando
            // (schermo appena sbloccato), l'evento viene consegnato appena
            // il listener JS si registra invece di andare perso.
            notifyListeners(event, data, true)
        }
    }

    override fun load() {
        val filter = IntentFilter("com.itaintasca.POI_EVENT")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, filter)
        }
    }

    @PluginMethod
    fun checkAndRequestPermissions(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationCallback")
        } else {
            checkBackgroundLocation(call)
        }
    }

    @PermissionCallback
    private fun locationCallback(call: PluginCall) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            checkBackgroundLocation(call)
        } else {
            call.reject("Permesso posizione necessario")
        }
    }

    private fun checkBackgroundLocation(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                Handler(Looper.getMainLooper()).post {
                    // Prominent disclosure richiesta dalla policy Play sulla
                    // posizione in background: deve dire COSA si raccoglie,
                    // PERCHÉ, e che avviene anche ad app chiusa.
                    AlertDialog.Builder(context)
                        .setTitle("Posizione in background")
                        .setMessage("WIP raccoglie i dati della tua posizione in background per riprodurre automaticamente le audioguide quando ti avvicini a un punto di interesse, anche quando l'app è chiusa o non in uso (schermo spento o telefono in tasca). La posizione non viene usata per pubblicità. Per attivare la funzione vai su Impostazioni → Permessi → Posizione e scegli 'Consenti sempre'.")
                        .setPositiveButton("Vai alle Impostazioni") { _, _ ->
                            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.fromParts("package", context.packageName, null)
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            context.startActivity(intent)
                            val ret = JSObject()
                            ret.put("status", "requesting_background_location")
                            call.resolve(ret)
                        }
                        .setNegativeButton("Non ora") { dialog, _ ->
                            dialog.dismiss()
                            val ret = JSObject()
                            ret.put("status", "denied_background_location")
                            call.resolve(ret)
                        }
                        .setCancelable(false)
                        .show()
                }
                return
            }
        }
        checkNotifications(call)
    }

    private fun checkNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationCallback")
                return
            }
        }
        checkActivityRecognition(call)
    }

    @PermissionCallback
    private fun notificationCallback(call: PluginCall) {
        checkActivityRecognition(call)
    }

    /**
     * ACTIVITY_RECOGNITION (facoltativo, solo API 29+ — prima è install-time):
     * abilita il gating trigger con sensori (anti-teletrasporto GPS +
     * corroborazione piedi⇄auto in ItaintaBackgroundPoiService). Se l'utente
     * nega si prosegue comunque: il servizio degrada in silenzio al
     * comportamento senza sensori.
     */
    private fun checkActivityRecognition(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            getPermissionState("activity") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("activity", call, "activityCallback")
            return
        }
        checkBatteryOptimization(call)
    }

    @PermissionCallback
    private fun activityCallback(call: PluginCall) {
        // Concesso o negato, si va avanti: il permesso è facoltativo.
        checkBatteryOptimization(call)
    }

    private fun checkBatteryOptimization(call: PluginCall) {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!pm.isIgnoringBatteryOptimizations(context.packageName)) {
                // ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (dialog diretto)
                // richiede un permesso NON dichiarato nel manifest → poteva
                // lanciare SecurityException, ed è sotto scrutinio Play.
                // Si apre invece la LISTA di sistema (nessun permesso richiesto).
                try {
                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    context.startActivity(intent)
                    val ret = JSObject()
                    ret.put("status", "requesting_battery_optimization")
                    call.resolve(ret)
                    return
                } catch (e: Exception) {
                    Log.w("ItaintaPoiPlugin", "Battery optimization settings unavailable: ${e.message}")
                }
            }
        }
        val ret = JSObject()
        ret.put("status", "all_granted")
        call.resolve(ret)
    }

    @PluginMethod
    fun startBackgroundPoiService(call: PluginCall) {
        val isAutomaticMode = call.getBoolean("isAutomaticMode") ?: true
        val guideMode = call.getString("guideMode") ?: "walking"
        val transportPref = call.getString("transportPref") ?: "auto"
        val language = call.getString("language") ?: "it"
        val categories = call.getArray("categories")?.toList<String>() ?: emptyList()
        
        val lat = call.getDouble("lat")
        val lon = call.getDouble("lon")

        val alertRadiusWalk = call.getFloat("alertRadiusWalk") ?: 150f
        val arrivalRadiusWalk = call.getFloat("arrivalRadiusWalk") ?: 30f
        val alertRadiusCar = call.getFloat("alertRadiusCar") ?: 300f
        val arrivalRadiusCar = call.getFloat("arrivalRadiusCar") ?: 50f

        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean("isAutomaticMode", isAutomaticMode)
            putBoolean("isServiceActive", true)
            putString("language", language)
            apply()
        }
        
        val intent = Intent(context, ItaintaBackgroundPoiService::class.java).apply {
            putExtra("isAutomaticMode", isAutomaticMode)
            putExtra("guideMode", guideMode)
            putExtra("transportPref", transportPref)
            putExtra("language", language)
            putStringArrayListExtra("categories", ArrayList(categories))
            putExtra("alertRadiusWalk", alertRadiusWalk)
            putExtra("arrivalRadiusWalk", arrivalRadiusWalk)
            putExtra("alertRadiusCar", alertRadiusCar)
            putExtra("arrivalRadiusCar", arrivalRadiusCar)
            
            if (lat != null && lon != null) {
                putExtra("initialLat", lat)
                putExtra("initialLon", lon)
            }
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        com.itaintasca.app.service.ServiceWatchdog.schedule(context)
        // Idempotente: copre il caso "permesso ACTIVITY_RECOGNITION appena
        // concesso a servizio già vivo" (onCreate non viene richiamato).
        com.itaintasca.app.geofence.ActivityMonitor.start(context)
        call.resolve()
    }

    @PluginMethod
    fun syncManualSelection(call: PluginCall) {
        val poisJson = call.getString("poisJson") ?: "[]"
        val intent = Intent(context, ItaintaBackgroundPoiService::class.java).apply {
            action = ItaintaBackgroundPoiService.ACTION_SYNC_SELECTION
            putExtra("poisJson", poisJson)
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        call.resolve()
    }

    @PluginMethod
    fun stopBackgroundPoiService(call: PluginCall) {
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("isServiceActive", false).apply()
        com.itaintasca.app.geofence.GeofenceBroadcastReceiver.stopSpeaking(context)
        com.itaintasca.app.service.ServiceWatchdog.cancel(context)
        val intent = Intent(context, ItaintaBackgroundPoiService::class.java)
        context.stopService(intent)
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val data = JSObject()
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        data.put("active", prefs.getBoolean("isServiceActive", false))
        call.resolve(data)
    }

    /**
     * Azzera lo storico dei trigger di geofencing (tabella trigger_state in Room):
     * dopo il reset ogni POI verrà riannunciato come la prima volta. Chiamato dal
     * JS (ProfileScreen → "Azzera storico") in parallelo alla cancellazione web
     * di wip_played_pois. Senza, il servizio in background continuava a saltare i
     * POI già annunciati anche dopo il reset lato web.
     */
    @PluginMethod
    fun resetTriggerHistory(call: PluginCall) {
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                com.itaintasca.app.db.PoiDatabase.getInstance(context).poiDao().clearTriggerStates()
                call.resolve()
            } catch (e: Exception) {
                call.reject("resetTriggerHistory failed: ${e.message}")
            }
        }
    }

    /**
     * Ferma il teaser vocale nativo. Il JS lo chiama un attimo prima di avviare
     * l'audioguida completa: mai due voci sovrapposte, senza timer ciechi.
     */
    @PluginMethod
    fun stopNativeTeaser(call: PluginCall) {
        com.itaintasca.app.geofence.GeofenceBroadcastReceiver.stopSpeaking(context)
        call.resolve()
    }

    /**
     * Stato del teaser nativo, persistito dal GeofenceBroadcastReceiver.
     * Permette al JS (anche a cold start, quando gli eventi live sono andati persi)
     * di sapere se la voce nativa sta ancora parlando e per quale POI.
     */
    @PluginMethod
    fun getTeaserState(call: PluginCall) {
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val data = JSObject()
        data.put("isSpeaking", prefs.getBoolean(com.itaintasca.app.geofence.GeofenceBroadcastReceiver.PREF_TEASER_SPEAKING, false))
        data.put("speakingPoiId", prefs.getString(com.itaintasca.app.geofence.GeofenceBroadcastReceiver.PREF_TEASER_SPEAKING_POI, "") ?: "")
        data.put("lastPoiId", prefs.getString(com.itaintasca.app.geofence.GeofenceBroadcastReceiver.PREF_TEASER_LAST_POI, "") ?: "")
        data.put("lastFinishedAt", prefs.getLong(com.itaintasca.app.geofence.GeofenceBroadcastReceiver.PREF_TEASER_LAST_FINISHED_AT, 0L))
        call.resolve(data)
    }

    /**
     * Deep link in sospeso salvato da MainActivity. A cold start l'evento
     * 'deep-link-poi' viene dispatchato prima che React monti i listener e va
     * perso: il JS lo recupera da qui all'avvio (lettura distruttiva).
     */
    @PluginMethod
    fun getPendingDeepLink(call: PluginCall) {
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val data = JSObject()
        data.put("poiId", prefs.getString("pending_deeplink_poi", "") ?: "")
        data.put("guide", prefs.getString("pending_deeplink_guide", "") ?: "")
        data.put("timestamp", prefs.getLong("pending_deeplink_ts", 0L))
        prefs.edit()
            .remove("pending_deeplink_poi")
            .remove("pending_deeplink_guide")
            .remove("pending_deeplink_ts")
            .apply()
        call.resolve(data)
    }

    @PluginMethod
    fun openSystemNavigator(call: PluginCall) {
        val lat = call.getDouble("lat") ?: return call.reject("Missing lat")
        val lon = call.getDouble("lon") ?: return call.reject("Missing lon")
        val label = call.getString("name") ?: "Destinazione"
        val gmmIntentUri = Uri.parse("google.navigation:q=$lat,$lon&mode=w")
        val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri).apply {
            setPackage("com.google.android.apps.maps")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        if (mapIntent.resolveActivity(context.packageManager) != null) {
            context.startActivity(mapIntent)
        } else {
            val fallbackUri = Uri.parse("geo:$lat,$lon?q=$lat,$lon($label)")
            val fallbackIntent = Intent(Intent.ACTION_VIEW, fallbackUri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(fallbackIntent)
        }
        call.resolve()
    }

    // ------------------------------------------------------------------
    // MODALITÀ OFFLINE — gestione pacchetti area (solo testi, voce di sistema)
    // ------------------------------------------------------------------

    /**
     * Scarica (o ri-scarica) un pacchetto area. Il progresso arriva al JS con
     * l'evento 'offlinePackageProgress' {packageId, done, total, phase}.
     */
    @PluginMethod
    fun downloadOfflinePackage(call: PluginCall) {
        val lat = call.getDouble("lat") ?: return call.reject("Missing lat")
        val lon = call.getDouble("lon") ?: return call.reject("Missing lon")
        val id = call.getString("id") ?: "pkg_${System.currentTimeMillis()}"
        val name = call.getString("name") ?: "Area"
        val radiusKm = call.getDouble("radiusKm") ?: 50.0
        val language = call.getString("language")
            ?: context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE).getString("language", "it")
            ?: "it"

        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                val pkg = com.itaintasca.app.offline.PackageDownloadManager(context)
                    .downloadPackage(id, name, lat, lon, radiusKm, language)
                call.resolve(packageToJs(pkg))
            } catch (e: Exception) {
                call.reject("Download failed: ${e.message}")
            }
        }
    }

    /** Delta sync di un pacchetto esistente (solo POI cambiati + tombstone). */
    @PluginMethod
    fun syncOfflinePackage(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("Missing id")
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                val pkg = com.itaintasca.app.offline.PackageDownloadManager(context).syncPackage(id)
                if (pkg == null) call.reject("Package not found") else call.resolve(packageToJs(pkg))
            } catch (e: Exception) {
                call.reject("Sync failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun listOfflinePackages(call: PluginCall) {
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                val packages = com.itaintasca.app.offline.PackageDownloadManager(context).listPackages()
                val arr = JSONArray()
                packages.forEach { arr.put(JSONObject(packageToJs(it).toString())) }
                val ret = JSObject()
                ret.put("packages", arr)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("List failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun deleteOfflinePackage(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("Missing id")
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                com.itaintasca.app.offline.PackageDownloadManager(context).deletePackage(id)
                call.resolve()
            } catch (e: Exception) {
                call.reject("Delete failed: ${e.message}")
            }
        }
    }

    private fun packageToJs(pkg: com.itaintasca.app.db.OfflinePackageEntity): JSObject {
        val ret = JSObject()
        ret.put("id", pkg.id)
        ret.put("name", pkg.name)
        ret.put("centerLat", pkg.centerLat)
        ret.put("centerLon", pkg.centerLon)
        ret.put("radiusKm", pkg.radiusKm)
        ret.put("language", pkg.language)
        ret.put("poiCount", pkg.poiCount)
        ret.put("sizeBytes", pkg.sizeBytes)
        ret.put("downloadedAt", pkg.downloadedAt)
        ret.put("lastSyncAt", pkg.lastSyncAt ?: "")
        ret.put("status", pkg.status)
        return ret
    }

    /**
     * Verifica al momento del DOWNLOAD (con la rete ancora disponibile) che la
     * voce TTS della lingua sia installata e utilizzabile offline. Non
     * scoprirlo quando si è già senza rete.
     */
    @PluginMethod
    fun checkOfflineTtsVoice(call: PluginCall) {
        val lang = call.getString("language") ?: "it"
        val locale = when (lang) {
            "en" -> java.util.Locale.ENGLISH
            "fr" -> java.util.Locale.FRENCH
            "es" -> java.util.Locale("es", "ES")
            "de" -> java.util.Locale.GERMAN
            "ru" -> java.util.Locale("ru", "RU")
            "zh" -> java.util.Locale.SIMPLIFIED_CHINESE
            else -> java.util.Locale.ITALIAN
        }
        var tts: android.speech.tts.TextToSpeech? = null
        tts = android.speech.tts.TextToSpeech(context) { status ->
            val ret = JSObject()
            if (status == android.speech.tts.TextToSpeech.SUCCESS) {
                val res = tts?.isLanguageAvailable(locale)
                    ?: android.speech.tts.TextToSpeech.LANG_NOT_SUPPORTED
                ret.put("available", res >= android.speech.tts.TextToSpeech.LANG_AVAILABLE)
                // Una voce può esserci ma richiedere la rete: cerchiamone una
                // dichiarata utilizzabile offline.
                val hasOfflineVoice = try {
                    tts?.voices?.any { v ->
                        v.locale.language == locale.language && !v.isNetworkConnectionRequired
                    } ?: false
                } catch (_: Exception) {
                    false
                }
                ret.put("offlineVoice", hasOfflineVoice)
            } else {
                ret.put("available", false)
                ret.put("offlineVoice", false)
            }
            try { tts?.shutdown() } catch (_: Exception) { }
            call.resolve(ret)
        }
    }

    /** Apre l'installazione dati voce TTS di sistema (da chiamare con rete viva). */
    @PluginMethod
    fun openTtsVoiceInstall(call: PluginCall) {
        try {
            val intent = Intent(android.speech.tts.TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Cannot open TTS install: ${e.message}")
        }
    }

    /**
     * Pronuncia una frase con la voce TTS DI SISTEMA, accodandola alla stessa
     * coda sequenziale dei teaser. Usata dal JS per le indicazioni di
     * navigazione e per l'annuncio d'arrivo: funziona OFFLINE (niente Azure,
     * niente download MP3, costo zero) e, condividendo la coda col teaser,
     * non può sovrapporsi ad esso — "Sei arrivato" finisce, poi parte il
     * teaser, poi la logica normale dell'audioguida.
     *
     * priority: 0 = massima (arrivo/itinerario), 2 = normale.
     * Se il servizio non è attivo la coda scarta gli item: si risponde
     * ok=false così il JS ripiega sul TTS di rete invece di restare muto.
     */
    @PluginMethod
    fun speakText(call: PluginCall) {
        val text = call.getString("text")?.trim().orEmpty()
        if (text.isEmpty()) return call.reject("Missing text")
        val ret = JSObject()
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("isServiceActive", false)) {
            ret.put("ok", false)
            ret.put("reason", "service_inactive")
            return call.resolve(ret)
        }
        return try {
            com.itaintasca.app.geofence.GeofenceBroadcastReceiver.enqueue(
                context,
                com.itaintasca.app.geofence.GeofenceBroadcastReceiver.Companion.SpeechItem(
                    text = text,
                    isGem = false,
                    isItinerary = false,
                    poiId = call.getString("poiId"),
                    priority = call.getInt("priority") ?: 0,
                    kind = call.getString("kind") ?: "nav"
                )
            )
            ret.put("ok", true)
            call.resolve(ret)
        } catch (e: Exception) {
            ret.put("ok", false)
            ret.put("reason", e.message ?: "enqueue_failed")
            call.resolve(ret)
        }
    }

    // ------------------------------------------------------------------
    // BILLING OFFLINE — snapshot saldo, Day Pass, per-listen con registro
    // ------------------------------------------------------------------

    /**
     * Snapshot del saldo crediti, aggiornato dal JS a ogni sessione online:
     * è il tetto di spesa del per-listen quando la rete manca.
     */
    @PluginMethod
    fun setWalletBalance(call: PluginCall) {
        val credits = call.getInt("credits") ?: 0
        context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
            .edit().putInt("wallet_snapshot_credits", credits).apply()
        call.resolve()
    }

    /**
     * Modalità «solo vibrazione + testo»: il WebView non ha accesso allo
     * store CapacitorStorage (manca @capacitor/preferences), quindi il
     * toggle passa da qui. Scriviamo in ENTRAMBI gli store letti dal
     * nativo (CapacitorStorage per WebViewPrefs, ItaintaPrefs come
     * fallback) così il service la vede al prossimo trigger.
     */
    @PluginMethod
    fun setSilentMode(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        val v = if (enabled) "1" else "0"
        context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            .edit().putString("wip_silent_mode", v).apply()
        context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
            .edit().putString("wip_silent_mode", v).apply()
        call.resolve()
    }

    /**
     * Identità utente per lo storico ascolti nativo: il JS la spinge a ogni
     * sessione online (dayPassService.reconcileOfflineBilling). Il token
     * serve per le RLS su user_listening_history; se scade, insert e sync
     * restano best-effort. Alla ricezione sincronizza subito il mirror.
     */
    @PluginMethod
    fun setUserContext(call: PluginCall) {
        val userId = call.getString("userId") ?: ""
        val accessToken = call.getString("accessToken") ?: ""
        // Identità utente cifrata (EncryptedSharedPreferences): prima
        // userId/accessToken erano in chiaro in "ItaintaPrefs" insieme a
        // impostazioni non sensibili. Le altre prefs restano invariate.
        com.itaintasca.app.service.SecurePrefs.get(context).edit()
            .putString(com.itaintasca.app.service.ListeningHistoryStore.PREF_USER_ID, userId)
            .putString(com.itaintasca.app.service.ListeningHistoryStore.PREF_ACCESS_TOKEN, accessToken)
            .apply()
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                com.itaintasca.app.service.ListeningHistoryStore.syncFromCloud(context)
            } catch (_: Exception) { /* best-effort */ }
        }
        call.resolve()
    }

    /** Mirror nativo del Day Pass: scadenza, cap e contatore in prefs. */
    @PluginMethod
    fun setDayPass(call: PluginCall) {
        val expiresAt = (call.getDouble("expiresAt") ?: 0.0).toLong()
        val cap = call.getInt("cap") ?: com.itaintasca.app.offline.BillingLogic.DAY_PASS_CAP
        val used = call.getInt("used") ?: 0
        context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE).edit()
            .putLong("daypass_expires_at", expiresAt)
            .putInt("daypass_cap", cap)
            .putInt("daypass_used", used)
            .apply()
        call.resolve()
    }

    @PluginMethod
    fun getDayPassState(call: PluginCall) {
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val expiresAt = prefs.getLong("daypass_expires_at", 0L)
        val used = prefs.getInt("daypass_used", 0)
        val cap = prefs.getInt("daypass_cap", 0)
        val ret = JSObject()
        ret.put("expiresAt", expiresAt)
        ret.put("used", used)
        ret.put("cap", cap)
        ret.put("active", com.itaintasca.app.offline.BillingLogic.isPassActive(System.currentTimeMillis(), expiresAt, used, cap))
        call.resolve(ret)
    }

    /**
     * Consuma 1 guida dal Day Pass (chiamato dal JS quando l'ascolto in-app
     * è coperto dal pass). Stesso contatore in prefs usato dal receiver:
     * il cap vale ovunque, anche offline.
     */
    @PluginMethod
    fun consumeDayPassGuide(call: PluginCall) {
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        val expiresAt = prefs.getLong("daypass_expires_at", 0L)
        val used = prefs.getInt("daypass_used", 0)
        val cap = prefs.getInt("daypass_cap", 0)
        val ret = JSObject()
        if (!com.itaintasca.app.offline.BillingLogic.isPassActive(System.currentTimeMillis(), expiresAt, used, cap)) {
            ret.put("ok", false)
        } else {
            prefs.edit().putInt("daypass_used", used + 1).apply()
            ret.put("ok", true)
            ret.put("used", used + 1)
            ret.put("remaining", (cap - used - 1).coerceAtLeast(0))
        }
        call.resolve(ret)
    }

    /** Spesa per-listen annotata offline e non ancora riconciliata col server. */
    @PluginMethod
    fun getOfflineSpendState(call: PluginCall) {
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                val db = com.itaintasca.app.db.PoiDatabase.getInstance(context)
                val ret = JSObject()
                ret.put("pendingCredits", db.offlineDao().pendingSpendCredits())
                ret.put("pendingCount", db.offlineDao().pendingSpendCount())
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("getOfflineSpendState failed: ${e.message}")
            }
        }
    }

    /** Da chiamare SOLO dopo che consume_credits è andata a buon fine lato server. */
    @PluginMethod
    fun markSpendReconciled(call: PluginCall) {
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                com.itaintasca.app.db.PoiDatabase.getInstance(context).offlineDao().clearSpendLedger()
                call.resolve()
            } catch (e: Exception) {
                call.reject("markSpendReconciled failed: ${e.message}")
            }
        }
    }

    /**
     * Ascolto dell'audioguida completa dal pacchetto offline (tasto "Ascolta").
     * Con Day Pass attivo consuma il contatore del pass; altrimenti per-listen:
     * verifica snapshot saldo − spesa pendente e annota nel registro locale.
     * La voce esce dalla stessa coda TTS nativa dei teaser.
     */
    @PluginMethod
    fun playOfflineGuide(call: PluginCall) {
        val poiId = call.getString("poiId") ?: return call.reject("Missing poiId")
        val cost = call.getInt("cost") ?: com.itaintasca.app.offline.BillingLogic.DEFAULT_GUIDE_COST
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            try {
                val db = com.itaintasca.app.db.PoiDatabase.getInstance(context)
                val offlinePoi = db.offlineDao().getPoiById(poiId)
                val text = offlinePoi?.audioText
                val lang = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                    .getString("language", "it") ?: "it"
                // MP3 prefetchato: parte istantaneo e copre anche il caso
                // audio_text assente nel pacchetto (catena fallback offline).
                val mp3 = com.itaintasca.app.service.AudioPrefetchManager
                    .cachedFile(context, poiId, lang)
                val ret = JSObject()
                if (text.isNullOrBlank() && mp3 == null) {
                    ret.put("ok", false)
                    ret.put("reason", "no_text")
                    call.resolve(ret)
                    return@launch
                }

                val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                val nowMs = System.currentTimeMillis()
                val passUsed = prefs.getInt("daypass_used", 0)
                val passActive = com.itaintasca.app.offline.BillingLogic.isPassActive(
                    nowMs, prefs.getLong("daypass_expires_at", 0L), passUsed, prefs.getInt("daypass_cap", 0)
                )
                // Già nello storico ascolti = già acquistato: gratis, non
                // consuma né pass né crediti (come authorizeGuidePlayback web)
                val alreadyPurchased = com.itaintasca.app.service.ListeningHistoryStore
                    .isAlreadyPurchased(context, poiId)
                if (alreadyPurchased) {
                    ret.put("mode", "purchased")
                } else if (passActive) {
                    prefs.edit().putInt("daypass_used", passUsed + 1).apply()
                    ret.put("mode", "day_pass")
                } else {
                    val snapshot = prefs.getInt("wallet_snapshot_credits", 0)
                    val pending = db.offlineDao().pendingSpendCredits()
                    if (!com.itaintasca.app.offline.BillingLogic.canSpend(snapshot, pending, cost)) {
                        ret.put("ok", false)
                        ret.put("reason", "insufficient_credits")
                        ret.put("remaining", com.itaintasca.app.offline.BillingLogic.remainingOffline(snapshot, pending))
                        call.resolve(ret)
                        return@launch
                    }
                    db.offlineDao().insertSpend(
                        com.itaintasca.app.db.OfflineSpendEntity(poiId = poiId, credits = cost, ts = nowMs)
                    )
                    ret.put("mode", "per_listen")
                    ret.put("charged", cost)
                }

                com.itaintasca.app.geofence.GeofenceBroadcastReceiver.enqueue(
                    context,
                    com.itaintasca.app.geofence.GeofenceBroadcastReceiver.Companion.SpeechItem(
                        text = text ?: "",
                        isGem = offlinePoi?.isGem ?: false,
                        isItinerary = false,
                        poiId = poiId,
                        priority = 1,
                        kind = "arrival",
                        audioFile = mp3?.absolutePath
                    )
                )
                // Storico ascolti: mirror subito + cloud best-effort
                com.itaintasca.app.service.ListeningHistoryStore.recordListening(
                    context, poiId, offlinePoi?.nome, offlinePoi?.category, null
                )
                ret.put("ok", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("playOfflineGuide failed: ${e.message}")
            }
        }
    }

    /**
     * «Salute del viaggio»: passi/km per giorno (oggi + 6 precedenti) dal
     * bookkeeping di StepTracker su TYPE_STEP_COUNTER. Stesso formato di
     * HealthStats.swift su iOS; floors è sempre 0 (Android non conta i piani).
     * Permesso ACTIVITY_RECOGNITION mancante o sensore assente →
     * {available:false}, MAI un reject: la card JS si nasconde e basta.
     */
    @PluginMethod
    fun getHealthStats(call: PluginCall) {
        if (!com.itaintasca.app.service.StepTracker.isAvailable(context)) {
            val ret = JSObject()
            ret.put("available", false)
            call.resolve(ret)
            return
        }
        // record() aggiorna il bucket di oggi con una lettura fresca del
        // sensore (one-shot, callback su main thread o timeout 2 s).
        com.itaintasca.app.service.StepTracker.record(context) {
            try {
                val arr = JSONArray()
                com.itaintasca.app.service.StepTracker.lastDays(context, 7).forEach { d ->
                    val o = JSONObject()
                    o.put("date", d.date)
                    o.put("steps", d.steps)
                    o.put("distanceKm", d.distanceKm)
                    o.put("floors", 0)
                    arr.put(o)
                }
                val ret = JSObject()
                ret.put("available", true)
                ret.put("days", arr)
                call.resolve(ret)
            } catch (e: Exception) {
                val ret = JSObject()
                ret.put("available", false)
                call.resolve(ret)
            }
        }
    }

    override fun handleOnDestroy() {
        try {
            context.unregisterReceiver(receiver)
        } catch (e: Exception) { }
        super.handleOnDestroy()
    }
}
