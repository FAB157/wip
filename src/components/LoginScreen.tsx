import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Loader2, Fingerprint, CheckCircle2, User } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { useBiometricAuth } from '../hooks/useBiometricAuth';

interface LoginScreenProps {
  onLoginSuccess: (session: any) => void;
  initialAuthLoading?: boolean;
  forceMethod?: 'email' | 'forgot_password' | 'update_password';
}

/** Lo sblocco biometrico è un'opzione di sicurezza disattivabile dal profilo. */
export const BIOMETRIC_PREF_KEY = 'wip_biometric_enabled';
export const isBiometricPrefEnabled = () => localStorage.getItem(BIOMETRIC_PREF_KEY) !== 'false';

export default function LoginScreen({ onLoginSuccess, initialAuthLoading = false, forceMethod }: LoginScreenProps) {
  const [method, setMethod] = useState<'email' | 'forgot_password' | 'update_password'>(forceMethod || 'email');
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Stato in-page del reset (niente più alert()): messaggio persistente +
  // cooldown 60s sul reinvio per non far sbattere l'utente sul rate limit.
  const [resetSent, setResetSent] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { isAvailable: isBiometricAvailable, saveCredentials, getCredentials } = useBiometricAuth();

  useEffect(() => {
    if (forceMethod) {
      setMethod(forceMethod);
    }
  }, [forceMethod]);

  useEffect(() => () => { if (cooldownRef.current) clearInterval(cooldownRef.current); }, []);

  const friendlyError = (e: any): string => {
    const msg = e?.message || '';
    // Timeout/abort di rete (wrapper supabase o browser): il messaggio grezzo
    // "signal is aborted without reason" non deve arrivare all'utente.
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || msg.includes('aborted') || msg.includes('interrotta dopo')) {
      return 'Connessione lenta o assente: la richiesta è scaduta. Controlla la rete e riprova.';
    }
    if (msg.includes('Invalid login credentials')) {
      return 'Credenziali non valide. Verifica email e password o conferma l\'account se ti sei appena registrato.';
    }
    if (msg.includes('User already registered')) {
      return 'Esiste già un account con questa email. Prova ad accedere o usa "Hai dimenticato la password?".';
    }
    if (msg.includes('Password should be at least')) {
      return 'La password deve contenere almeno 6 caratteri.';
    }
    if (msg.includes('Email rate limit') || msg.includes('rate limit')) {
      return 'Troppi tentativi: attendi qualche minuto e riprova.';
    }
    if (msg === 'Failed to fetch') {
      return 'Connessione non disponibile. Controlla la rete e riprova.';
    }
    return msg || 'Errore di autenticazione';
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (isRegistering) {
        const trimmedName = name.trim();
        if (!trimmedName) {
          setError('Inserisci il tuo nome: verrà mostrato nel tuo profilo.');
          setLoading(false);
          return;
        }
        // Il nome viaggia nei metadata auth (display_name) e viene salvato
        // subito anche in locale: la home del profilo lo mostra dal primo avvio.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: trimmedName } },
        });
        if (error) throw error;
        localStorage.setItem('userProfileName', trimmedName);
        if (data.session) {
          if (isBiometricAvailable && isBiometricPrefEnabled()) {
            await saveCredentials(email, password).catch(() => {});
          }
          onLoginSuccess(data.session);
        } else {
          alert('Registrazione avvenuta! Controlla la tua casella email (anche nello Spam) per confermare l\'account.');
          setIsRegistering(false);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.session) {
          if (isBiometricAvailable && isBiometricPrefEnabled()) {
            await saveCredentials(email, password).catch(() => {});
          }
          onLoginSuccess(data.session);
        }
      }
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const credentials = await getCredentials();
      if (credentials && credentials.username && credentials.password) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.username,
          password: credentials.password,
        });
        if (error) throw error;
        if (data.session) {
          onLoginSuccess(data.session);
        }
      } else {
        setError('Nessuna credenziale salvata trovata. Accedi una volta con email e password.');
      }
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Inserisci la tua email per reimpostare la password');
      return;
    }
    if (resetCooldown > 0) return;
    setLoading(true);
    setError('');
    try {
      // Su app nativa window.location.origin è capacitor://localhost: il link
      // email non potrebbe mai tornare qui. Si usa la PWA di produzione, dove
      // il flusso PASSWORD_RECOVERY → "Nuova Password" funziona già; poi
      // l'utente rientra nell'app con la nuova password.
      const redirectTo = Capacitor.isNativePlatform()
        ? 'https://itainta.vercel.app'
        : window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setResetSent(true);
      setResetCooldown(60);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      cooldownRef.current = setInterval(() => {
        setResetCooldown(prev => {
          if (prev <= 1 && cooldownRef.current) clearInterval(cooldownRef.current);
          return Math.max(0, prev - 1);
        });
      }, 1000);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      setError('Inserisci la nuova password');
      return;
    }
    if (newPassword.length < 6) {
      setError('La password deve contenere almeno 6 caratteri');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Le password non coincidono');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      const { data: { session } } = await supabase.auth.getSession();
      // Le credenziali biometriche salvate contengono la VECCHIA password:
      // senza questo refresh lo sblocco con impronta avrebbe smesso di funzionare.
      if (isBiometricAvailable && isBiometricPrefEnabled() && session?.user?.email) {
        await saveCredentials(session.user.email, newPassword).catch(() => {});
      }
      alert('Password aggiornata con successo! Ora puoi usare la tua nuova password.');
      onLoginSuccess(session);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };


  // Image handling: assuming the visual logo provided by user is served from logo.png or similar,
  // but if unavailable we use a slick fallback showing WIP
  return (
    <div className="fixed inset-0 bg-surface z-50 flex flex-col items-center justify-center p-6 sm:p-12 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md flex flex-col h-full md:justify-center"
      >

        {/* Logo Section */}
        <div className="flex flex-col items-center mb-12 mt-8 md:mt-0">
          <div className="w-32 h-32 md:w-40 md:h-40 bg-primary rounded-[2rem] flex items-center justify-center overflow-hidden mb-6 shadow-[0_0_40px_rgba(212,175,55,0.3)] border-2 border-secondary border-opacity-30 p-1">
            {/* Replace this src with the actual uploaded image path if we know it, or fallback to the provided gold/blue style */}
            <img
              src="/logo.jpg"
              alt="World in Pocket Logo"
              onError={(e) => {
                // Remove broken image and show CSS fallback that mimics the photo (Gold/Blue VIP)
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.innerHTML = `
                  <div class="flex flex-col items-center justify-center w-full h-full rounded-[2rem] bg-[#1e3a8a] text-[#d4af37] font-mono relative border border-[#d4af37]/40">
                    <div class="absolute inset-0 bg-[#d4af37]/20 rounded-[2rem] blur-xl"></div>
                    <span class="text-3xl font-bold tracking-widest z-10 w-full text-center drop-shadow-md">WIP</span>
                    <span class="text-[0.6rem] font-semibold tracking-[0.2em] mt-1 z-10 text-center leading-tight">WORLD IN<br/>POCKET</span>
                  </div>
                `;
              }}
              className={`w-full h-full object-cover rounded-[1.75rem] ${initialAuthLoading ? 'animate-pulse' : ''}`}
            />
          </div>
          {!initialAuthLoading && (
            <>
              <h1 className="text-2xl font-bold text-on-surface mb-2">Benvenuto</h1>
              <p className="text-on-surface-variant text-center">Accedi per continuare in World in Pocket</p>
            </>
          )}
        </div>

        {/* Dynamic Forms */}
        <AnimatePresence mode="wait">
          {initialAuthLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center p-8 gap-4"
            >
              <Loader2 className="w-10 h-10 animate-spin text-secondary" />
              <p className="text-on-surface-variant text-sm font-medium animate-pulse">Verifica in corso...</p>
            </motion.div>
          ) : method === 'email' ? (
             <motion.form
              key="email"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleEmailAuth}
              className="flex flex-col gap-4 w-full"
            >
              <div className="flex items-center mb-2">
                <h2 className="text-lg font-semibold">{isRegistering ? 'Registrati' : 'Accedi'}</h2>
              </div>

              <div className="space-y-4">
                {isRegistering && (
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Nome</label>
                    <div className="relative">
                      <User className="w-5 h-5 text-on-surface-variant/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Come vuoi essere chiamato"
                        maxLength={40}
                        className="w-full bg-surface-variant rounded-xl border-none focus:ring-2 focus:ring-primary pl-11 pr-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/50"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="iltuoindirizzo@email.com"
                    className="w-full bg-surface-variant rounded-xl border-none focus:ring-2 focus:ring-primary px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-surface-variant rounded-xl border-none focus:ring-2 focus:ring-primary px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/50"
                  />
                </div>
              </div>

              {!isRegistering && (
                <div className="flex justify-end mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMethod('forgot_password');
                      setError('');
                      setResetSent(false);
                    }}
                    className="text-sm text-secondary hover:text-secondary/80 font-medium hover:underline transition-colors"
                  >
                    Hai dimenticato la password?
                  </button>
                </div>
              )}

              {error && <p className="text-error text-sm mt-2">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-secondary border-2 border-secondary border-opacity-30 font-bold py-3.5 px-4 rounded-xl mt-4 flex items-center justify-center hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-5 h-5 mr-3 animate-spin" />}
                {loading ? 'Attendi...' : isRegistering ? 'Registrati' : 'Accedi'}
              </button>

              {isBiometricAvailable && !isRegistering && isBiometricPrefEnabled() && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleBiometricLogin}
                  className="w-full bg-surface-variant text-on-surface border border-on-surface/20 font-bold py-3.5 px-4 rounded-xl mt-2 flex items-center justify-center hover:bg-surface-variant/80 transition-colors disabled:opacity-50"
                >
                  <Fingerprint className="w-5 h-5 mr-2 text-secondary" />
                  Accedi con Face ID / Impronta
                </button>
              )}

              <p className="text-center text-sm text-on-surface-variant mt-2">
                {isRegistering ? 'Hai già un account? ' : 'Non hai un account? '}
                <button
                  type="button"
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="text-secondary hover:text-secondary/80 font-medium hover:underline transition-colors"
                >
                  {isRegistering ? 'Accedi' : 'Registrati'}
                </button>
              </p>
            </motion.form>
          ) : method === 'forgot_password' ? (
            <motion.form
              key="forgot_password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleResetPassword}
              className="flex flex-col gap-4 w-full"
            >
              <div className="flex items-center mb-2">
                <button
                  type="button"
                  onClick={() => setMethod('email')}
                  className="p-2 -ml-2 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors mr-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-semibold">Reimposta Password</h2>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-on-surface-variant">
                  Inserisci l'indirizzo email associato al tuo account e ti invieremo un link per creare una nuova password.
                </p>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="iltuoindirizzo@email.com"
                    className="w-full bg-surface-variant rounded-xl border-none focus:ring-2 focus:ring-primary px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/50"
                  />
                </div>
              </div>

              {resetSent && (
                <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-on-surface">
                    Se l'email è registrata riceverai un link per reimpostare la password.
                    Controlla anche lo Spam. Apri il link, imposta la nuova password e poi
                    torna qui ad accedere.
                  </p>
                </div>
              )}

              {error && <p className="text-error text-sm mt-2">{error}</p>}

              <button
                type="submit"
                disabled={loading || resetCooldown > 0}
                className="w-full bg-primary text-secondary border-2 border-secondary border-opacity-30 font-bold py-3.5 px-4 rounded-xl mt-4 flex items-center justify-center hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-5 h-5 mr-3 animate-spin" />}
                {loading
                  ? 'Attendi...'
                  : resetCooldown > 0
                    ? `Reinvia tra ${resetCooldown}s`
                    : resetSent ? 'Reinvia link' : 'Invia link di reset'}
              </button>
            </motion.form>
          ) : method === 'update_password' ? (
            <motion.form
              key="update_password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleUpdatePassword}
              className="flex flex-col gap-4 w-full"
            >
              <div className="flex items-center mb-2">
                <h2 className="text-lg font-semibold">Nuova Password</h2>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-on-surface-variant">
                  Inserisci la tua nuova password di accesso a World in Pocket (minimo 6 caratteri).
                </p>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Nuova Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Minimo 6 caratteri"
                    className="w-full bg-surface-variant rounded-xl border-none focus:ring-2 focus:ring-primary px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">Conferma Nuova Password</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Ripeti la password"
                    className="w-full bg-surface-variant rounded-xl border-none focus:ring-2 focus:ring-primary px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/50"
                  />
                </div>
              </div>

              {error && <p className="text-error text-sm mt-2">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-secondary border-2 border-secondary border-opacity-30 font-bold py-3.5 px-4 rounded-xl mt-4 flex items-center justify-center hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-5 h-5 mr-3 animate-spin" />}
                {loading ? 'Attendi...' : 'Salva Nuova Password'}
              </button>
            </motion.form>
          ) : null}
        </AnimatePresence>


        <p className="text-center text-xs text-on-surface-variant/60 mt-8 mb-4">
          Continuando accetti i nostri Termini di Servizio e le Condizioni di Privacy.
        </p>

      </motion.div>
    </div>
  );
}
