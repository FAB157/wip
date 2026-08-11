import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Fingerprint, Loader2 } from 'lucide-react';

/** Preferenza del blocco app biometrico (default OFF, si attiva dal profilo). */
export const APPLOCK_PREF_KEY = 'wip_applock_enabled';
export const isAppLockEnabled = () =>
  Capacitor.isNativePlatform() && localStorage.getItem(APPLOCK_PREF_KEY) === 'true';

/**
 * Blocco app biometrico all'avvio (FaceID / impronta), opzionale dal profilo.
 * Copre il caso "telefono in mano ad altri con sessione persistente": la
 * sessione Supabase resta valida, ma l'app si apre solo dopo la verifica.
 * Fail-open se l'hardware biometrico sparisce (mai chiudere fuori l'utente
 * dal proprio telefono); il prompt parte da solo, il tasto è il ripiego.
 */
export default function AppLockGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(isAppLockEnabled());
  const [verifying, setVerifying] = useState(false);
  const autoTriedRef = useRef(false);

  const unlock = useCallback(async () => {
    if (verifying) return;
    setVerifying(true);
    try {
      const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
      const avail = await NativeBiometric.isAvailable().catch(() => ({ isAvailable: false } as any));
      if (!avail?.isAvailable) { setLocked(false); return; }
      await NativeBiometric.verifyIdentity({ reason: 'Sblocca World in Pocket', title: 'Sblocco app' });
      setLocked(false);
    } catch { /* annullato o fallito: resta bloccato, si riprova col tasto */ }
    finally { setVerifying(false); }
  }, [verifying]);

  useEffect(() => {
    if (!locked || autoTriedRef.current) return;
    autoTriedRef.current = true;
    unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!locked) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[99999] bg-[#f8f5f0] flex flex-col items-center justify-center gap-6 p-8">
      <img src="/email-logo.png" alt="WIP" className="w-20 h-20 rounded-3xl shadow-lg" />
      <div className="text-center">
        <h1 className="text-xl font-black text-primary mb-1">World in Pocket</h1>
        <p className="text-sm font-bold text-gray-500">Sblocca con impronta o FaceID</p>
      </div>
      <button
        onClick={unlock}
        disabled={verifying}
        className="flex items-center gap-2 px-8 py-4 bg-primary text-white font-black rounded-2xl shadow-lg active:scale-95 transition-transform disabled:opacity-60"
      >
        {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
        Sblocca
      </button>
    </div>
  );
}
