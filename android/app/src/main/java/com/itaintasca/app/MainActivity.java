package com.itaintasca.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.itaintasca.app.plugin.ItaintaBackgroundPoiPlugin;
import com.itaintasca.app.service.ServiceWatchdog;
import java.util.regex.Pattern;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9_:.-]{1,80}$");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ItaintaBackgroundPoiPlugin.class);
        // Senza questa registrazione il plugin audio non esiste a runtime e ogni
        // chiamata a WipBackgroundAudio fallisce con "not implemented":
        // l'audioguida restava confinata alla WebView e si interrompeva a schermo spento.
        registerPlugin(WipBackgroundAudioPlugin.class);
        super.onCreate(savedInstanceState);
        
        // Attiva il Watchdog per il servizio di background
        ServiceWatchdog.Companion.schedule(this);

        // I flag showWhenLocked/turnScreenOn sono stati rimossi (policy Play,
        // ago 2026): l'arrivo al POI è una notifica heads-up sonora, come su
        // iOS — l'audio parte comunque dal servizio, non serve accendere lo schermo.

        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        // --- 1. Check-in logic (sequential itinerary) ---
        if ("ACTION_CHECKIN".equals(intent.getAction())) {
            String poiId = intent.getStringExtra("poiId");
            // (22/08/2026) L'extra finiva in evaluateJavascript senza escape:
            // whitelist + JSONObject.quote, mai interpolazione diretta.
            if (!isSafeId(poiId)) {
                Log.w(TAG, "ACTION_CHECKIN con poiId non valido, ignorato");
                return;
            }
            final String quotedPoiId = JSONObject.quote(poiId);
            getBridge().getWebView().post(() -> {
                String js = "window.dispatchEvent(new CustomEvent('wip-itinerary-checkin', { detail: { poiId: "
                        + quotedPoiId + " } }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
            return;
        }

        // --- 2. Deep link logic ---
        if (!Intent.ACTION_VIEW.equals(intent.getAction())) return;
        
        Uri uri = intent.getData();
        if (uri == null) return;
        
        String scheme = uri.getScheme();
        String host = uri.getHost();
        
        // itainta://poi/{poiId}?guide={guide}
        if ("itainta".equals(scheme) && "poi".equals(host)) {
            String path = uri.getPath(); // "/poiId"
            String poiId = (path != null && path.length() > 1) ? path.substring(1) : null;
            String guide = uri.getQueryParameter("guide");

            if (!isSafeId(poiId)) {
                Log.w(TAG, "Deep link con poiId non valido, ignorato");
                return;
            }
            final String safeGuide = isSafeId(guide) ? guide : "nicky";

            // A cold start l'evento JS parte prima che React monti i listener e
            // va perso: persistiamo il deep link, il JS lo consuma all'avvio
            // via ItaintaBackgroundPoiPlugin.getPendingDeepLink().
            getSharedPreferences("ItaintaPrefs", MODE_PRIVATE).edit()
                    .putString("pending_deeplink_poi", poiId)
                    .putString("pending_deeplink_guide", safeGuide)
                    .putLong("pending_deeplink_ts", System.currentTimeMillis())
                    .apply();

            final String quotedPoiId = JSONObject.quote(poiId);
            final String quotedGuide = JSONObject.quote(safeGuide);
            getBridge().getWebView().post(() -> {
                String js = "window.dispatchEvent(new CustomEvent('deep-link-poi', { detail: { poiId: "
                        + quotedPoiId + ", guide: " + quotedGuide + " } }));";
                getBridge().getWebView().evaluateJavascript(js, null);
            });
        }
    }

    /** Whitelist per gli id che finiscono nel JS: solo caratteri innocui, max 80. */
    private static boolean isSafeId(String value) {
        return value != null && SAFE_ID.matcher(value).matches();
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge().getWebView();
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
