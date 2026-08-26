/**
 * Stampa "con ambito": PrintView (itinerario) è montato in permanenza e in
 * @media print si rende visibile da solo, quindi QUALSIASI window.print()
 * stampava l'itinerario — anche il fallback della Guida Premium. La classe
 * sul body attiva solo il contenitore richiesto (regole in index.css).
 */
export function printScoped(scope: 'itinerary' | 'guide' | 'manual', fn: () => void = () => window.print()) {
  document.body.classList.add(`printing-${scope}`);
  // 'afterprint' non arriva su tutti i browser (iOS Safari/WebView quando
  // l'utente annulla): senza rete di sicurezza la classe restava sul body
  // e l'app rimaneva nascosta (visibility: hidden) fino al reload. Il
  // cleanup è idempotente e scatta anche al ritorno del focus o dopo 3 s
  // dalla chiusura della finestra di stampa (window.print è bloccante sulla
  // maggior parte dei browser, quindi il timer parte al ritorno di fn()).
  let pulito = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cleanup = () => {
    if (pulito) return;
    pulito = true;
    document.body.classList.remove(`printing-${scope}`);
    window.removeEventListener('afterprint', cleanup);
    window.removeEventListener('focus', cleanup);
    if (timer) clearTimeout(timer);
  };
  window.addEventListener('afterprint', cleanup);
  window.addEventListener('focus', cleanup);
  requestAnimationFrame(() => {
    try {
      fn();
      timer = setTimeout(cleanup, 3000);
    } catch (e) {
      console.error('[printScoped]', e);
      cleanup();
    }
  });
}
