package com.itaintasca.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "WipBackgroundAudio")
public class WipBackgroundAudioPlugin extends Plugin {

    private static final String TAG = "WipAudioPlugin";

    private WipBackgroundAudioService audioService;
    private boolean isBound = false;

    /** Azioni richieste dal JS mentre il bind al servizio non e' ancora completo. */
    private final List<Runnable> pendingActions = new ArrayList<>();

    private final WipBackgroundAudioService.PlaybackCallback playbackCallback =
            new WipBackgroundAudioService.PlaybackCallback() {
        @Override
        public void onPlaybackEnded() {
            notifyListeners("playbackEnded", new JSObject());
        }

        @Override
        public void onPlaybackError(String message) {
            JSObject data = new JSObject();
            data.put("message", message != null ? message : "unknown error");
            notifyListeners("playbackError", data);
        }

        @Override
        public void onPlaybackStateChanged(boolean isPlaying) {
            JSObject data = new JSObject();
            data.put("isPlaying", isPlaying);
            notifyListeners("playbackStatus", data);
        }

        @Override
        public void onPlaybackProgress(long positionMs, long durationMs) {
            JSObject data = new JSObject();
            data.put("position", positionMs / 1000.0);
            data.put("duration", durationMs / 1000.0);
            notifyListeners("playbackProgress", data);
        }
    };

    private final ServiceConnection connection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName className, IBinder service) {
            audioService = ((WipBackgroundAudioService.LocalBinder) service).getService();
            audioService.setCallback(playbackCallback);
            isBound = true;

            // Esegue le richieste arrivate prima che il bind fosse pronto:
            // senza questo la primissima audioguida veniva persa.
            List<Runnable> queued = new ArrayList<>(pendingActions);
            pendingActions.clear();
            for (Runnable r : queued) {
                try { r.run(); } catch (Exception e) { Log.e(TAG, "Pending action failed", e); }
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName arg0) {
            isBound = false;
            audioService = null;
        }
    };

    @Override
    public void load() {
        super.load();
        bindIfNeeded();
    }

    private void bindIfNeeded() {
        if (isBound && audioService != null) return;
        try {
            Context context = getContext();
            Intent intent = new Intent(context, WipBackgroundAudioService.class);
            context.bindService(intent, connection, Context.BIND_AUTO_CREATE);
        } catch (Exception e) {
            Log.e(TAG, "bindService failed", e);
        }
    }

    /**
     * Esegue l'azione sul servizio; se il bind non e' pronto la mette in coda e
     * forza il bind, invece di fallire come faceva la versione precedente.
     */
    private void withService(PluginCall call, ServiceAction action) {
        Runnable task = () -> getBridge().getActivity().runOnUiThread(() -> {
            try {
                if (audioService == null) {
                    call.reject("Audio service not available");
                    return;
                }
                action.run(audioService, call);
            } catch (Exception e) {
                Log.e(TAG, "Service action failed", e);
                call.reject(e.getMessage() != null ? e.getMessage() : "Audio service error");
            }
        });

        if (isBound && audioService != null) {
            task.run();
        } else {
            pendingActions.add(task);
            bindIfNeeded();
        }
    }

    private interface ServiceAction {
        void run(WipBackgroundAudioService service, PluginCall call);
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Italia in Tasca");
        String subtitle = call.getString("subtitle", "Audioguida");

        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        withService(call, (service, c) -> {
            service.play(url, title, subtitle);
            JSObject ret = new JSObject();
            ret.put("playing", true);
            c.resolve(ret);
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withService(call, (service, c) -> {
            service.pause();
            c.resolve();
        });
    }

    @PluginMethod
    public void resume(PluginCall call) {
        withService(call, (service, c) -> {
            service.resume();
            c.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        withService(call, (service, c) -> {
            service.stop();
            c.resolve();
        });
    }

    @PluginMethod
    public void setSpeed(PluginCall call) {
        Double speedVal = call.getDouble("speed", 1.0);
        float speed = speedVal != null ? speedVal.floatValue() : 1.0f;

        withService(call, (service, c) -> {
            service.setSpeed(speed);
            c.resolve();
        });
    }

    @PluginMethod
    public void setMegaphone(PluginCall call) {
        Boolean enabledVal = call.getBoolean("enabled", false);
        boolean enabled = enabledVal != null && enabledVal;

        withService(call, (service, c) -> {
            service.setMegaphone(enabled);
            c.resolve();
        });
    }

    /**
     * seek({ position }) posiziona in secondi assoluti;
     * seek({ offset })   sposta di N secondi (anche negativi) dalla posizione corrente.
     */
    @PluginMethod
    public void seek(PluginCall call) {
        Double position = call.getDouble("position");
        Double offset = call.getDouble("offset");

        withService(call, (service, c) -> {
            long target;
            if (position != null) {
                target = (long) (position * 1000);
            } else if (offset != null) {
                target = service.getPosition() + (long) (offset * 1000);
            } else {
                c.reject("position or offset is required");
                return;
            }
            service.seekTo(target);
            c.resolve();
        });
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        withService(call, (service, c) -> {
            JSObject ret = new JSObject();
            ret.put("isPlaying", service.isPlaying());
            ret.put("hasMedia", service.hasMedia());
            ret.put("position", service.getPosition() / 1000.0);
            ret.put("duration", service.getDuration() / 1000.0);
            c.resolve(ret);
        });
    }

    /**
     * La MediaSession viene creata dal servizio all'avvio; qui garantiamo solo che
     * il servizio sia effettivamente in piedi quando il JS la richiede.
     */
    @PluginMethod
    public void setupMediaSession(PluginCall call) {
        withService(call, (service, c) -> c.resolve());
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (audioService != null) audioService.setCallback(null);
            if (isBound) getContext().unbindService(connection);
        } catch (Exception e) {
            Log.w(TAG, "unbindService failed: " + e.getMessage());
        }
        isBound = false;
        audioService = null;
        pendingActions.clear();
        super.handleOnDestroy();
    }
}
