package com.itaintasca.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.audiofx.Equalizer;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaStyleNotificationHelper;

/**
 * Servizio di riproduzione delle audioguide.
 *
 * Punti chiave per il funzionamento in background (schermo spento / app in tasca):
 * - wake mode + audio focus gestiti da ExoPlayer;
 * - foreground service di tipo mediaPlayback (obbligatorio da Android 14);
 * - MediaSession per i controlli da lock screen / cuffie;
 * - callback verso il plugin Capacitor per fine riproduzione, errori e progresso,
 *   perche' la WebView in background non e' una sorgente di eventi affidabile.
 */
public class WipBackgroundAudioService extends Service {

    /** Eventi inoltrati al plugin Capacitor (e quindi al JS). */
    public interface PlaybackCallback {
        void onPlaybackEnded();
        void onPlaybackError(String message);
        void onPlaybackStateChanged(boolean isPlaying);
        void onPlaybackProgress(long positionMs, long durationMs);
    }

    private static final String TAG = "WipAudio";
    private static final String CHANNEL_ID = "wip_audio_channel";
    private static final int NOTIFICATION_ID = 101;
    private static final long PROGRESS_INTERVAL_MS = 500L;

    public static final String ACTION_PAUSE = "com.itaintasca.audio.PAUSE";
    public static final String ACTION_RESUME = "com.itaintasca.audio.RESUME";
    public static final String ACTION_STOP = "com.itaintasca.audio.STOP";

    private final IBinder binder = new LocalBinder();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private ExoPlayer exoPlayer;
    private MediaSession mediaSession;
    private PlaybackCallback callback;

    private boolean isForeground = false;
    // (AUD-02) Il plugin e' legato (bound) al servizio? Finche' lo e' il
    // servizio resta vivo anche da fermo (la guida successiva parte subito);
    // quando si slega e il player e' vuoto ci si spegne da soli.
    private boolean isBound = false;

    // (AUD-01) Stato condiviso con la coda vocale nativa del
    // GeofenceBroadcastReceiver, che gira in un altro thread e non ha il
    // binder: l'istanza viva del servizio e il flag "sta suonando".
    private static volatile WipBackgroundAudioService instance;
    private static volatile boolean playingNow = false;
    // true = la pausa l'ha chiesta la voce nativa (teaser/arrivo), non
    // l'utente: solo in quel caso si riprende da soli a voce finita.
    private static volatile boolean pausedByNativeVoice = false;
    // Il prodotto si chiama WIP (World in Pocket): "Italia in Tasca" era il nome
    // storico e finiva in chiaro nella notifica media / schermata di blocco.
    private String currentTitle = "WIP";
    private String currentSubtitle = "Audioguida";

    // Effetto "megafono": banda vocale stretta (700-3500Hz) + volume spinto.
    // Sul web lo fa il grafo WebAudio della WebView; qui l'audio esce
    // dall'ExoPlayer nativo, quindi servono gli audiofx di sistema.
    private boolean megaphoneEnabled = false;
    private Equalizer megaphoneEq;
    private LoudnessEnhancer megaphoneBoost;

    private final Runnable progressTicker = new Runnable() {
        @Override
        public void run() {
            if (exoPlayer != null && callback != null) {
                long duration = exoPlayer.getDuration();
                callback.onPlaybackProgress(
                        Math.max(0, exoPlayer.getCurrentPosition()),
                        duration == C.TIME_UNSET ? 0 : duration
                );
            }
            if (exoPlayer != null && exoPlayer.isPlaying()) {
                mainHandler.postDelayed(this, PROGRESS_INTERVAL_MS);
            }
        }
    };

    public class LocalBinder extends Binder {
        public WipBackgroundAudioService getService() {
            return WipBackgroundAudioService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();
        ensurePlayer();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        isBound = true;
        return binder;
    }

