package com.itaintasca.app.geofence

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.itaintasca.app.service.ItaintaBackgroundPoiService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == "android.intent.action.QUICKBOOT_POWERON") {
            Log.d("BootReceiver", "Device rebooted, checking if audioguide should restart")
            
            val prefs = context.getSharedPreferences("ItaintaPrefs", Context.MODE_PRIVATE)
            val shouldRestart = prefs.getBoolean("isServiceActive", false)
            
            if (shouldRestart) {
                Log.d("BootReceiver", "Restarting ItaintaBackgroundPoiService")
                val serviceIntent = Intent(context, ItaintaBackgroundPoiService::class.java)
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent)
                    } else {
                        context.startService(serviceIntent)
                    }
                } catch (e: Exception) {
                    // Android 12+: avviare un FGS 'location' DA BACKGROUND al boot è
                    // vietato → non forzarlo (niente crash, niente ottica-policy
                    // negativa del Play). Il servizio riparte alla riapertura
                    // dell'app; i geofence dell'OS restano la rete di sicurezza.
                    Log.w("BootReceiver", "Avvio al boot non consentito: ${e.message}")
                }
            }
        }
    }
}
