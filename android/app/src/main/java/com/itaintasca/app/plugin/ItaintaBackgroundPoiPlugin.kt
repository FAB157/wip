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
import com.itaintasca.app.geofence.BearingGate
import com.itaintasca.app.geofence.NotificationStrings
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
        // (29/08/2026) Alias a se' per il background: chiesto DOPO il foreground,
        // da API 30 il sistema apre direttamente la pagina «Posizione» con il
        // radio «Consenti sempre» (un tocco), invece della scheda Info app da
        // cui l'utente doveva trovare Autorizzazioni → Posizione da solo.
        Permission(
            alias = "backgroundLocation",
            strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION]
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

    private fun backgroundLocationGranted(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED

    /**
     * POSIZIONE IN BACKGROUND IN UN TOCCO (29/08/2026, collaudo sul Realme).
     * Prima: dialogo nativo di disclosure + scheda Info app, da cui l'utente
     * doveva trovare da solo Autorizzazioni → Posizione → Consenti sempre
     * (tre tocchi a mano, e sul telefono del committente nessuno li trovava).
     * Ora la prominent disclosure Play la fa la schermata JS (una sola, con
     * cosa/perché/anche ad app chiusa) PRIMA di chiamare il plugin, e qui si
     * CHIEDE il permesso: su API 30+ il sistema apre direttamente la pagina
     * «Posizione» col radio «Consenti sempre»; su API 29 e' un'opzione dello
     * stesso dialogo. Il callback arriva quando l'utente torna: nessuna
     * navigazione manuale. I valori di `status` restano quelli di prima.
     */
    private fun checkBackgroundLocation(call: PluginCall) {
        if (!backgroundLocationGranted()) {
            requestPermissionForAlias("backgroundLocation", call, "backgroundLocationCallback")
            return
        }
        checkNotifications(call)
    }

    @PermissionCallback
    private fun backgroundLocationCallback(call: PluginCall) {
        if (backgroundLocationGranted()) {
            checkNotifications(call)
        } else {
            // Rifiutare resta rifiutare: nessuna seconda richiesta, nessun
            // dirottamento sulle Impostazioni. La schermata JS mostra lo stato
            // e un tasto «Attiva» per riprovare quando vuole l'utente.
            val ret = JSObject()
            ret.put("status", "denied_background_location")
            call.resolve(ret)
        }
    }

    private fun checkNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationCallback")
                return
            }
        }
        checkNotificheBloccate(call)
    }

    @PermissionCallback
    private fun notificationCallback(call: PluginCall) {
        checkNotificheBloccate(call)
    }

    /**
     * (29/08/2026, collaudo sul Realme) NOTIFICHE BLOCCATE DAL TELEFONO. Il
     * permesso POST_NOTIFICATIONS era concesso, ma nelle impostazioni
     * dell'app Realme UI aveva «Gestisci notifiche: Rifiuta»: nessuna
     * notifica di WIP arrivava — nemmeno quella del foreground service, cioe'
     * il cruscotto sulla lock screen, ed e' per questo che «il banner non
     * resta a display spento». Il permesso di runtime non lo vede: lo vede
     * areNotificationsEnabled(). Non si puo' riaccendere da codice (Android
     * lo vieta): si spiega e si apre in un tocco la pagina esatta delle
     * notifiche dell'app. Fa parte dell'onboarding, come la posizione
     * «Sempre»: il committente vuole tutto all'inizio, col minimo di tocchi.
     */
    private fun checkNotificheBloccate(call: PluginCall) {
        val abilitate = try {
            androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()
        } catch (_: Exception) { true }
        if (abilitate) {
            // (29/08/2026) La catena dell'onboarding finisce QUI: posizione
            // (fg+bg) e notifiche. Attivita' fisica e batteria erano altri due
            // dialoghi/pagine di sistema in fila — e la pagina batteria OEM del
            // Realme era pure sbagliata (interruttori «sfondo/avvio automatico»,
            // non l'esenzione). Restano come tasti a parte nella schermata
            // permessi (requestActivityRecognition / requestBatteryOptimization).
            val ret = JSObject()
            ret.put("status", "all_granted")
            call.resolve(ret)
            return
        }
        Handler(Looper.getMainLooper()).post {
            AlertDialog.Builder(context)
                .setTitle(NotificationStrings.get(context, "notif_blocked_title"))
                .setMessage(NotificationStrings.get(context, "notif_blocked_text"))
                .setPositiveButton(NotificationStrings.get(context, "bg_disclosure_settings")) { _, _ ->
                    apriImpostazioniNotifiche()
                    val ret = JSObject()
                    ret.put("status", "requesting_notifications")
                    call.resolve(ret)
                }
                .setNegativeButton(NotificationStrings.get(context, "bg_disclosure_later")) { dialog, _ ->
                    dialog.dismiss()
                    val ret = JSObject()
                    ret.put("status", "denied_notifications")
                    call.resolve(ret)
                }
                .setCancelable(false)
                .show()
        }
    }

    /** La pagina delle notifiche dell'app (Android 8+), non quella generale dell'app. */
    private fun apriImpostazioniNotifiche() {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            }
        } else {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
            }
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { context.startActivity(intent) } catch (e: Exception) {
            Log.w("ItaintaPoiPlugin", "Impostazioni notifiche non apribili: ${e.message}")
        }
    }

    /** Per il JS: le notifiche arrivano davvero? (permesso E interruttore di sistema). */
    @PluginMethod
    fun areNotificationsEnabled(call: PluginCall) {
        val ret = JSObject()
        ret.put("enabled", try { androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled() } catch (_: Exception) { true })
        call.resolve(ret)
    }

    /** Un tocco: la pagina delle notifiche dell'app nelle Impostazioni. */
    @PluginMethod
    fun openNotificationSettings(call: PluginCall) {
        apriImpostazioniNotifiche()
        call.resolve()
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

    // ── PERMESSI GRANULARI (29/08/2026) ─────────────────────────────────────
    // La schermata permessi ha UNA riga per permesso con un tasto «Attiva»
    // ciascuna: ogni tasto chiama uno di questi metodi, che apre direttamente
    // il dialogo o la pagina di sistema giusta, e getPermissionsStatus rilegge
    // lo stato per aggiornare le spunte quando l'utente torna nell'app.
    // checkAndRequestPermissions (la catena unica) resta per compatibilita'
    // e per iOS, dove il plugin Swift non ha questi metodi.

    /** Stato di tutto in una lettura sola: le spunte della schermata. */
    @PluginMethod
    fun getPermissionsStatus(call: PluginCall) {
        val fg = getPermissionState("location") == PermissionState.GRANTED
        val bg = fg && backgroundLocationGranted()
        val notifPermesso = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getPermissionState("notifications") == PermissionState.GRANTED
        // Permesso concesso ≠ notifiche consentite: l'interruttore di sistema
        // (Realme «Gestisci notifiche: Rifiuta») lo vede solo areNotificationsEnabled.
        val notifAbilitate = try {
            androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()
        } catch (_: Exception) { true }
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val batteria = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || pm.isIgnoringBatteryOptimizations(context.packageName)
        val attivita = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            getPermissionState("activity") == PermissionState.GRANTED
        val ret = JSObject()
        ret.put("location", if (bg) "always" else if (fg) "whileInUse" else "denied")
        ret.put("notifications", notifPermesso && notifAbilitate)
        ret.put("notificationsPermission", notifPermesso)
        ret.put("notificationsEnabled", notifAbilitate)
        ret.put("battery", batteria)
        ret.put("activity", attivita)
        call.resolve(ret)
    }

    /**
     * Tasto «Attiva» della posizione: foreground e poi background, con i
     * dialoghi di sistema (API 30+: la pagina «Posizione» col radio «Consenti
     * sempre»). Risponde con lo stato finale: always / whileInUse / denied.
     */
    @PluginMethod
    fun requestLocationPermissions(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationOnlyCallback")
            return
        }
        locationOnlyCallback(call)
    }

    @PermissionCallback
    private fun locationOnlyCallback(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            val ret = JSObject(); ret.put("location", "denied"); call.resolve(ret); return
        }
        if (!backgroundLocationGranted()) {
            requestPermissionForAlias("backgroundLocation", call, "backgroundOnlyCallback")
            return
        }
        backgroundOnlyCallback(call)
    }

    @PermissionCallback
    private fun backgroundOnlyCallback(call: PluginCall) {
        // Sulla pagina «Posizione» l'utente puo' anche scegliere «Non
        // consentire»: il foreground se ne va insieme al background. Si
        // rilegge TUTTO, non solo il background (29/08/2026, collaudo).
        val fg = getPermissionState("location") == PermissionState.GRANTED
        val ret = JSObject()
        ret.put("location", if (!fg) "denied" else if (backgroundLocationGranted()) "always" else "whileInUse")
        call.resolve(ret)
    }

    /**
     * Tasto «Attiva» delle notifiche: il permesso di runtime (API 33+) e, se
     * l'interruttore di sistema e' spento, la pagina notifiche dell'app.
     * Risponde { granted, enabled, opened }.
     */
    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            getPermissionState("notifications") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("notifications", call, "notificationOnlyCallback")
            return
        }
        notificationOnlyCallback(call)
    }

    @PermissionCallback
    private fun notificationOnlyCallback(call: PluginCall) {
        val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getPermissionState("notifications") == PermissionState.GRANTED
        val enabled = try {
            androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()
        } catch (_: Exception) { true }
        var opened = false
        if (granted && !enabled) { apriImpostazioniNotifiche(); opened = true }
        val ret = JSObject()
        ret.put("granted", granted); ret.put("enabled", enabled); ret.put("opened", opened)
        call.resolve(ret)
    }

    /** Tasto «Attiva» della batteria: la lista di sistema delle esenzioni (vedi checkBatteryOptimization). */
    @PluginMethod
    fun requestBatteryOptimization(call: PluginCall) {
        checkBatteryOptimization(call)
    }

    /** Tasto facoltativo dell'attivita' fisica (sensori anti-teletrasporto). */
    @PluginMethod
    fun requestActivityRecognition(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            getPermissionState("activity") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("activity", call, "activityOnlyCallback")
            return
        }
        activityOnlyCallback(call)
    }

    @PermissionCallback
    private fun activityOnlyCallback(call: PluginCall) {
        val ret = JSObject()
        ret.put("granted", Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || getPermissionState("activity") == PermissionState.GRANTED)
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
        // (22/08/2026) Il JS mandava guideCharacter (nicky/dante) ma nessuno lo
        // leggeva: il receiver in background usava sempre il guideDefault del
        // POI. Si persiste solo se valido, così un valore strano non sporca la
        // chiave letta da GeofenceBroadcastReceiver.resolveGuideVoice.
        val guideCharacter = call.getString("guideCharacter")
            ?.takeIf { it == "nicky" || it == "dante" }
        // (23/08/2026) GATE DI BUSSOLA: se il POI e' ormai alle spalle il
        // racconto d'arrivo si rimanda al fix successivo invece di partire a
        // monumento superato. Acceso di default (e' il comportamento che
        // l'utente si aspetta): si persiste solo se il JS lo manda davvero,
        // cosi' una chiamata senza il campo non spegne niente.
        val bearingGate = call.getBoolean("bearingGate")

        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean("isAutomaticMode", isAutomaticMode)
            putBoolean("isServiceActive", true)
            putString("language", language)
            // (22/08/2026) Stessa chiave che il servizio legge in
            // restoreSettingsFromPrefs: prima le categorie le persisteva solo
            // onStartCommand, quindi se il processo moriva prima che l'intent
            // arrivasse (o con startForegroundService rifiutato) il riavvio
            // STICKY ripartiva con l'insieme vuoto.
            putStringSet("selectedCategories", categories.toSet())
            if (guideCharacter != null) putString("guideCharacter", guideCharacter)
            if (bearingGate != null) putBoolean(BearingGate.PREF_BEARING_GATE, bearingGate)
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
        
        // (29/08/2026, collaudo sul Realme) MAI senza try/catch. Su Android
        // 12+ startForegroundService da un'app NON in primo piano (schermo
        // bloccato, ripresa in background, avvio da notifica differito)
        // lancia ForegroundServiceStartNotAllowedException: qui era l'unico
        // punto scoperto del plugin e faceva cadere l'intera app (FATAL su
        // thread CapacitorPlugins). Ora si degrada come altrove: le prefs
        // sono gia' scritte (isServiceActive=true, categorie), si arma il
        // retry con backoff del watchdog e si risponde ok=false — il JS
        // sa che il servizio partira' appena l'app torna davanti.
        var avviato = true
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            avviato = false
            Log.w("ItaintaPoiPlugin", "startBackgroundPoiService: avvio rifiutato (app in background?): ${e.message}")
            com.itaintasca.app.service.ServiceWatchdog.scheduleRetry(context)
        }
        com.itaintasca.app.service.ServiceWatchdog.schedule(context)
        // Idempotente: copre il caso "permesso ACTIVITY_RECOGNITION appena
        // concesso a servizio già vivo" (onCreate non viene richiamato).
        com.itaintasca.app.geofence.ActivityMonitor.start(context)
        val ret = JSObject()
        ret.put("ok", avviato)
        if (!avviato) ret.put("reason", "foreground_start_not_allowed")
        call.resolve(ret)
    }

    @PluginMethod
    fun syncManualSelection(call: PluginCall) {
        val poisJson = call.getString("poisJson") ?: "[]"
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)

        // (MAP-03) Servizio NON attivo: si salva SOLO la selezione nelle
        // prefs (stessa chiave "itineraryPoisJson" letta da
        // restoreItineraryFromPrefs) e si risponde. Prima si faceva
        // startForegroundService anche ad audioguida spenta: il servizio
        // partiva, si promuoveva in foreground, RadarState.setActive(true)
        // senza nessun monitoraggio — e su Android 12+ da background era un
        // ForegroundServiceStartNotAllowedException. startForegroundService
        // OBBLIGA a startForeground entro 5 s, quindi il "non promuovere" si
        // decide qui, prima di avviare qualcosa.
        if (!prefs.getBoolean("isServiceActive", false)) {
            try {
                val vuota = poisJson.isBlank() || poisJson.trim() == "[]"
                if (vuota) prefs.edit().remove("itineraryPoisJson").apply()
                else prefs.edit().putString("itineraryPoisJson", poisJson).apply()
            } catch (e: Exception) {
                Log.w("ItaintaPoiPlugin", "syncManualSelection: salvataggio prefs fallito: ${e.message}")
            }
            call.resolve()
            return
        }

        val intent = Intent(context, ItaintaBackgroundPoiService::class.java).apply {
            action = ItaintaBackgroundPoiService.ACTION_SYNC_SELECTION
            putExtra("poisJson", poisJson)
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        } catch (e: Exception) {
            // Rifiuto da background: le tappe restano comunque in prefs per
            // il prossimo avvio del servizio.
            Log.w("ItaintaPoiPlugin", "syncManualSelection: avvio servizio rifiutato: ${e.message}")
            try { prefs.edit().putString("itineraryPoisJson", poisJson).apply() } catch (_: Exception) { }
        }
        call.resolve()
    }

    /**
     * (UX-03) Apre la scheda dell'app nelle Impostazioni di sistema: e'
     * l'unico posto dove l'utente puo' riconcedere la posizione «Sempre» o
     * quella precisa dopo un rifiuto. Il JS la chiama dal messaggio
     * «Permesso posizione negato» (statusUpdate) e dalla schermata permessi.
     */
    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        try {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${context.packageName}")
            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            context.startActivity(intent)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Cannot open app settings: ${e.message}")
        }
    }

    /**
     * FINE DEL GIRO: via le tappe dell'itinerario dal geofencing nativo.
     *
     * (23/08/2026) Il JS lo chiama da locationService.unsyncTappeGiroFromNative
     * protetto da `typeof === 'function'`: finora il metodo NON esisteva, la
     * chiamata cadeva nel warn e le tappe di un giro finito restavano
     * registrate come geofence prioritari fino al riavvio del servizio.
     *
     * (28/08/2026) Si usa ACTION_CLEAR_SELECTION, non ACTION_SYNC_SELECTION con
     * lista vuota: quest'ultima ri-registra i recinti solo se in memoria c'e'
     * gia' del radar, quindi in una zona appena caricata (o subito dopo un
     * riavvio del processo) i recinti delle tappe restavano consegnati al
     * sistema. L'azione dedicata azzera i recinti e lastQueryLocation, cosi' il
     * fix successivo ri-registra dal solo radar. Il servizio resta acceso.
     *
     * La pref viene ripulita anche qui, per il caso in cui il processo del
     * servizio non sia vivo: senza, al prossimo avvio a freddo
     * restoreItineraryFromPrefs rimetterebbe in gioco le tappe di un giro
     * gia' chiuso.
     */
    @PluginMethod
    fun clearManualSelection(call: PluginCall) {
        try {
            // Stessa chiave di ItaintaBackgroundPoiService.PREF_ITINERARY_POIS
            // (li' e' private: se un giorno diventa una const del companion,
            // sostituire la stringa con quella).
            context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                .edit().remove("itineraryPoisJson").apply()
        } catch (e: Exception) {
            Log.w("ItaintaPoiPlugin", "clearManualSelection: pulizia prefs fallita: ${e.message}")
        }
        try {
            // Solo se il servizio e' dichiarato attivo: startForegroundService
            // su un servizio spento lo farebbe RIPARTIRE ad audioguida chiusa
            // (e su Android 12+ rischierebbe ForegroundServiceStartNotAllowed).
            val attivo = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                .getBoolean("isServiceActive", false)
            if (attivo) {
                val intent = Intent(context, ItaintaBackgroundPoiService::class.java).apply {
                    action = ItaintaBackgroundPoiService.ACTION_CLEAR_SELECTION
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            }
        } catch (e: Exception) {
            Log.w("ItaintaPoiPlugin", "clearManualSelection: sync al servizio fallita: ${e.message}")
        }
        // Sempre resolve: il JS non deve mai restare appeso alla fine di un giro.
        call.resolve()
    }

    /**
     * L'UTENTE HA CHIUSO IL BANNER DI QUEL POI: non lo si riannuncia al fix
     * successivo.
     *
     * (23/08/2026) Chiamato da ApproachBanner.handleClose, anche questo
     * protetto da `typeof === 'function'` e finora inesistente: lato web il POI
     * veniva messo fra i "dismissed", ma il servizio nativo non lo sapeva e al
     * fix dopo rifaceva banner e teaser.
     *
     * Si scrive lo stato EXITED in Room, lo stesso che il receiver mette
     * all'uscita dal geofence: il suo timestamp fa da cooldown
     * (APPROACH_RETRIGGER_COOLDOWN_MS, 30 min) sia nel receiver sia nel
     * valutatore predittivo del servizio, quindi vale per entrambi i percorsi.
     * Non e' un "mai piu'": passata la mezz'ora il POI torna annunciabile,
     * che e' il comportamento giusto per chi ci ripassa davvero.
     */
    @PluginMethod
    fun markPoiExited(call: PluginCall) {
        val poiId = call.getString("poiId")?.trim().orEmpty()
        if (poiId.isEmpty()) {
            // Nemmeno qui un reject: il JS chiama e va avanti.
            val ret = JSObject()
            ret.put("ok", false)
            ret.put("reason", "missing_poiId")
            return call.resolve(ret)
        }
        // CHIUDERE IL BANNER VUOL DIRE «NON MI INTERESSA», NON «RIPETIMELO PIU'
        // TARDI» (23/08/2026). Prima di scrivere lo stato si TACE su quel POI:
        // se l'utente chiude il banner mentre il teaser sta ancora parlando,
        // lasciar finire la frase e' esattamente il contrario di quello che ha
        // chiesto. La funzione e' per-POI: non tocca una guida diversa in
        // riproduzione. Fuori dalla coroutine perche' e' immediata e non deve
        // aspettare il giro su Room.
        try {
            com.itaintasca.app.geofence.GeofenceBroadcastReceiver.stopSpeakingForPoi(context, poiId)
        } catch (e: Exception) {
            Log.w("ItaintaPoiPlugin", "stop voce per $poiId non riuscito: ${e.message}")
        }
        kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
            val ret = JSObject()
            try {
                com.itaintasca.app.db.PoiDatabase.getInstance(context).poiDao().updateTriggerState(
                    com.itaintasca.app.db.TriggerStateEntity(
                        poiId,
                        com.itaintasca.app.db.TriggerState.EXITED
                    )
                )
                ret.put("ok", true)
            } catch (e: Exception) {
                Log.w("ItaintaPoiPlugin", "markPoiExited fallita per $poiId: ${e.message}")
                ret.put("ok", false)
                ret.put("reason", e.message ?: "db_error")
            }
            call.resolve(ret)
        }
    }

    /**
     * CRUSCOTTO DEL NAVIGATORE SUL DISPLAY SPENTO (28/08/2026).
     *
     * Il JS (App.tsx, a ogni cambio di tappa o di svolta) manda titolo e corpo
     * gia' composti — gli stessi del cruscotto in app — e qui NON si crea
     * nessuna notifica nuova: si riscrive quella del foreground service, che
     * e' `setOngoing(true)` e quindi l'utente non puo' scartarla con uno swipe.
     * E' l'equivalente Android della Live Activity iOS.
     *
     * Con `attivo=false` (giro finito o in pausa) la notifica torna al testo
     * normale del radar.
     *
     * SERVIZIO SPENTO = NON SI FA NULLA. Mai `startForegroundService` da qui:
     * farebbe ripartire l'audioguida solo per scrivere una riga di testo (e su
     * Android 12+ sarebbe un ForegroundServiceStartNotAllowedException). Si
     * risponde ok=false e il JS ripiega sulla notifica locale.
     */
    @PluginMethod
    fun updateNavBanner(call: PluginCall) {
        val ret = JSObject()
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("isServiceActive", false)) {
            ret.put("ok", false)
            ret.put("reason", "service_inactive")
            return call.resolve(ret)
        }
        try {
            val intent = Intent(context, ItaintaBackgroundPoiService::class.java).apply {
                action = ItaintaBackgroundPoiService.ACTION_NAV_BANNER
                putExtra("titolo", call.getString("titolo") ?: "")
                putExtra("corpo", call.getString("corpo") ?: "")
                putExtra("attivo", call.getBoolean("attivo") ?: false)
                // (29/08/2026) URL della foto della tappa: icona grande della
                // notifica sulla lock screen. Vuoto = nessuna foto.
                putExtra("foto", call.getString("foto") ?: "")
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            ret.put("ok", true)
        } catch (e: Exception) {
            Log.w("ItaintaPoiPlugin", "updateNavBanner: invio al servizio fallito: ${e.message}")
            ret.put("ok", false)
            ret.put("reason", e.message ?: "service_error")
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun stopBackgroundPoiService(call: PluginCall) {
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("isServiceActive", false).apply()
        com.itaintasca.app.geofence.GeofenceBroadcastReceiver.stopSpeaking(context)
        com.itaintasca.app.service.ServiceWatchdog.cancel(context)
        val intent = Intent(context, ItaintaBackgroundPoiService::class.java)
        context.stopService(intent)
        // (22/08/2026) Se il processo del servizio non è vivo, stopService non
        // passa da onDestroy e l'OS tiene registrati fino a 100 geofence: il
        // receiver continuava a ricevere transizioni (e a parlare) ad
        // audioguida "spenta". Si rimuovono qui, best-effort.
        try {
            com.itaintasca.app.geofence.GeofenceManager(context).removeAllGeofences()
        } catch (e: Exception) {
            android.util.Log.w("ItaintaBackgroundPoiPlugin", "removeAllGeofences allo stop fallita: ${e.message}")
        }
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
                // (22/08/2026) "Azzera storico" lasciava intatto il set dei
                // teaser radar già notificati: quei POI non tornavano mai.
                context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
                    .edit().remove("radarTeaserNotified").apply()
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
        // (22/08/2026) Era sempre mode=w: in auto Google Maps partiva con la
        // navigazione a piedi. Il JS passa la modalità corrente (default piedi).
        val navMode = if (call.getString("mode") == "driving") "d" else "w"
        val gmmIntentUri = Uri.parse("google.navigation:q=$lat,$lon&mode=$navMode")
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
     *
     * (23/08/2026) La mappa delle lingue e il criterio «voce usabile offline»
     * NON sono più riscritti qui: sono quelli di
     * GeofenceBroadcastReceiver.localeForLang/hasOfflineVoice, gli stessi che
     * decidono al momento di parlare. Prima erano due copie e potevano
     * rispondere in modo diverso — il download veniva approvato e poi, in
     * strada, la voce non c'era. Cambia anche il verso del dubbio: se il motore
     * non espone l'elenco delle voci non si dichiara più `false` (che avrebbe
     * fermato il download su telefoni perfettamente capaci), si dice `true` e
     * il controllo al momento di parlare farà da rete di sicurezza.
     */
    @PluginMethod
    fun checkOfflineTtsVoice(call: PluginCall) {
        val lang = call.getString("language") ?: "it"
        val locale = com.itaintasca.app.geofence.GeofenceBroadcastReceiver.localeForLang(lang)
        var tts: android.speech.tts.TextToSpeech? = null
        tts = android.speech.tts.TextToSpeech(context) { status ->
            val ret = JSObject()
            val engine = tts
            if (status == android.speech.tts.TextToSpeech.SUCCESS && engine != null) {
                val res = try {
                    engine.isLanguageAvailable(locale)
                } catch (_: Exception) {
                    android.speech.tts.TextToSpeech.LANG_NOT_SUPPORTED
                }
                val available = res >= android.speech.tts.TextToSpeech.LANG_AVAILABLE
                ret.put("available", available)
                // Una voce può esserci ma richiedere la rete: offline, silenzio.
                ret.put(
                    "offlineVoice",
                    available &&
                        com.itaintasca.app.geofence.GeofenceBroadcastReceiver
                            .hasOfflineVoice(engine, locale)
                )
            } else {
                ret.put("available", false)
                ret.put("offlineVoice", false)
            }
            try { engine?.shutdown() } catch (_: Exception) { }
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
     * Con `force=true` (29/08/2026) a servizio spento si parla COMUNQUE con
     * il motore diretto del plugin (vedi speakDirect): è il ripiego che non
     * muore mai quando Azure/Google non rispondono.
     */
    @PluginMethod
    fun speakText(call: PluginCall) {
        val text = call.getString("text")?.trim().orEmpty()
        if (text.isEmpty()) return call.reject("Missing text")
        val ret = JSObject()
        val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        if (!prefs.getBoolean("isServiceActive", false)) {
            if (call.getBoolean("force") != true) {
                ret.put("ok", false)
                ret.put("reason", "service_inactive")
                return call.resolve(ret)
            }
            val id = "direct_${System.currentTimeMillis()}"
            initDirectTts { engine ->
                val out = JSObject()
                if (engine != null && speakDirect(text, id)) {
                    out.put("ok", true)
                    out.put("direct", true)
                    out.put("id", id)
                } else {
                    out.put("ok", false)
                    out.put("reason", "direct_tts_failed")
                }
                call.resolve(out)
            }
            return
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
    // VOCE DI SISTEMA DIRETTA (29/08/2026): il ripiego che non muore mai.
    // La coda dei teaser vive nel servizio in background e, a servizio
    // spento, scarta tutto: l'app in primo piano con Azure/Google giù
    // restava MUTA (nella WebView Android speechSynthesis spesso non
    // esiste). Qui un TextToSpeech tutto del plugin, indipendente dal
    // servizio: parla finché il telefono ha una voce. Spezza i testi lunghi
    // (il motore rifiuta oltre getMaxSpeechInputLength, 4000 caratteri) e
    // avvisa il JS a fine lettura con l'evento directSpeechFinished {id}.
    // ------------------------------------------------------------------
    private var directTts: android.speech.tts.TextToSpeech? = null
    @Volatile private var directTtsReady = false
    @Volatile private var directSpeechId: String? = null
    @Volatile private var directLastChunkId: String? = null

    private fun initDirectTts(onReady: (android.speech.tts.TextToSpeech?) -> Unit) {
        val existing = directTts
        if (existing != null && directTtsReady) return onReady(existing)
        var created: android.speech.tts.TextToSpeech? = null
        created = android.speech.tts.TextToSpeech(context.applicationContext) { status ->
            val engine = created
            if (status == android.speech.tts.TextToSpeech.SUCCESS && engine != null) {
                engine.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) { }
                    override fun onDone(utteranceId: String?) { onDirectChunkFinished(utteranceId) }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) { onDirectChunkFinished(utteranceId) }
                    override fun onError(utteranceId: String?, errorCode: Int) { onDirectChunkFinished(utteranceId) }
                    override fun onStop(utteranceId: String?, interrupted: Boolean) { onDirectChunkFinished(utteranceId) }
                })
                directTts = engine
                directTtsReady = true
                onReady(engine)
            } else {
                directTtsReady = false
                Log.e("ItaintaPlugin", "TTS diretto: inizializzazione fallita ($status)")
                onReady(null)
            }
        }
    }

    /** Fine dell'ULTIMO pezzo = fine della lettura: si avvisa il JS una volta sola. */
    private fun onDirectChunkFinished(utteranceId: String?) {
        val id = directSpeechId ?: return
        if (utteranceId == null || utteranceId != directLastChunkId) return
        directSpeechId = null
        directLastChunkId = null
        abandonDirectFocus()
        val data = JSObject()
        data.put("id", id)
        notifyListeners("directSpeechFinished", data, true)
    }

    /**
     * Fuoco audio della voce diretta: TextToSpeech da solo non lo chiede, e
     * senza fuoco Spotify/la radio non si abbassano. Transitorio con ducking,
     * come fa la coda dei teaser (requestFocus in GeofenceBroadcastReceiver).
     */
    private var directFocusRequest: android.media.AudioFocusRequest? = null
    private fun requestDirectFocus() {
        try {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val req = android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attrs)
                    .build()
                directFocusRequest = req
                am.requestAudioFocus(req)
            } else {
                @Suppress("DEPRECATION")
                am.requestAudioFocus(null, android.media.AudioManager.STREAM_MUSIC, android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            }
        } catch (_: Exception) { }
    }
    private fun abandonDirectFocus() {
        try {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as android.media.AudioManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                directFocusRequest?.let { am.abandonAudioFocusRequest(it) }
                directFocusRequest = null
            } else {
                @Suppress("DEPRECATION")
                am.abandonAudioFocus(null)
            }
        } catch (_: Exception) { }
    }

    /**
     * Spezza il testo in pezzi che il motore accetta, ai confini di frase;
     * una frase più lunga del tetto viene tagliata agli spazi.
     */
    private fun spezzaPerVoce(text: String, max: Int): List<String> {
        val pulito = text.replace(Regex("\\s+"), " ").trim()
        if (pulito.isEmpty()) return emptyList()
        if (pulito.length <= max) return listOf(pulito)
        val frasi = Regex("[^.!?…]+[.!?…]+\\s*|[^.!?…]+$").findAll(pulito).map { it.value }.toList()
        val pezzi = ArrayList<String>()
        val cur = StringBuilder()
        for (f in frasi) {
            if (f.length > max) {
                if (cur.isNotBlank()) { pezzi.add(cur.toString().trim()); cur.setLength(0) }
                var resto = f
                while (resto.length > max) {
                    val taglio = resto.lastIndexOf(' ', max).let { if (it < max / 2) max else it }
                    pezzi.add(resto.substring(0, taglio).trim())
                    resto = resto.substring(taglio).trim()
                }
                if (resto.isNotBlank()) cur.append(resto).append(' ')
                continue
            }
            if (cur.length + f.length > max && cur.isNotBlank()) { pezzi.add(cur.toString().trim()); cur.setLength(0) }
            cur.append(f)
        }
        if (cur.isNotBlank()) pezzi.add(cur.toString().trim())
        return pezzi.filter { it.isNotBlank() }
    }

    /** Parla subito col motore del plugin. true = presa in carico. */
    private fun speakDirect(text: String, id: String): Boolean {
        val tts = directTts ?: return false
        val appContext = context.applicationContext
        val prefs = appContext.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
        try {
            // Stessa classe audio del navigatore: abbassa la musica, esce in auto.
            tts.setAudioAttributes(
                android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            )
        } catch (_: Exception) { }
        val lang = prefs.getString("language", "it") ?: "it"
        try { tts.setLanguage(com.itaintasca.app.geofence.GeofenceBroadcastReceiver.localeForLang(lang)) } catch (_: Exception) { }
        com.itaintasca.app.geofence.GeofenceBroadcastReceiver.applyTtsGender(tts, appContext)

        val tetto = (try { android.speech.tts.TextToSpeech.getMaxSpeechInputLength() } catch (_: Exception) { 4000 })
            .coerceIn(500, 3800) - 100
        val pezzi = spezzaPerVoce(com.itaintasca.app.geofence.GeofenceBroadcastReceiver.speakableText(text), tetto)
        if (pezzi.isEmpty()) return false

        directSpeechId = id
        directLastChunkId = "$id#${pezzi.size - 1}"
        requestDirectFocus()
        val params = android.os.Bundle()
        params.putFloat(android.speech.tts.TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f)
        for ((i, pezzo) in pezzi.withIndex()) {
            val modo = if (i == 0) android.speech.tts.TextToSpeech.QUEUE_FLUSH else android.speech.tts.TextToSpeech.QUEUE_ADD
            val r = tts.speak(pezzo, modo, params, "$id#$i")
            if (r != android.speech.tts.TextToSpeech.SUCCESS) {
                if (i == 0) {
                    directSpeechId = null
                    directLastChunkId = null
                    abandonDirectFocus()
                    return false
                }
                // I pezzi già accodati si leggono; la fine sarà l'ultimo accettato,
                // così il JS riceve comunque il suo evento.
                directLastChunkId = "$id#${i - 1}"
                break
            }
        }
        return true
    }

    /** Ferma la voce diretta. Gli id vanno giù PRIMA: l'onStop non deve avvisare il JS. */
    @PluginMethod
    fun stopSpeakText(call: PluginCall) {
        directSpeechId = null
        directLastChunkId = null
        try { directTts?.stop() } catch (_: Exception) { }
        abandonDirectFocus()
        call.resolve()
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
     * restano best-effort. Alla ricezione sincronizza subito il mirror —
     * ascolti E possesso (`user_poi_purchases`, al massimo ogni 6 ore): e'
     * l'unico momento certo in cui il nativo ha in mano un token fresco.
     */
    @PluginMethod
    fun setUserContext(call: PluginCall) {
        val userId = call.getString("userId") ?: ""
        val accessToken = call.getString("accessToken") ?: ""
        // Identità utente cifrata (EncryptedSharedPreferences): prima
        // userId/accessToken erano in chiaro in "ItaintaPrefs" insieme a
        // impostazioni non sensibili. Le altre prefs restano invariate.
        // (SEC-08) putUserContext: nello store di ripiego in chiaro il token
        // NON viene scritto.
        val precedente = try {
            com.itaintasca.app.service.SecurePrefs.get(context)
                .getString(com.itaintasca.app.service.ListeningHistoryStore.PREF_USER_ID, "") ?: ""
        } catch (_: Exception) { "" }
        com.itaintasca.app.service.SecurePrefs.putUserContext(context, userId, accessToken)
        // (SEC-02) Cambio utente sullo stesso telefono: via il mirror in
        // memoria dell'utente precedente (quello su disco e' gia' per utente).
        if (precedente != userId) com.itaintasca.app.service.ListeningHistoryStore.clearMemory()
        // (SEC-10) Scope condiviso, serializzato e con timeout: niente piu'
        // CoroutineScope(Dispatchers.IO).launch fire-and-forget.
        val appContext = context.applicationContext
        com.itaintasca.app.service.HistoryScope.scope.launch {
            try {
                com.itaintasca.app.service.ListeningHistoryStore.syncFromCloud(appContext)
            } catch (_: Exception) { /* best-effort */ }
        }
        call.resolve()
    }

    /**
     * (SEC-02) LOGOUT: via userId e access token dallo store cifrato e il
     * mirror in memoria dello storico ascolti e del possesso. Le chiavi per
     * utente su disco (`listened_poi_ids_<userId>`, `owned_poi_ids_<userId>`)
     * restano: sono gia' isolate per account e
     * tornano utili se lo stesso utente rientra. Da chiamare dal JS insieme a
     * supabase.auth.signOut(). Mai un reject: il logout deve sempre finire.
     */
    @PluginMethod
    fun clearUserContext(call: PluginCall) {
        try {
            com.itaintasca.app.service.SecurePrefs.clearUserContext(context)
        } catch (e: Exception) {
            Log.w("ItaintaPoiPlugin", "clearUserContext: pulizia SecurePrefs fallita: ${e.message}")
        }
        try {
            com.itaintasca.app.service.ListeningHistoryStore.clearMemory()
        } catch (_: Exception) { }
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

                // LA LINGUA DEL PACCHETTO (23/08/2026). Un pacchetto porta UNA
                // lingua sola: quella scelta al download. Se l'utente cambia
                // lingua dopo, il testo che c'è è in un'altra lingua, e finora
                // il POI o taceva senza spiegazioni (ArrivalWorker) o si faceva
                // leggere testo italiano con la pronuncia tedesca (qui).
                // Adesso si dice com'è: si risponde `lang_mismatch` con le due
                // lingue, e si legge lo stesso SOLO se il chiamante ha già
                // chiesto all'utente e passa acceptOtherLanguage=true. Mai una
                // scelta presa al posto suo, mai il silenzio muto.
                val pkgLang = db.offlineDao().getPoiPackageLanguage(poiId)
                val mismatch = mp3 == null && !text.isNullOrBlank() &&
                    pkgLang != null && !pkgLang.equals(lang, ignoreCase = true)
                if (mismatch && call.getBoolean("acceptOtherLanguage", false) != true) {
                    ret.put("ok", false)
                    ret.put("reason", "lang_mismatch")
                    ret.put("packageLanguage", pkgLang)
                    ret.put("userLanguage", lang)
                    com.itaintasca.app.geofence.GeofenceBroadcastReceiver
                        .notifyPackageLanguage(context, pkgLang!!, lang)
                    call.resolve(ret)
                    return@launch
                }
                // L'utente ha accettato di ascoltare nell'altra lingua: glielo
                // si conferma nella risposta, così la scheda può dirlo.
                if (mismatch) ret.put("langMismatch", true)

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
                    // ACQUISTO (29/08/2026): «chi paga un'audioguida non la
                    // paga mai piu'». Qui — e solo qui, nel nativo — l'utente
                    // ha davvero chiesto l'addebito a crediti, quindi il POI
                    // entra subito nel mirror del possesso e il riascolto
                    // offline successivo e' gratis, senza aspettare che la
                    // riconciliazione scriva user_poi_purchases sul server.
                    // Il Day Pass (ramo sopra) NON ci entra: e' accesso a
                    // tempo, non possesso.
                    com.itaintasca.app.service.ListeningHistoryStore.markOwned(context, poiId)
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
        // Il motore della voce diretta è del plugin: si chiude con lui.
        directSpeechId = null
        directLastChunkId = null
        try { directTts?.stop(); directTts?.shutdown() } catch (_: Exception) { }
        directTts = null
        directTtsReady = false
        super.handleOnDestroy()
    }
}
