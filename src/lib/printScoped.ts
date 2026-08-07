/**
 * Stampa "con ambito": PrintView (itinerario) è montato in permanenza e in
 * @media print si rende visibile da solo, quindi QUALSIASI window.print()
 * stampava l'itinerario — anche il fallback della Guida Premium. La classe
 * sul body attiva solo il contenitore richiesto (regole in index.css).
 */
export function printScoped(scope: 'itinerary' | 'guide' | 'manual', fn: () => void = () => window.print()) {
  document.body.classList.add(`printing-${scope}`);
  const cleanup = () => {
    document.body.classList.remove(`printing-${scope}`);
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  requestAnimationFrame(() => {
    try {
      fn();
    } catch (e) {
      console.error('[printScoped]', e);
      cleanup();
    }
  });
}
