// FIREBASE TEST LAB — NAVIGATORE NATIVO A SCHERMO SPENTO (21/11/2026).
// Sorgente gemella: scratch/collaudo-notte/test-lab/CollaudoSchermoSpentoTest.kt (tenere uguali).
// Lanciato da Oracle con /root/collaudo-notte/test-lab/lancia-test-lab.sh (virtuale ogni notte, fisico a notti alterne).
//
// Cosa fa, sul telefono di Test Lab:
//  1. dà i permessi di posizione e fa dell'app il «mock location app» (appops, dalla shell dell'instrumentation);
//  2. apre l'app (così il servizio di tipo location parte da app in primo piano, come col plugin) e accende la
//     modalità collaudo: SOLO nella build di debug con collaudo acceso il servizio accetta i fix simulati;
//  3. avvia il servizio nativo vero (ItaintaBackgroundPoiService) con gli stessi extra del plugin;
//  4. consegna a NavFollower la rotta del banco notturno (/sdcard/Download/collaudo-in/ se il lanciatore l'ha mandata
//     con --other-files, altrimenti asset collaudo/rotta.json; caso nav_spento) e SPEGNE LO
//     SCHERMO (KEYCODE_SLEEP) — nessun battito JS: dopo 8 s parla il nativo;
//  4b. (22/11) manda l'app DIETRO (HOME) prima di spegnere lo schermo, registra importance/procState del processo
//     («TESTLAB STATO …») e a metà traccia forza il DOZE (deviceidle force-idle) e l'App Standby (am set-inactive):
//     il nativo deve continuare a parlare. Nessuna esenzione dal Doze (whitelist tolta).
//  5. riproduce la traccia GPS (asset collaudo/traccia.json, [[lat,lon,acc,tMs,vel]…]) col provider fused in mock,
//     ai tempi veri;
//  6. scrive il registro (righe «NAV … NATIVO DICE[…]», guide, avvisi) in /sdcard/Download/collaudo/registro.txt
//     (scritto dalla shell con tee: l'app non ha permessi di archivio) e anche in logcat (tag CollaudoTestLab).
// Dipendenze: solo quelle androidTest già presenti (androidx.test.ext:junit, espresso-core → runner).
package com.itaintasca.app

