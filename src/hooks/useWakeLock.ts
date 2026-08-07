import { useEffect, useRef } from 'react';

export function useWakeLock(enabled: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let isMounted = true;

    const requestWakeLock = async () => {
      if ('wakeLock' in navigator) {
        try {
          if (wakeLockRef.current) return;
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          
          wakeLockRef.current.addEventListener('release', () => {
            console.log('[WakeLock] Rilasciato.');
            wakeLockRef.current = null;
          });
          
          console.log('[WakeLock] Attivato con successo.');
        } catch (err) {
          console.warn('[WakeLock] Errore richiesta:', err);
        }
      } else {
        console.warn('[WakeLock] API non supportata da questo browser.');
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log('[WakeLock] Disattivato.');
        } catch (err) {
          console.warn('[WakeLock] Errore rilascio:', err);
        }
      }
    };

    const handleVisibilityChange = async () => {
      if (enabled && document.visibilityState === 'visible' && isMounted) {
        // Riacquisisce il lock quando la pagina torna visibile (es. cambio tab)
        await requestWakeLock();
      }
    };

    if (enabled) {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      releaseWakeLock();
    }

    return () => {
      isMounted = false;
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled]);
}
