import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';

// Su app nativa le chiamate `/api/...` scritte con path relativo puntano al
// bundle locale: l'intercettore le riscrive verso il backend. Ora vive in
// lib/api.ts (unica fonte per l'URL di produzione) e copre anche gli oggetti
// Request, non solo le stringhe come faceva la versione inline qui.
import { installNativeApiFetch } from './lib/api';
installNativeApiFetch();
// Logging errori runtime → tabella system_errors (tab admin "Errori di
// sistema", che senza uno scrittore restava sempre vuota).
import { installGlobalErrorLogger } from './lib/errorLogger';
installGlobalErrorLogger();
// Feature flag (kill switch dal pannello admin): fetch all'avvio, fail-open.
// Va DOPO installNativeApiFetch, che riscrive i path /api/ per il nativo.
import { refreshFeatureFlags } from './lib/featureFlags';
refreshFeatureFlags();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

// La registrazione del service worker è gestita da vite-plugin-pwa
// (injectRegister:'auto' in vite.config.ts): registrarlo di nuovo qui a mano
// causava una doppia registrazione di /sw.js. Rimosso: il plugin è l'unico
// proprietario del SW.

import { ErrorBoundary } from './components/ErrorBoundary';
import AppLockGate from './components/AppLockGate';
import { Capacitor } from '@capacitor/core';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

// Inizializza RevenueCat solo su piattaforme native (Android/iOS)
if (Capacitor.isNativePlatform()) {
  Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
  
  if (Capacitor.getPlatform() === 'ios') {
    // Chiave pubblica RevenueCat iOS da env (VITE_REVENUECAT_IOS_KEY): quando
    // arriverà basta impostarla e rifare la build, senza toccare il codice.
    // Senza chiave NON configuriamo: gli acquisti falliscono con un messaggio
    // pulito invece di inondare il log di errori.
    const iosRevenueCatKey = import.meta.env.VITE_REVENUECAT_IOS_KEY || "";
    if (iosRevenueCatKey.startsWith("appl_")) {
      Purchases.configure({ apiKey: iosRevenueCatKey });
    }
  } else if (Capacitor.getPlatform() === 'android') {
    // Chiave pubblica RevenueCat Android da env (VITE_REVENUECAT_ANDROID_KEY),
    // con fallback alla chiave hardcoded storica se la env var non è
    // impostata: retrocompatibile, nessuna build rompe l'init RevenueCat
    // per mancanza della variabile.
    const androidRevenueCatKey = import.meta.env.VITE_REVENUECAT_ANDROID_KEY || "goog_mhKBjLsBGliaBGvHlmkUNWxPCMK";
    Purchases.configure({ apiKey: androidRevenueCatKey });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        {/* Blocco app biometrico opzionale (FaceID/impronta all'avvio) */}
        <AppLockGate>
          <App />
        </AppLockGate>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
