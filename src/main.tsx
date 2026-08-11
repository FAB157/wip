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
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

if ('serviceWorker' in navigator && !window.location.protocol.includes('file')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW Registration failed:', err);
    });
  });
}

import { ErrorBoundary } from './components/ErrorBoundary';
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
    // Inserita la vera API Key di Android
    Purchases.configure({ apiKey: "goog_mhKBjLsBGliaBGvHlmkUNWxPCMK" });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
