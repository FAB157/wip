import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Loader2, Fingerprint, CheckCircle2, User } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { notify } from '../lib/toast';
import { useBiometricAuth, hasSavedBiometricCredentials } from '../hooks/useBiometricAuth';
import { getTranslation, linguaCorrente } from '../lib/i18n';

interface LoginScreenProps {
  onLoginSuccess: (session: any) => void;
  initialAuthLoading?: boolean;
  forceMethod?: 'email' | 'forgot_password' | 'update_password';
  /**
   * Presente quando la schermata è aperta COME MODALE sopra l'app in modalità
   * ospite (28/08/2026): mostra la X e il tasto "Continua senza account", così
   * chi non vuole registrarsi torna alla mappa. Assente = gate d'avvio
   * (caricamento sessione / reset password), che non si chiude.
   */
  onClose?: () => void;
}

/** Lo sblocco biometrico è un'opzione di sicurezza disattivabile dal profilo. */
export const BIOMETRIC_PREF_KEY = 'wip_biometric_enabled';
export const isBiometricPrefEnabled = () => localStorage.getItem(BIOMETRIC_PREF_KEY) !== 'false';

export default function LoginScreen({ onLoginSuccess, initialAuthLoading = false, forceMethod, onClose }: LoginScreenProps) {
  // Niente prop `language` qui: la schermata vive prima/fuori dall'albero
  // principale, quindi la lingua si legge dalla stessa chiave che App.tsx
  // scrive a ogni cambio (fallback IT).
  const lingua = linguaCorrente();
  const t = (k: string) => getTranslation(k, lingua);
  const [method, setMethod] = useState<'email' | 'forgot_password' | 'update_password'>(forceMethod || 'email');
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Stato in-page del reset (niente più notify()): messaggio persistente +
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

  // Email non confermata al login: mostra il tasto "Reinvia email di conferma".
  const [needsConfirm, setNeedsConfirm] = useState(false);
  // Dopo una registrazione che richiede conferma email: guida PERSISTENTE in
  // pagina + azione "Ho confermato, accedi", così l'utente non resta bloccato.
  // Su nativo il link di conferma apre il browser su wip.guide (non esiste un
  // handler deep-link auth nell'app), quindi dopo la conferma l'utente rientra
  // qui e accede: questo pannello glielo rende esplicito.
  const [signupConfirmPending, setSignupConfirmPending] = useState(false);

  const friendlyError = (e: any): string => {
    const msg = e?.message || '';
    // Timeout/abort di rete (wrapper supabase o browser): il messaggio grezzo
    // "signal is aborted without reason" non deve arrivare all'utente.
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError' || msg.includes('aborted') || msg.includes('interrotta dopo')) {
      return t('vr_a_err_slow_conn');
    }
    if (msg.includes('Email not confirmed')) {
      return t('vr_a_err_email_unconfirmed');
    }
    if (msg.includes('Invalid login credentials')) {
      return t('vr_a_err_invalid_creds');
    }
    if (msg.includes('User already registered')) {
      return t('vr_a_err_already_registered');
    }
    if (msg.includes('Password should be at least')) {
      return t('vr_a_err_pwd_min6');
    }
    if (msg.includes('Email rate limit') || msg.includes('rate limit')) {
      return t('vr_a_err_rate_limit');
    }
    if (msg === 'Failed to fetch') {
      return t('vr_a_err_no_conn');
    }
    return msg || t('vr_a_err_auth_generic');
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNeedsConfirm(false);
    setSignupConfirmPending(false);
    try {
      if (isRegistering) {
        const trimmedName = name.trim();
        if (!trimmedName) {
          setError(t('vr_a_login_name_required'));
          setLoading(false);
          return;
        }
        // Il nome viaggia nei metadata auth (display_name) e viene salvato
        // subito anche in locale: la home del profilo lo mostra dal primo avvio.
        // Il link di conferma email deve atterrare sulla PWA di produzione:
        // su nativo window.location.origin è capacitor://localhost e il link
        // non potrebbe mai tornare nell'app.
        // Path dedicato /auth/callback (invece della bare root) così l'App
        // Link Android / Universal Link iOS può essere delimitato a QUEL path
        // senza intercettare anche /privacy, /support, i link ?pin=/?groupplan=
        // e le altre pagine su wip.guide. Sul web non cambia nulla: la SPA non
        // ha un router e ignora il pathname (vedi App.tsx).
        const confirmRedirect = Capacitor.isNativePlatform() ? 'https://wip.guide/auth/callback' : window.location.origin;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: trimmedName }, emailRedirectTo: confirmRedirect },
        });
        if (error) throw error;
        localStorage.setItem('userProfileName', trimmedName);
        if (data.session) {
          if (isBiometricAvailable && isBiometricPrefEnabled()) {
            await saveCredentials(email, password).catch(() => {});
          }
          onLoginSuccess(data.session);
        } else {
          notify(t('vr_a_login_signup_done'));
          setIsRegistering(false);
          setSignupConfirmPending(true);
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
      if (String(e?.message || '').includes('Email not confirmed')) setNeedsConfirm(true);
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!email) { setError(t('vr_a_login_resend_need_email')); return; }
    setLoading(true);
    try {
      const redirectTo = Capacitor.isNativePlatform() ? 'https://wip.guide/auth/callback' : window.location.origin;
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      notify(t('vr_a_login_confirm_resent'));
      setNeedsConfirm(false);
      setError('');
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  // "Ho confermato, accedi": dopo aver aperto il link dall'email, l'utente
  // rientra e tenta l'accesso con le stesse credenziali. Se l'account non è
  // ancora confermato, messaggio dedicato invece di bloccarlo.
  const handleAlreadyConfirmed = async () => {
    if (!email || !password) {
      // Password non più in memoria: torna al login classico con email pronta.
      setIsRegistering(false);
      setSignupConfirmPending(false);
      setError(t('vr_a_login_reenter_creds'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.session) {
        setSignupConfirmPending(false);
        if (isBiometricAvailable && isBiometricPrefEnabled()) {
          await saveCredentials(email, password).catch(() => {});
        }
        onLoginSuccess(data.session);
      }
    } catch (e: any) {
      if (String(e?.message || '').includes('Email not confirmed')) {
        setError(t('vr_a_login_still_unconfirmed'));
      } else {
        setError(friendlyError(e));
      }
    } finally {
      setLoading(false);
    }
  };

  // FaceID/impronta parte DA SOLA all'apertura del login quando ci sono
  // credenziali salvate (esperienza da app bancaria): il bottone resta come
  // ripiego se l'utente annulla il prompt. Un solo tentativo automatico.
  const autoBioTriedRef = useRef(false);
  useEffect(() => {
    if (autoBioTriedRef.current) return;
    if (!isBiometricAvailable || isRegistering || !isBiometricPrefEnabled()) return;
    if (!hasSavedBiometricCredentials()) return;
    autoBioTriedRef.current = true;
    handleBiometricLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBiometricAvailable]);

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
        setError(t('vr_a_login_no_saved_creds'));
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
      setError(t('vr_a_login_email_for_reset'));
      return;
    }
    if (resetCooldown > 0) return;
    setLoading(true);
    setError('');
    try {
      // Su app nativa window.location.origin è capacitor://localhost: il link
      // email non potrebbe mai tornare qui. Si usa la PWA di produzione, dove
      // il flusso PASSWORD_RECOVERY → "Nuova Password" funziona già; poi
      // l'utente rientra nell'app con la nuova password. Path dedicato
      // /auth/callback: vedi commento su confirmRedirect più sopra.
      const redirectTo = Capacitor.isNativePlatform()
        ? 'https://wip.guide/auth/callback'
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
      setError(t('vr_a_login_new_pwd_required'));
      return;
    }
    if (newPassword.length < 6) {
      setError(t('vr_a_err_pwd_min6_short'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('vr_a_login_pwd_mismatch'));
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
      notify(t('vr_a_login_pwd_updated'));
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
      {/* (29/08/2026) Qui c'erano la X e il link «continua senza account»:
          l'accesso e' tornato OBBLIGATORIO per decisione del committente, e
          una via d'uscita dal login non deve esistere. `onClose` resta nella
          firma perche' App.tsx apre questa stessa schermata quando la sessione
          SCADE durante l'uso — li' non si esce, si rientra. */}
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
              <h1 className="text-2xl font-bold text-on-surface mb-2">{t('vr_a_login_welcome')}</h1>
              <p className="text-on-surface-variant text-center">{t('vr_a_login_subtitle')}</p>
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
              <p className="text-on-surface-variant text-sm font-medium animate-pulse">{t('vr_a_login_checking')}</p>
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
                <h2 className="text-lg font-semibold">{isRegistering ? t('vr_a_login_register') : t('vr_a_login_signin')}</h2>
              </div>

              {signupConfirmPending && (
                <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-on-surface space-y-3 w-full">
                    <p>
                      {t('vr_a_login_confirm_sent')}{email ? <> {t('vr_a_login_confirm_to')} <b className="break-all">{email}</b></> : ''}.{' '}
                      {t('vr_a_login_confirm_open1')}<b>Spam</b>{t('vr_a_login_confirm_open2')}
                    </p>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={handleAlreadyConfirmed}
                        disabled={loading}
                        className="w-full py-2.5 rounded-xl bg-primary text-secondary border-2 border-secondary border-opacity-30 text-sm font-bold hover:bg-primary/80 transition-colors disabled:opacity-50 flex items-center justify-center"
                      >
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {t('vr_a_login_confirmed_signin')}
                      </button>
                      <button
                        type="button"
                        onClick={handleResendConfirmation}
                        disabled={loading}
                        className="w-full py-2.5 rounded-xl border border-secondary/30 text-secondary text-sm font-bold hover:bg-secondary/10 transition-colors disabled:opacity-50"
                      >
                        {t('vr_a_login_resend_confirm')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {isRegistering && (
                  <div>
                    <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">{t('vr_a_login_name_label')}</label>
                    <div className="relative">
                      <User className="w-5 h-5 text-on-surface-variant/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder={t('vr_a_login_name_ph')}
                        maxLength={40}
                        className="w-full bg-surface-variant rounded-xl border-none focus:ring-2 focus:ring-primary pl-11 pr-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/50"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">{t('vr_a_login_email_label')}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t('vr_a_login_email_ph')}
                    className="w-full bg-surface-variant rounded-xl border-none focus:ring-2 focus:ring-primary px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">{t('vr_a_login_password_label')}</label>
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
                    {t('vr_a_login_forgot')}
                  </button>
                </div>
              )}

              {error && <p className="text-error text-sm mt-2">{error}</p>}
              {needsConfirm && (
                <button
                  type="button"
                  onClick={handleResendConfirmation}
                  disabled={loading}
                  className="w-full mt-2 py-2.5 rounded-xl border border-secondary/30 text-secondary text-sm font-bold hover:bg-secondary/10 transition-colors disabled:opacity-50"
                >
                  {t('vr_a_login_resend_confirm')}
                </button>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-secondary border-2 border-secondary border-opacity-30 font-bold py-3.5 px-4 rounded-xl mt-4 flex items-center justify-center hover:bg-primary/80 transition-colors disabled:opacity-50"
              >
                {loading && <Loader2 className="w-5 h-5 mr-3 animate-spin" />}
                {loading ? t('vr_a_login_wait') : isRegistering ? t('vr_a_login_register') : t('vr_a_login_signin')}
              </button>

              {isBiometricAvailable && !isRegistering && isBiometricPrefEnabled() && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleBiometricLogin}
                  className="w-full bg-surface-variant text-on-surface border border-on-surface/20 font-bold py-3.5 px-4 rounded-xl mt-2 flex items-center justify-center hover:bg-surface-variant/80 transition-colors disabled:opacity-50"
                >
                  <Fingerprint className="w-5 h-5 mr-2 text-secondary" />
                  {t('vr_a_login_biometric')}
                </button>
              )}

              <p className="text-center text-sm text-on-surface-variant mt-2">
                {isRegistering ? t('vr_a_login_have_account') : t('vr_a_login_no_account')}
                <button
                  type="button"
                  onClick={() => { setIsRegistering(!isRegistering); setSignupConfirmPending(false); setError(''); }}
                  className="text-secondary hover:text-secondary/80 font-medium hover:underline transition-colors"
                >
                  {isRegistering ? t('vr_a_login_signin') : t('vr_a_login_register')}
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
                <h2 className="text-lg font-semibold">{t('vr_a_login_reset_title')}</h2>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-on-surface-variant">
                  {t('vr_a_login_reset_desc')}
                </p>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">{t('vr_a_login_email_label')}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={t('vr_a_login_email_ph')}
                    className="w-full bg-surface-variant rounded-xl border-none focus:ring-2 focus:ring-primary px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/50"
                  />
                </div>
              </div>

              {resetSent && (
                <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/30 rounded-xl p-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-on-surface">
                    {t('vr_a_login_reset_sent')}
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
                  ? t('vr_a_login_wait')
                  : resetCooldown > 0
                    ? `${t('vr_a_login_resend_in')} ${resetCooldown}s`
                    : resetSent ? t('vr_a_login_resend_link') : t('vr_a_login_send_reset')}
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
                <h2 className="text-lg font-semibold">{t('vr_a_login_newpwd_title')}</h2>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-on-surface-variant">
                  {t('vr_a_login_newpwd_desc')}
                </p>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">{t('vr_a_login_newpwd_title')}</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder={t('vr_a_login_newpwd_ph')}
                    className="w-full bg-surface-variant rounded-xl border-none focus:ring-2 focus:ring-primary px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-on-surface-variant mb-1 ml-1">{t('vr_a_login_confirm_pwd_label')}</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder={t('vr_a_login_confirm_pwd_ph')}
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
                {loading ? t('vr_a_login_wait') : t('vr_a_login_save_newpwd')}
              </button>
            </motion.form>
          ) : null}
        </AnimatePresence>

        <p className="text-center text-xs text-on-surface-variant/60 mt-8 mb-4">
          {t('vr_a_login_terms_pre')}{' '}
          <a href="https://wip.guide/terms" target="_blank" rel="noopener noreferrer" className="underline font-bold">{t('vr_a_login_terms_tos')}</a>
          {' '}{t('vr_a_login_terms_and')}{' '}
          <a href="https://wip.guide/privacy" target="_blank" rel="noopener noreferrer" className="underline font-bold">{t('vr_a_login_terms_privacy')}</a>.
        </p>

      </motion.div>
    </div>
  );
}
