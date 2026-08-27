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
