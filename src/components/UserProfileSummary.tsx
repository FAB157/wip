import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/quotaManager';
import { User, Crown, Loader2, MapPin, X, Coins, TrendingUp, Gift } from 'lucide-react';

import { Language, getTranslation } from '../lib/i18n';

interface UserProfileSummaryProps {
  session: any;
  userName?: string;
  userAvatar?: string;
  language: Language;
  onOpenFreeFeatures?: () => void;
}

export default function UserProfileSummary({ session, userName, userAvatar, language, onOpenFreeFeatures }: UserProfileSummaryProps) {
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem('wip_user_profile');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!profile);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [visitedNames, setVisitedNames] = useState<string[]>([]);
  const [showVisitedModal, setShowVisitedModal] = useState(false);

  // Still supporting the local storage avatars just to not break existing user customization if not passed
  const [localUserName, setLocalUserName] = useState(() => localStorage.getItem('userProfileName') || '');
  const [localUserAvatar, setLocalUserAvatar] = useState(() => localStorage.getItem('userProfileAvatar') || '👤');
  const [quotaCounters, setQuotaCounters] = useState<any>(null);
  const [nextLevel, setNextLevel] = useState<any>(null);

  const finalUserName = userName !== undefined ? userName : localUserName;
  const finalUserAvatar = userAvatar !== undefined ? userAvatar : localUserAvatar;

  useEffect(() => {
    async function fetchQuotaAndLevels() {
      if (!session?.user?.id) return;
      try {
        // Fetch User Quotas for credits
        const { data: qData } = await supabase.from('user_quotas').select('*').eq('user_id', session.user.id).single();
        if (qData) setQuotaCounters(qData);

        // Fetch Levels to find the next one
        const { data: levels } = await supabase.from('gamification_levels').select('*').order('level', { ascending: true });
        if (levels && profile) {
          const next = levels.find((l: any) => l.xp_required > (profile.xp_points || 0));
          setNextLevel(next);
        }
      } catch (e) {}
    }
    fetchQuotaAndLevels();
  }, [session, profile]);

  useEffect(() => {
    async function fetchProfile() {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error("Error fetching user profile:", error);
        } else if (data) {
          setProfile(data);
          localStorage.setItem('wip_user_profile', JSON.stringify(data));
          
          // Fetch POI names for visited_pois
          if (data.visited_pois && data.visited_pois.length > 0) {
            const { data: poisData } = await supabase
              .from('shared_pois')
              .select('name')
              .in('id', data.visited_pois);
            if (poisData) {
              setVisitedNames(poisData.map((p: any) => p.name));
            }
          }
        }
        
        // Fetch gamification challenges dynamically
        const { data: challengesData } = await supabase
          .from('gamification_challenges')
          .select('*')
          .order('created_at', { ascending: true });
          
        if (challengesData) {
          setChallenges(challengesData);
        }
      } catch (err) {
        console.error("Failed to load profile:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();

    // Ri-fetch immediato del saldo a ogni consumo/rimborso crediti:
    // senza, il badge restava fermo al valore caricato al mount (o al
    // JSON stale in localStorage) finché non cambiava la sessione.
    const onCreditsUpdated = () => fetchProfile();
    window.addEventListener('wip-credits-updated', onCreditsUpdated);
    // "Luoghi Visti" si aggiorna appena esplori un nuovo POI (l'evento parte
    // da recordPoiVision): prima il contatore restava fermo al valore del
    // mount finché non riavviavi l'app.
    window.addEventListener('wip-gamification-badge', onCreditsUpdated);
    return () => {
      window.removeEventListener('wip-credits-updated', onCreditsUpdated);
      window.removeEventListener('wip-gamification-badge', onCreditsUpdated);
    };
  }, [session]);

  const currentUserEmail = session?.user?.email || profile?.email || 'Guest';
  // display_name è dove scrivono registrazione e ProfileScreen (prima si
  // leggeva solo full_name — che arriva da Google — e il nome scelto alla
  // registrazione non compariva mai). Priorità: prop → display_name (nostro)
  // → full_name (Google) → profilo DB → parte locale dell'email.
  const displayUserName = finalUserName
    || session?.user?.user_metadata?.display_name
    || session?.user?.user_metadata?.full_name
    || (profile as any)?.display_name
    || currentUserEmail.split('@')[0];

  return (
    <>
      <div className="relative z-10">
        <div className="flex items-center gap-5 mb-8">
          <div className="w-24 h-24 overflow-hidden rounded-full bg-white flex items-center justify-center text-4xl border border-gray-100 shadow-sm">
            {(finalUserAvatar.startsWith('http') || finalUserAvatar.startsWith('data:')) ? (
              <img src={finalUserAvatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              finalUserAvatar
            )}
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900 leading-tight">{displayUserName}</h1>
            <div className="flex flex-col gap-1 mt-1">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100 shadow-sm">
                  <Coins className="w-3 h-3" />
                  <span className="text-[11px] font-black uppercase tracking-tight">
                    {(profile?.purchased_credits || 0) + (profile?.earned_credits || 0)} Crediti
                  </span>
                </div>
                <span className="text-[10px] font-bold text-gray-400 truncate max-w-[150px]">{currentUserEmail}</span>
              </div>
            </div>
          </div>
        </div>

        {/* User Stats & XP Progress */}
        <div className="mt-4 space-y-3">
          <div className="flex gap-3">
            {/* XP Progress Bar */}
            <div className="flex-[2] bg-white rounded-[1.5rem] p-4 border border-gray-100 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Progresso XP</span>
                </div>
                <span className="text-[10px] font-black text-gray-900">
                  {profile?.xp_points || 0} <span className="text-gray-400">/ {nextLevel ? nextLevel.xp_required : (profile?.xp_points || 0)} XP</span>
                </span>
              </div>

              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-1000"
                  style={{
                    width: `${nextLevel ? Math.min(100, (profile?.xp_points || 0) / nextLevel.xp_required * 100) : 100}%`
                  }}
                />
              </div>

              {nextLevel && (
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[9px] font-bold text-gray-400">Obiettivo: {nextLevel.title}</span>
                  {nextLevel.reward_credits > 0 && (
                    <span className="flex items-center gap-1 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded text-[9px] font-black uppercase border border-amber-200">
                      🏆 {nextLevel.reward_credits} 🪙
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Places Visited Small */}
            <button
              onClick={() => setShowVisitedModal(true)}
              className="flex-1 bg-white rounded-[1.5rem] p-4 border border-gray-100 shadow-sm flex flex-col justify-center hover:border-gray-200 transition-all"
            >
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1 leading-none text-center">Luoghi Visti</span>
              <div className="flex items-center justify-center gap-1.5">
                <MapPin className="w-3 h-3 text-rose-500" />
                {/* Fonte di verità: visited_pois del profilo. Il vecchio
                    visitedNames.length mostrava 0 quando i nomi non si
                    risolvevano da shared_pois (POI rimossi o id non trovati). */}
                <span className="text-xl font-black text-gray-900 leading-none">{profile?.visited_pois?.length || 0}</span>
              </div>
            </button>

            {/* Free Features Button */}
            {onOpenFreeFeatures && (
              <button
                onClick={onOpenFreeFeatures}
                className="flex-1 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-[1.5rem] p-4 border border-emerald-100 shadow-sm flex flex-col justify-center items-center hover:border-emerald-200 transition-all"
              >
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-1 leading-none text-center">App Gratuita</span>
                <Gift className="w-5 h-5 text-emerald-500 mt-1" />
              </button>
            )}
          </div>
        </div>
      </div>

      {showVisitedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#f8f5f0] w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white">
              <h3 className="font-black text-[#1e3a8a] text-sm flex items-center gap-2 uppercase tracking-widest">
                <MapPin className="w-4 h-4 text-secondary" />
                {getTranslation("explored_places", language)}
              </h3>
              <button onClick={() => setShowVisitedModal(false)} className="p-1.5 bg-gray-100 text-gray-500 rounded-full">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-[50dvh] overflow-y-auto bg-[#f8f5f0]">
              {(profile?.visited_pois?.length || 0) === 0 ? (
                <div className="text-center text-gray-500 text-xs py-6 font-medium">
                  {getTranslation("explored_empty", language)}
                </div>
              ) : (
                <ul className="space-y-2">
                  {visitedNames.map((name, idx) => (
                    <li key={idx} className="bg-white p-3 rounded-xl shadow-sm text-sm font-bold text-[#1e3a8a] flex items-center gap-2 border border-gray-100">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                      {name}
                    </li>
                  ))}
                  {(profile?.visited_pois?.length || 0) > visitedNames.length && (
                    <li className="text-center text-gray-400 text-xs py-2 font-medium">
                      + {(profile?.visited_pois?.length || 0) - visitedNames.length} altri luoghi esplorati
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