    @Override
    public boolean onUnbind(Intent intent) {
        // (AUD-02) Il plugin si e' slegato (Activity distrutta): se sta
        // suonando il servizio e' "started" + foreground e prosegue da solo;
        // se e' vuoto non ha motivo di restare in memoria.
        isBound = false;
        stopSelfIfIdle();
        return true; // vogliamo onRebind al prossimo bind
    }

    @Override
    public void onRebind(Intent intent) {
        isBound = true;
    }

    /**
     * (AUD-02) Il servizio viene ora AVVIATO (startForegroundService) dal
     * plugin prima di ogni play, non solo legato: un servizio bound-only
     * moriva con l'Activity e troncava la guida. Regole:
     *  - promozione IMMEDIATA in foreground (obbligo entro pochi secondi da
     *    startForegroundService, pena ForegroundServiceDidNotStartInTime);
     *  - START_STICKY per gli avvii con intent; il riavvio STICKY a intent
     *    nullo (processo ucciso) trova il player vuoto e si spegne pulito;
     *  - i pulsanti della notifica arrivano da qui come prima.
     */
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForegroundSafe();
        if (intent == null) {
            // Riavvio STICKY dopo un kill: niente da riprendere.
            releaseForeground();
            stopSelfIfIdle();
            return START_NOT_STICKY;
        }
        String action = intent.getAction();
        if (ACTION_PAUSE.equals(action)) {
            pause();
        } else if (ACTION_RESUME.equals(action)) {
            resume();
        } else if (ACTION_STOP.equals(action)) {
            stop();
        }
        return START_STICKY;
    }

    /**
     * (AUD-02) L'utente ha tolto l'app dai recenti: la riproduzione NON si
     * ferma. Il servizio e' started + foreground e la notifica media resta
     * l'unico controllo; se invece era fermo, l'unbind dell'Activity lo ha
     * gia' spento (onUnbind → stopSelfIfIdle).
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.d(TAG, "Task rimosso dai recenti: riproduzione mantenuta (" + (isPlaying() ? "in corso" : "ferma") + ")");
        super.onTaskRemoved(rootIntent);
    }

    /** Spegne il servizio se nessuno e' legato e il player e' vuoto o finito. */
    private void stopSelfIfIdle() {
        if (isBound) return;
        boolean idle = exoPlayer == null
                || exoPlayer.getPlaybackState() == Player.STATE_IDLE
                || exoPlayer.getPlaybackState() == Player.STATE_ENDED;
        if (idle) {
            releaseForeground();
            stopSelf();
        }
    }

    // ------------------------------------------------------------------
    // (AUD-01) Ponte con la coda vocale nativa (GeofenceBroadcastReceiver).
    // Prima le due voci suonavano INSIEME: la voce nativa chiedeva il focus
    // in MAY_DUCK e l'ExoPlayer si limitava ad abbassarsi sotto il teaser.
    // ------------------------------------------------------------------

    /** true se l'ExoPlayer della guida JS sta suonando in questo momento. */
    public static boolean isPlayingNow() {
        return playingNow;
    }

    /**
     * Mette in pausa la guida JS per far parlare la voce nativa. Ritorna true
     * se c'era davvero qualcosa in riproduzione (e quindi andra' ripreso).
     * Chiamabile da qualunque thread.
     */
    public static boolean pauseForNativeVoice() {
        final WipBackgroundAudioService svc = instance;
        if (svc == null || !playingNow) return false;
        pausedByNativeVoice = true;
        svc.mainHandler.post(() -> {
            try {
                if (svc.exoPlayer != null && svc.exoPlayer.isPlaying()) svc.exoPlayer.pause();
            } catch (Exception e) {
                Log.w(TAG, "Pausa per voce nativa fallita: " + e.getMessage());
            }
        });
        return true;
    }