import android.Manifest
import android.content.Intent
import android.location.Location
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Tasks
import com.itaintasca.app.service.ItaintaBackgroundPoiService
import com.itaintasca.app.service.NavFollower
import com.itaintasca.app.service.RegistroCollaudo
import org.json.JSONArray
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class CollaudoSchermoSpentoTest {
    private val tag = "CollaudoTestLab"

    private fun shell(cmd: String): String {
        val sh = InstrumentationRegistry.getInstrumentation().uiAutomation
        val pfd = sh.executeShellCommand(cmd)
        return ParcelFileDescriptor.AutoCloseInputStream(pfd).bufferedReader().use { it.readText() }
    }

    /** Scrive un file in /sdcard dalla shell (tee legge lo stdin): l'app non ha permessi di archivio. */
    private fun scriviDaShell(percorso: String, testo: String) {
        val sh = InstrumentationRegistry.getInstrumentation().uiAutomation
        val pfds = sh.executeShellCommandRw("tee $percorso")
        val out = pfds[0]
        val inp = pfds[1]
        ParcelFileDescriptor.AutoCloseOutputStream(inp).use { it.write(testo.toByteArray()) }
        ParcelFileDescriptor.AutoCloseInputStream(out).use { it.readBytes() }
    }

    @Test
    fun navigatoreASchermoSpento() {
        val strum = InstrumentationRegistry.getInstrumentation()
        val ctx = strum.targetContext
        val pkg = ctx.packageName
        for (p in listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION,
                "android.permission.ACCESS_BACKGROUND_LOCATION", "android.permission.POST_NOTIFICATIONS",
                "android.permission.ACTIVITY_RECOGNITION"))
            shell("pm grant $pkg $p")
        shell("appops set $pkg android:mock_location allow")
        shell("settings put global window_animation_scale 0")
        // (22/11/2026) NIENTE esenzione dal Doze: l'app deve reggere come sul telefono di un utente qualunque.
        shell("dumpsys deviceidle whitelist -$pkg")
        shell("input keyevent KEYCODE_WAKEUP")
        shell("wm dismiss-keyguard")

        // Registro su disco dell'app, vuoto, modalità collaudo accesa (sblocca i fix simulati solo in debug).
        RegistroCollaudo.dir = ctx.filesDir
        RegistroCollaudo.svuota()
        RegistroCollaudo.imposta(true)

        // L'app in primo piano: un servizio di tipo location non parte da un'app in background (Android 12+).
        ctx.startActivity(Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        SystemClock.sleep(8000)

        val fused = LocationServices.getFusedLocationProviderClient(ctx)
        Tasks.await(fused.setMockMode(true), 20, TimeUnit.SECONDS)

        // La rotta di stanotte, se il lanciatore l'ha mandata sul telefono (--other-files, letta dalla shell: l'app non
        // ha permessi di archivio); altrimenti quella dentro l'APK.
        val rottaSd = shell("cat /sdcard/Download/collaudo-in/rotta.json").trim()
        val tracciaSd = shell("cat /sdcard/Download/collaudo-in/traccia.json").trim()
        val daSd = rottaSd.startsWith("{") && tracciaSd.startsWith("[")
        val rotta = if (daSd) rottaSd else strum.context.assets.open("collaudo/rotta.json").bufferedReader().readText()
        val traccia = JSONArray(if (daSd) tracciaSd else strum.context.assets.open("collaudo/traccia.json").bufferedReader().readText())
        RegistroCollaudo.scrivi("TESTLAB rotta da ${if (daSd) "sdcard" else "apk"}: ${traccia.length()} fix")
        // Prima posizione già sul percorso, così il primo fix del servizio non è a Mountain View.
        val f0 = traccia.getJSONArray(0)
        fun mock(lat: Double, lon: Double, acc: Double, vel: Double) {
            val l = Location("fused").apply {
                latitude = lat; longitude = lon; accuracy = acc.toFloat(); speed = vel.toFloat()
                time = System.currentTimeMillis(); elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
            }
            Tasks.await(fused.setMockLocation(l), 10, TimeUnit.SECONDS)
        }
        mock(f0.getDouble(0), f0.getDouble(1), f0.getDouble(2), 0.0)

        // Il servizio vero, avviato come lo avvia il plugin (startBackgroundPoiService): stesse chiavi di prefs ed extra.
        ctx.getSharedPreferences("ItaintaPrefs", android.content.Context.MODE_PRIVATE).edit()
            .putBoolean("isAutomaticMode", true).putBoolean("isServiceActive", true).putString("language", "it").commit()
        ctx.startForegroundService(Intent(ctx, ItaintaBackgroundPoiService::class.java)
            .putExtra("isAutomaticMode", true).putExtra("guideMode", "walking").putExtra("transportPref", "piedi")
            .putExtra("language", "it").putStringArrayListExtra("categories", arrayListOf<String>())
            .putExtra("initialLat", f0.getDouble(0)).putExtra("initialLon", f0.getDouble(1)))
        SystemClock.sleep(5000)

        check(NavFollower.setRoute(rotta, SystemClock.elapsedRealtime())) { "rotta rifiutata dal follower" }
        RegistroCollaudo.scrivi("TESTLAB rotta consegnata, schermo spento")

        // BATTERIA (22/11/2026): statistiche azzerate e telefono «staccato» (sui telefoni di Test Lab è in carica e
        // batterystats non conterebbe il consumo); a fine traccia il dump dell'app va in batterystats.txt.
        shell("dumpsys battery unplug")
        shell("dumpsys batterystats --reset")
        RegistroCollaudo.scrivi("TESTLAB batteria azzerata uid=${ctx.applicationInfo.uid}")

        // (22/11/2026, committente: «deve funzionare il nativo e in background») l'app va DIETRO (HOME) prima dello
        // schermo spento, come chi mette il telefono in tasca; lo stato del processo si registra durante la traccia.
        shell("input keyevent KEYCODE_HOME")
        SystemClock.sleep(1500)
        fun statoProcesso(quando: String) {
            val info = android.app.ActivityManager.RunningAppProcessInfo()
            android.app.ActivityManager.getMyMemoryState(info)
            val ps = shell("dumpsys activity processes $pkg").lineSequence()
                .mapNotNull { Regex("""(procState|curProcState|setProcState)=(\S+)""").find(it)?.value }.firstOrNull() ?: "?"
            val davanti = shell("dumpsys activity activities").lineSequence()
                .firstOrNull { it.contains("mResumedActivity") || it.contains("topResumedActivity") }?.trim() ?: "?"
            val nostra = davanti.contains(pkg)
            RegistroCollaudo.scrivi("TESTLAB STATO $quando importance=${info.importance} $ps attivita_davanti=${if (nostra) "app" else "altro"} doze=${shell("dumpsys deviceidle get deep").trim()}")
        }
        statoProcesso("dopo-home")

        shell("input keyevent KEYCODE_SLEEP") // SCHERMO SPENTO: da qui parla solo il nativo
        val t0 = SystemClock.elapsedRealtime()
        val tPrimo = traccia.getJSONArray(0).getLong(3)
        val meta = traccia.length() / 2
        for (i in 0 until traccia.length()) {
            val f = traccia.getJSONArray(i)
            if (i == traccia.length() / 4 || i == traccia.length() * 3 / 4) statoProcesso("traccia-$i")
            // DOZE a metà traccia: il telefono in tasca da qualche minuto. force-idle vuole schermo spento e batteria
            // staccata (già fatto); set-inactive mette l'app in App Standby se il sistema lo consente.
            if (i == meta) {
                val doze = shell("dumpsys deviceidle force-idle").trim().replace('\n', ' ')
                val standby = shell("am set-inactive $pkg true").trim().replace('\n', ' ')
                val inattiva = shell("am get-inactive $pkg").trim().replace('\n', ' ')
                RegistroCollaudo.scrivi("TESTLAB DOZE forzato: «$doze» stato=${shell("dumpsys deviceidle get deep").trim()} standby=«${standby.ifEmpty { "ok" }}» $inattiva")
            }
            val attesa = (f.getLong(3) - tPrimo) - (SystemClock.elapsedRealtime() - t0)
            if (attesa > 0) SystemClock.sleep(attesa)
            try {
                mock(f.getDouble(0), f.getDouble(1), f.getDouble(2), f.optDouble(4, 0.0))
            } catch (e: Exception) {
                RegistroCollaudo.scrivi("TESTLAB fix $i non consegnato: ${e.message}")
            }
        }
        SystemClock.sleep(30_000) // l'arrivo e la coda della voce
        statoProcesso("fine")
        shell("dumpsys deviceidle unforce")
        shell("am set-inactive $pkg false")
        val schermo = shell("dumpsys power").lineSequence().firstOrNull { it.contains("mWakefulness=") }?.trim() ?: "?"
        RegistroCollaudo.scrivi("TESTLAB fine traccia: ${traccia.length()} fix, $schermo, durata_s=${(SystemClock.elapsedRealtime() - t0) / 1000}")
        val batt = shell("dumpsys batterystats $pkg")
        shell("dumpsys battery reset")

        val righe = RegistroCollaudo.tutte()
        righe.forEach { Log.i(tag, it) }
        val progress = NavFollower.progress(SystemClock.elapsedRealtime()).toString()
        Log.i(tag, "PROGRESS $progress")
        shell("mkdir -p /sdcard/Download/collaudo")
        scriviDaShell("/sdcard/Download/collaudo/registro.txt", righe.joinToString("\n") + "\n")
        scriviDaShell("/sdcard/Download/collaudo/progress.txt", progress + "\n")
        scriviDaShell("/sdcard/Download/collaudo/batterystats.txt", batt)
        try { Tasks.await(fused.setMockMode(false), 10, TimeUnit.SECONDS) } catch (_: Exception) { }
        RegistroCollaudo.imposta(false)
    }
}
