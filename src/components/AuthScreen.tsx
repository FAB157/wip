import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { Compass, Mail, Lock, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { getTranslation, linguaCorrente } from '../lib/i18n';

interface AuthScreenProps {
  onSuccess: () => void;
}

export default function AuthScreen({ onSuccess }: AuthScreenProps) {
  // Nessuna prop `language`: la lingua arriva dalla chiave localStorage
  // scritta da App.tsx (fallback IT).
  const lingua = linguaCorrente();
  const t = (k: string) => getTranslation(k, lingua);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session && data.user) {
          throw new Error(t('vr_a_auth_signup_done'));
        }
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || err.toString() || t('vr_a_err_auth_generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-background z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface rounded-3xl p-8 w-full max-w-sm shadow-2xl space-y-8 border border-outline-variant"
      >
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary rounded-2xl mx-auto flex items-center justify-center text-secondary mb-4 shadow-lg shadow-primary/20">
            <Compass className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-on-surface tracking-tight">
            Italia in Tasca
          </h1>
          <p className="text-sm font-bold text-on-surface-variant opacity-70">
            {isLogin ? t('vr_a_auth_login_sub') : t('vr_a_auth_signup_sub')}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs font-bold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 w-4 h-4 text-on-surface-variant/40" />
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder={t('vr_a_auth_email_ph')}
                className="w-full bg-surface-variant pl-10 pr-4 py-3 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-secondary text-on-surface"
                required
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-3.5 w-4 h-4 text-on-surface-variant/40" />
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('vr_a_login_password_label')}
                className="w-full bg-surface-variant pl-10 pr-4 py-3 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-secondary text-on-surface"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-primary hover:opacity-90 disabled:opacity-50 text-secondary border border-secondary/30 rounded-2xl py-3.5 font-black text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/20"
          >
            {loading ? t('vr_a_auth_loading') : isLogin ? (
              <><LogIn className="w-4 h-4" /> {t('vr_a_auth_enter')}</>
            ) : (
              <><UserPlus className="w-4 h-4" /> {t('vr_a_login_register')}</>
            )}
          </button>
        </form>

        <div className="text-center">
          <button 
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-xs font-bold text-secondary hover:underline"
          >
            {isLogin ? t('vr_a_auth_no_account_cta') : t('vr_a_auth_have_account_cta')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
