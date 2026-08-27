/**
 * APRIRE UNA PAGINA ESTERNA SENZA USCIRE DALL'APP.
 * ===============================================
 * Serve alle schede ufficiali dei cataloghi del patrimonio: i beni italiani
 * non possono mostrare la fotografia (licenza non commerciale) e quelli
 * polacchi non ne hanno, ma la scheda del loro ministero — con foto, storia
 * e vincoli — e' pubblica e linkabile. Il pin smette di essere un vicolo
 * cieco e diventa una porta.
 *
 * PERCHE' NON UN RIQUADRO INTERNO. Verificato il 25/08/2026: sia
 * catalogo.beniculturali.it sia zabytek.pl rispondono
 * `X-Frame-Options: SAMEORIGIN`, cioe' vietano di essere incorniciati. Un
 * iframe mostrerebbe una pagina bianca.
 *
 * PERCHE' NON `window.open` SUL NATIVO. Butterebbe l'utente nel browser di
 * sistema: l'app va in secondo piano, e con lei l'audioguida in ascolto e il
 * giro in corso. Il plugin Browser apre invece una scheda DENTRO l'app —
 * Chrome Custom Tab su Android, SFSafariViewController su iOS — con il tasto
 * "fine" che riporta esattamente dov'eri.
 *
 * Fallisce in silenzio verso window.open: se il plugin non c'e' (build
 * vecchia, PWA) il link deve funzionare lo stesso.
 */
import { Capacitor } from '@capacitor/core';

/** Colore della barra della scheda: il blu del marchio. */
const COLORE_BARRA = '#1e3a8a';

export async function apriScheda(url: string): Promise<void> {
  const u = String(url || '').trim();
  // Solo http/https: un `javascript:` o un `intent:` che arrivasse da un
  // dato del database non deve poter essere aperto.
  if (!/^https?:\/\//i.test(u)) return;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: u, toolbarColor: COLORE_BARRA, presentationStyle: 'popover' });
      return;
    } catch {
      /* plugin assente o build vecchia: si ripiega sul browser di sistema */
    }
  }
  window.open(u, '_blank', 'noopener,noreferrer');
}
