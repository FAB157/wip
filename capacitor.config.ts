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
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: "#1e3a8a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#ffffff",
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