    /**
     * Riprende la guida JS SOLO se l'avevamo messa in pausa noi
     * (pauseForNativeVoice) e nel frattempo l'utente non ha premuto Pausa o
     * Stop, e il JS non ha avviato un'altra guida.
     */
    public static void resumeAfterNativeVoice() {
        if (!pausedByNativeVoice) return;
        pausedByNativeVoice = false;
        final WipBackgroundAudioService svc = instance;
        if (svc == null) return;
        svc.mainHandler.post(() -> {
            try {
                if (svc.exoPlayer != null && svc.hasMedia() && !svc.exoPlayer.isPlaying()
                        && svc.exoPlayer.getPlaybackState() != Player.STATE_ENDED) {
                    svc.resume();
                }
            } catch (Exception e) {
                Log.w(TAG, "Ripresa dopo voce nativa fallita: " + e.getMessage());
            }
        });
    }

    public void setCallback(@Nullable PlaybackCallback cb) {
        this.callback = cb;
    }

    private void ensurePlayer() {
        if (exoPlayer != null) return;

        // USAGE_ASSISTANCE_NAVIGATION_GUIDANCE (invece di USAGE_MEDIA): con
        // USAGE_MEDIA ExoPlayer richiede AUDIOFOCUS_GAIN (esclusivo), quindi la
        // guida METTEVA IN PAUSA la musica di sottofondo di altre app invece di
        // abbassarla. Con la guidance ExoPlayer richiede
        // AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK, cioè "duck": stesso comportamento
        // di iOS (sempre duck) e del teaser Android
        // (GeofenceBroadcastReceiver/AudioPrefetchManager, che già usano
        // ASSISTANCE_NAVIGATION_GUIDANCE + GAIN_TRANSIENT_MAY_DUCK).
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(C.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
                .build();

        exoPlayer = new ExoPlayer.Builder(this)
                // false => IL FOCUS SE LO GESTISCE L'APP (29/08/2026).
                //
                // Con `true` media3 solleva IllegalArgumentException in fase di
                // costruzione: «Automatic handling of audio focus is only
                // available for USAGE_MEDIA and USAGE_GAME» — e con
                // ASSISTANCE_NAVIGATION_GUIDANCE (scelta voluta, vedi sopra)
                // non lo e'. Finche' il servizio nasceva solo alla prima
                // riproduzione il difetto restava latente; da quando il plugin
                // lo avvia insieme all'app (correzione AUD-02), l'eccezione
                // arriva in onCreate e l'APP NON SI APRE PIU'.
                //
                // Il focus lo si chiede a mano in play() con
                // AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK: e' esattamente cio' che
                // ExoPlayer avrebbe fatto da solo, ed e' la stessa richiesta
                // gia' usata dalla voce nativa in GeofenceBroadcastReceiver.
                .setAudioAttributes(attrs, false)
                // false => cuffie staccate: la guida CONTINUA dall'altoparlante
                // (decisione di prodotto 28/08/2026, stessa regola della voce
                // nativa del 23/08). Con true ExoPlayer si metteva in pausa da
                // solo e il turista, in strada, doveva ripartire a mano.
                .setHandleAudioBecomingNoisy(false)
                .build();

        // Mantiene CPU e Wi-Fi attivi con lo schermo spento: senza questo la guida
        // si interrompe appena il dispositivo entra in doze.
        exoPlayer.setWakeMode(C.WAKE_MODE_NETWORK);

        exoPlayer.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    stopProgressTicker();
                    if (callback != null) {
                        callback.onPlaybackProgress(exoPlayer.getDuration(), exoPlayer.getDuration());
                        callback.onPlaybackEnded();
                    }
                    pausedByNativeVoice = false;
                    releaseForeground();
                    // (AUD-02) Guida finita e nessuno legato: si spegne.
                    stopSelfIfIdle();
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                playingNow = isPlaying;
                if (callback != null) callback.onPlaybackStateChanged(isPlaying);
                if (isPlaying) {
                    startProgressTicker();
                } else {
                    stopProgressTicker();
                }
                updateNotification();
            }

            @Override
            public void onAudioSessionIdChanged(int audioSessionId) {
                // La session id cambia (o nasce) a ogni nuova pipeline audio:
                // l'effetto va riagganciato, altrimenti resta orfano della
                // sessione precedente e il megafono smette di sentirsi.
                if (megaphoneEnabled) applyMegaphone();
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Log.e(TAG, "Playback error: " + error.getMessage(), error);
                stopProgressTicker();
                if (callback != null) callback.onPlaybackError(error.getMessage());
                pausedByNativeVoice = false;
                releaseForeground();
                stopSelfIfIdle();
            }
        });

        try {
            mediaSession = new MediaSession.Builder(this, exoPlayer)
                    .setId("wip_audio_session")
                    .setSessionActivity(buildContentIntent())
                    .build();
        } catch (Exception e) {
            // La MediaSession e' un extra (controlli da lock screen): se fallisce
            // la riproduzione deve comunque funzionare.
            Log.w(TAG, "MediaSession non disponibile: " + e.getMessage());
            mediaSession = null;
        }
    }

    /**
     * IL FOCUS AUDIO, CHIESTO A MANO (29/08/2026).
     *
     * ExoPlayer non puo' gestirlo da solo con USAGE_ASSISTANCE_NAVIGATION_GUIDANCE
     * (vedi ensurePlayer). Si chiede quindi qui, con la stessa richiesta che
     * avrebbe fatto lui e che usa gia' la voce nativa: GAIN_TRANSIENT_MAY_DUCK,
     * cioe' «abbassate, non fermatevi» — la musica di sottofondo dell'utente
     * cala mentre la guida racconta e torna su alla fine.
     *
     * Se il sistema nega il focus (una telefonata in corso) si riproduce
     * comunque: la telefonata ha gia' la sua priorita' a livello di sistema, e
     * un'audioguida che tace senza dire perche' sembra un'app rotta.
     */
    private Object focusRequest; // AudioFocusRequest (API 26+), tenuto come Object per l'SDK minimo

    private void richiediFocusAudio() {
        try {
            android.media.AudioManager am = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
            if (am == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                android.media.AudioAttributes a = new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();
                android.media.AudioFocusRequest req = new android.media.AudioFocusRequest.Builder(
                        android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(a)
                        .setWillPauseWhenDucked(false)
                        .build();
                focusRequest = req;
                am.requestAudioFocus(req);
            } else {
                am.requestAudioFocus(null, android.media.AudioManager.STREAM_MUSIC,
                        android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
            }
        } catch (Exception e) {
            Log.w(TAG, "Richiesta focus audio fallita: " + e.getMessage());
        }
    }

    private void rilasciaFocusAudio() {
        try {
            android.media.AudioManager am = (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
            if (am == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusRequest instanceof android.media.AudioFocusRequest) {
                    am.abandonAudioFocusRequest((android.media.AudioFocusRequest) focusRequest);
                }
                focusRequest = null;
            } else {
                am.abandonAudioFocus(null);
            }
        } catch (Exception e) {
            Log.w(TAG, "Rilascio focus audio fallito: " + e.getMessage());
        }
    }

    public void play(String url, String title, String subtitle) {
        try {
            ensurePlayer();
            richiediFocusAudio();
            currentTitle = title != null ? title : "WIP";
            currentSubtitle = subtitle != null ? subtitle : "Audioguida";

            // (AUD-01) Il JS avvia una guida: la voce nativa (teaser/arrivo)
            // cede il passo. Prima si azzera il flag di pausa "per voce
            // nativa", cosi' il finishActiveSpeech innescato dallo stop non
            // riprende il brano PRECEDENTE sopra quello nuovo.
            pausedByNativeVoice = false;
            try {
                com.itaintasca.app.geofence.GeofenceBroadcastReceiver.Companion.stopSpeaking(this);
            } catch (Exception e) {
                Log.w(TAG, "stopSpeaking della voce nativa fallito: " + e.getMessage());
            }

            exoPlayer.stop();
            exoPlayer.clearMediaItems();

            Log.d(TAG, "Preparazione riproduzione URL: " + url);

            MediaItem mediaItem = new MediaItem.Builder()
                    .setUri(android.net.Uri.parse(url))
                    .setMediaMetadata(new MediaMetadata.Builder()
                            .setTitle(currentTitle)
                            .setArtist(currentSubtitle)
                            .build())
                    .build();

            // Il foreground va avviato prima della riproduzione: se il sistema lo nega
            // (restrizioni background di Android 12+) proseguiamo comunque.
            startForegroundSafe();

            exoPlayer.setMediaItem(mediaItem);
            exoPlayer.prepare();
            exoPlayer.play();
        } catch (Exception e) {
            Log.e(TAG, "Errore critico riproduzione: " + e.getMessage(), e);
            if (callback != null) callback.onPlaybackError(e.getMessage());
        }
    }

    public void pause() {
        // Pausa esplicita (utente o JS): la voce nativa non deve piu'
        // riprendere da sola a fine teaser.
        pausedByNativeVoice = false;
        if (exoPlayer != null) exoPlayer.pause();
    }

    public void resume() {
        if (exoPlayer == null) return;
        if (exoPlayer.getPlaybackState() == Player.STATE_IDLE) return;
        startForegroundSafe();
        // Il focus era stato rilasciato mettendo in pausa: si richiede, altrimenti
        // si riprende a raccontare sopra la musica di un'altra app invece di
        // abbassarla.
        richiediFocusAudio();
        exoPlayer.play();
    }

    public void stop() {
        stopProgressTicker();
        pausedByNativeVoice = false;
        if (exoPlayer != null) {
            exoPlayer.stop();
            exoPlayer.clearMediaItems();
        }
        releaseForeground();
        // (AUD-02) Finche' il plugin e' legato il servizio resta vivo (la
        // guida successiva parte subito); se nessuno e' legato si spegne.
        stopSelfIfIdle();
    }

    public void seekTo(long positionMs) {
        if (exoPlayer == null) return;
        long duration = exoPlayer.getDuration();
        long target = Math.max(0, positionMs);
        if (duration != C.TIME_UNSET && target > duration) target = duration;
        exoPlayer.seekTo(target);
        if (callback != null) {
            callback.onPlaybackProgress(target, duration == C.TIME_UNSET ? 0 : duration);
        }
    }

    public long getPosition() {
        return exoPlayer != null ? Math.max(0, exoPlayer.getCurrentPosition()) : 0;
    }

    public long getDuration() {
        if (exoPlayer == null) return 0;
        long d = exoPlayer.getDuration();
        return d == C.TIME_UNSET ? 0 : d;
    }

    public boolean isPlaying() {
        return exoPlayer != null && exoPlayer.isPlaying();
    }

    public boolean hasMedia() {
        return exoPlayer != null && exoPlayer.getPlaybackState() != Player.STATE_IDLE;
    }

    public void setSpeed(float speed) {
        if (exoPlayer != null) {
            exoPlayer.setPlaybackParameters(new PlaybackParameters(speed));
        }
    }

    public void setMegaphone(boolean enabled) {
        megaphoneEnabled = enabled;
        if (enabled) {
            applyMegaphone();
        } else {
            releaseMegaphone();
        }
    }

    private void applyMegaphone() {
        releaseMegaphone();
        if (!megaphoneEnabled || exoPlayer == null) return;
        int sessionId = exoPlayer.getAudioSessionId();
        if (sessionId == C.AUDIO_SESSION_ID_UNSET || sessionId == 0) return;
        try {
            megaphoneEq = new Equalizer(0, sessionId);
            short minLevel = megaphoneEq.getBandLevelRange()[0];
            short maxLevel = megaphoneEq.getBandLevelRange()[1];
            short midBoost = (short) Math.min(maxLevel, 300); // +3dB sulla banda voce
            for (short band = 0; band < megaphoneEq.getNumberOfBands(); band++) {
                int centerHz = megaphoneEq.getCenterFreq(band) / 1000; // milliHz -> Hz
                megaphoneEq.setBandLevel(band, (centerHz < 700 || centerHz > 3500) ? minLevel : midBoost);
            }
            megaphoneEq.setEnabled(true);

            megaphoneBoost = new LoudnessEnhancer(sessionId);
            megaphoneBoost.setTargetGain(600); // millibel: ~+6dB, come il gain 2.5x del web
            megaphoneBoost.setEnabled(true);
        } catch (Exception e) {
            // Alcuni device/ROM non espongono gli audiofx: il megafono resta
            // senza effetto ma la riproduzione non deve risentirne.
            Log.w(TAG, "Effetto megafono non disponibile: " + e.getMessage());
            releaseMegaphone();
        }
    }

    private void releaseMegaphone() {
        if (megaphoneEq != null) {
            try { megaphoneEq.setEnabled(false); megaphoneEq.release(); } catch (Exception ignored) { }
            megaphoneEq = null;
        }
        if (megaphoneBoost != null) {
            try { megaphoneBoost.setEnabled(false); megaphoneBoost.release(); } catch (Exception ignored) { }
            megaphoneBoost = null;
        }
    }

    private void startProgressTicker() {
        mainHandler.removeCallbacks(progressTicker);
        mainHandler.post(progressTicker);
    }

    private void stopProgressTicker() {
        mainHandler.removeCallbacks(progressTicker);
    }

    private void startForegroundSafe() {
        try {
            int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                    : 0;
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type);
            isForeground = true;
        } catch (Exception e) {
            // Es. ForegroundServiceStartNotAllowedException: l'audio parte lo stesso
            // finche' l'app resta in memoria.
            Log.w(TAG, "startForeground non consentito: " + e.getMessage());
            isForeground = false;
        }
    }

    private void releaseForeground() {
        if (!isForeground) return;
        isForeground = false;
        try {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        } catch (Exception e) {
            Log.w(TAG, "stopForeground fallito: " + e.getMessage());
        }
    }

    private void updateNotification() {
        if (!isForeground) return;
        try {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification());
        } catch (Exception e) {
            Log.w(TAG, "Aggiornamento notifica fallito: " + e.getMessage());
        }
    }

    private PendingIntent buildContentIntent() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
    }

    private PendingIntent buildActionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, WipBackgroundAudioService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        // (AUD-02) Da Android 8 un getService lanciato con l'app in background
        // viene scartato in silenzio (IllegalStateException lato sistema): il
        // tasto della notifica non faceva nulla. getForegroundService e'
        // consentito e onStartCommand si promuove subito.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return PendingIntent.getForegroundService(this, requestCode, intent, flags);
        }
        return PendingIntent.getService(this, requestCode, intent, flags);
    }

    private Notification buildNotification() {
        boolean playing = isPlaying();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(currentTitle)
                .setContentText(currentSubtitle)
                .setSmallIcon(playing ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause)
                .setContentIntent(buildContentIntent())
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOnlyAlertOnce(true)
                .setOngoing(playing)
                .addAction(
                        playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                        playing ? "Pausa" : "Riprendi",
                        buildActionIntent(playing ? ACTION_PAUSE : ACTION_RESUME, playing ? 1 : 2)
                )
                .addAction(
                        android.R.drawable.ic_menu_close_clear_cancel,
                        "Stop",
                        buildActionIntent(ACTION_STOP, 3)
                );

        if (mediaSession != null) {
            try {
                builder.setStyle(new MediaStyleNotificationHelper.MediaStyle(mediaSession)
                        .setShowActionsInCompactView(0, 1));
            } catch (Exception e) {
                Log.w(TAG, "MediaStyle non applicabile: " + e.getMessage());
            }
        }

        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "Riproduzione Audioguida",
                    NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        playingNow = false;
        pausedByNativeVoice = false;
        stopProgressTicker();
        releaseMegaphone();
        callback = null;
        if (mediaSession != null) {
            try { mediaSession.release(); } catch (Exception ignored) { }
            mediaSession = null;
        }
        if (exoPlayer != null) {
            exoPlayer.release();
            exoPlayer = null;
        }
        super.onDestroy();
    }
}
