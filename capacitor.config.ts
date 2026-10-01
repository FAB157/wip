import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.itaintasca.app',
  appName: 'WIP',
  webDir: 'dist',
  ios: {
    // Le notifiche POI (azione ▶ Ascolta, tap = deep link) le gestisce
    // AppDelegate: senza questo flag il NotificationRouter di Capacitor
    // ruba il delegate di UNUserNotificationCenter e l'azione Ascolta
    // non arriva mai al codice nativo.
    handleApplicationNotifications: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_name",
      iconColor: "#1e3a8a",
      sound: "beep.wav",
    },
    CapacitorHttp: {
      enabled: true
    },
    // (12/09/2026) Login social: SOLO Google e Apple, che sono gli unici usati
    // dall'app. Senza questa mappa il plugin @capgo/capacitor-social-login
    // abilita tutti e quattro i provider e compila dentro facebook-core, il
    // cui manifest aggiunge com.google.android.gms.permission.AD_ID: il Play
    // Console segnalava «ID pubblicità: dichiarazione No, ma il manifest lo
    // richiede» e bloccava l'invio della release in revisione. false =
    // compileOnly (la dipendenza non entra nell'APK). Va rifatto `cap sync`
    // dopo ogni modifica qui: è lo script del plugin a scrivere i flag in
    // android/gradle.properties.
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
    },
    // (22/08/2026) Qui c'era un blocco SplashScreen con launchShowDuration:
    // 2500. Era INERTE: @capacitor/splash-screen non è installato (non è in
    // package.json, non è in capacitor.settings.gradle né nel Podfile), quindi
    // nessun plugin leggeva quella configurazione e l'app non ha mai aspettato
    // 2,5 s all'avvio. Lo splash che si vede è quello nativo del tema
    // (AppTheme.NoActionBarLaunch su Android, LaunchScreen su iOS), che sparisce
    // appena la WebView è pronta.
    // NON installare @capacitor/splash-screen "per far funzionare la config":
    // aggiungerebbe un ritardo di avvio che oggi non esiste, oltre a un plugin
    // in più nelle app.
  },
};

export default config;
