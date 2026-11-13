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
import com.itaintasca.app.service.ItaintaBackgroundPoiService;
import com.itaintasca.app.service.ServiceWatchdog;
import java.util.regex.Pattern;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9_:.-]{1,80}$");
    /** (21/09/2026) Segno sull'intent: tasto del cruscotto gia' consegnato al JS. */
    private static final String EXTRA_NAV_CONSEGNATA = "wipNavConsegnata";
    /** (21/09/2026) Activity ricreata (rotazione, processo ripristinato): il suo intent e' vecchio. */
    private boolean ricreata = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Prima di super.onCreate: BridgeActivity.load() passa l'intent di
        // avvio a onNewIntent gia' dentro super.onCreate.
        ricreata = savedInstanceState != null;
        registerPlugin(ItaintaBackgroundPoiPlugin.class);
        // Senza questa registrazione il plugin audio non esiste a runtime e ogni
        // chiamata a WipBackgroundAudio fallisce con "not implemented":
        // l'audioguida restava confinata alla WebView e si interrompeva a schermo spento.
        registerPlugin(WipBackgroundAudioPlugin.class);
        // (14/09/2026) Snapshot per i quattro widget della home (widget/WipWidgetsPlugin.kt).
        registerPlugin(com.itaintasca.app.widget.WipWidgetsPlugin.class);
        super.onCreate(savedInstanceState);
        
        // Attiva il Watchdog per il servizio di background
        ServiceWatchdog.Companion.schedule(this);

        // Canale delle push di servizio (06/09/2026): il server (FCM v1) manda
        // «la tua guida e' pronta», rimborsi, tour di gruppo con
        // channel_id = "wip_servizio". Senza il canale, su Android 8+ la
        // notifica non compare. Creato qui una volta sola (idempotente).
        creaCanaleNotifiche();

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

        // --- 0. Tasti «Salta» / «Ricalcola» del cruscotto (21/09/2026) ---
        if (consegnaAzioneNav(intent)) return;

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

    /**
     * (21/09/2026, REVISIONE 2) TASTI «SALTA» E «RICALCOLA» DEL CRUSCOTTO. Il
     * nativo non li sa fare (non calcola percorsi) e a schermo spento non
     * facevano nulla: ora la notifica apre l'app con un PendingIntent di
     * Activity (dalla lock screen il sistema chiede lo sblocco) e l'azione
     * arriva al JS FRESCA, col ts di adesso, come `navBannerAction` — lo stesso
     * evento degli altri tasti. Una sola strada: plugin vivo → broadcast al
     * suo ricevitore (che la trattiene finche' il listener JS non c'e');
     * plugin non vivo → annotata, la consegna il suo load(). Mai tutte e due.
     * Nessun ricaricamento della WebView: onNewIntent passa solo ai plugin.
     *
     * @return true se l'intent era un tasto del cruscotto (consegnato o scartato).
     */
    private boolean consegnaAzioneNav(Intent intent) {
        String a = intent.getAction();
        final String azione;
        if (ItaintaBackgroundPoiService.ACTION_NAV_SKIP.equals(a)) azione = "salta";
        else if (ItaintaBackgroundPoiService.ACTION_NAV_RECALC.equals(a)) azione = "ricalcola";
        else return false;
        // BridgeActivity.load() (dentro super.onCreate) e poi onCreate passano
        // lo STESSO intent di avvio: si consegna una volta sola.
        if (intent.getBooleanExtra(EXTRA_NAV_CONSEGNATA, false)) return true;
        intent.putExtra(EXTRA_NAV_CONSEGNATA, true);
        // L'intent di avvio di un'Activity ricreata o riaperta dalle recenti e'
        // il tocco di allora, non uno nuovo: non si ripete.
        boolean diAvvio = intent == getIntent();
        if ((diAvvio && ricreata) || (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
            return true;
        }
        long ts = System.currentTimeMillis();
        try {
            if (ItaintaBackgroundPoiPlugin.getVivo()) {
                Intent evento = new Intent("com.itaintasca.POI_EVENT");
                evento.setPackage(getPackageName());
                evento.putExtra("event", "navBannerAction");
                evento.putExtra("data1", "{\"action\":\"" + azione + "\",\"ts\":" + ts + "}");
                sendBroadcast(evento);
            } else {
                getSharedPreferences("ItaintaPrefs", MODE_PRIVATE).edit()
                        .putString(ItaintaBackgroundPoiService.PREF_PENDING_NAV_ACTION, azione)
                        .putLong(ItaintaBackgroundPoiService.PREF_PENDING_NAV_ACTION_TS, ts)
                        .apply();
            }
        } catch (Exception e) {
            Log.w(TAG, "Tasto del cruscotto «" + azione + "» non consegnato", e);
        }
        return true;
    }

    private void creaCanaleNotifiche() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
            if (nm == null || nm.getNotificationChannel("wip_servizio") != null) return;
            android.app.NotificationChannel canale = new android.app.NotificationChannel(
                    "wip_servizio", "Avvisi WIP", android.app.NotificationManager.IMPORTANCE_HIGH);
            canale.setDescription("Guida pronta, rimborsi, tour di gruppo");
            nm.createNotificationChannel(canale);
        } catch (Exception e) {
            Log.w(TAG, "Canale notifiche non creato", e);
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
