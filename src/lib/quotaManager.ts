import { supabase } from './supabase';

export type FeatureType = 'itinerary' | 'audio_guide' | 'poi_detail' | 'photo_search' | 'premium_guide';

export const QUOTA_LIMITS = {
  free: {
    itinerary: 1,
    audio_guide: 3,
    poi_detail: 5,
    photo_search: 2,
    premium_guide: 0,   // Guide premium: solo utenti premium
  },
  premium: {
    itinerary: 9999,
    audio_guide: 9999,
    poi_detail: 9999,
    photo_search: 9999,
    premium_guide: 10,  // 10 guide PDF al mese
  }
};

export interface UserProfile {
  id: string;
  email?: string;
  subscription_tier: 'free' | 'premium';
  subscription_status?: string | null;
  subscription_plan?: string | null;
  current_period_end?: string | null;
  premium_until?: string | null;
  is_forever_premium: boolean;
  is_admin: boolean;
  stripe_customer_id?: string | null;
  custom_limit_itinerary?: number | null;
  custom_limit_audio_guide?: number | null;
  xp_points?: number;
  unlocked_badges?: string[];
  visited_categories?: any;
  bonus_vision?: number;
  bonus_audio?: number;
  bonus_itinerari?: number;
  purchased_credits?: number;
  earned_credits?: number;
}

export interface GlobalQuota {
  tier: 'free' | 'premium';
  itineraries_limit: number;
  audio_guides_limit: number;
  poi_details_limit: number;
  photo_searches_limit: number;
  premium_guides_limit: number;
}

export const getBonusCount = async (userId: string, featureType: FeatureType): Promise<number> => {
  const profile = await getUserProfile(userId);
  if (featureType === 'audio_guide') return profile.bonus_audio || 0;
  if (featureType === 'itinerary') return profile.bonus_itinerari || 0;
  if (featureType === 'photo_search') return profile.bonus_vision || 0;
  if (featureType === 'premium_guide') return 0; // No bonus for premium guides
  return 0;
};

export const consumeBonus = async (userId: string, featureType: FeatureType): Promise<boolean> => {
  let type = '';
  if (featureType === 'audio_guide') type = 'audio';
  else if (featureType === 'itinerary') type = 'itinerari';
  else if (featureType === 'photo_search') type = 'vision';
  else return false;

  try {
    const { data, error } = await supabase.rpc('consume_user_bonus', { p_user_id: userId, p_type: type });
    if (error) {
      console.error('Error consuming bonus:', error);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error('Exception consuming bonus:', err);
    return false;
  }
};

export const getGlobalQuotas = async (): Promise<GlobalQuota[]> => {
  try {
    const { data, error } = await supabase.from('global_quotas').select('*');
    if (!error && data && data.length > 0) {
      return data as GlobalQuota[];
    }
  } catch (err) {
    console.error('Error fetching global quotas:', err);
  }

  // Fallback seed / default limits
  const fallbackQuotas: GlobalQuota[] = [
    { tier: 'free', itineraries_limit: 1, audio_guides_limit: 3, poi_details_limit: 5, photo_searches_limit: 2, premium_guides_limit: 0 },
    { tier: 'premium', itineraries_limit: 9999, audio_guides_limit: 9999, poi_details_limit: 9999, photo_searches_limit: 9999, premium_guides_limit: 10 }
  ];

  // Disabilitato auto-seed globale per evitare scritture inutili
  return fallbackQuotas;
};

export const isUserPremium = (profile: UserProfile): boolean => {
  if (profile.is_forever_premium) return true;
  
  const now = new Date();
  
  if (profile.subscription_status === 'active' && profile.current_period_end) {
    if (new Date(profile.current_period_end) > now) return true;
  }
  
  if (profile.premium_until) {
     if (new Date(profile.premium_until) > now) return true;
  }
  
  return false;
};

export const getUserProfile = async (userId: string = "mock-user-id"): Promise<UserProfile> => {
  let rowMissing = false;
  try {
    // maybeSingle: distingue "riga assente" (data null, nessun errore) da un
    // errore di rete/RLS. Prima un errore transitorio faceva scattare l'upsert
    // del fallback che AZZERAVA crediti e abbonamento reali dell'utente
    // (e rigenerava 100 earned_credits: exploit di crediti infiniti).
    const { data, error } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
    if (data) {
      // Admin di servizio: solo l'account owner. Il vecchio "|| id === 'mock-user-id'"
      // dava is_admin a chiunque non fosse loggato.
      if (data.email?.toLowerCase() === 'marmidicarrara@gmail.com') {
        data.is_admin = true;
      }
      return data as UserProfile;
    }
    rowMissing = !error;
    if (error) console.error('Error fetching user profile:', error);
  } catch (err) {
    console.error('Error fetching user profile:', err);
  }

  // Fallback / Initial mock profile when not set in database
  const fallbackProfile: UserProfile = {
    id: userId,
    email: userId.includes('@') ? userId : '', // Just a safe placeholder since we don't know the email here unless we query auth
    subscription_tier: 'free',
    premium_until: null,
    is_forever_premium: false,
    // MAI admin dal fallback: 'mock-user-id' è l'utente NON loggato — il vecchio
    // `userId === 'mock-user-id'` mostrava il tab Admin a chiunque da sloggato.
    is_admin: false,
    purchased_credits: 0,
    earned_credits: 100, // 100 free credits at signup
  };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData?.session?.user;
    const sessionEmail = sessionUser?.email;
    if (sessionEmail) {
      fallbackProfile.email = sessionEmail;
      if (sessionEmail.toLowerCase() === 'marmidicarrara@gmail.com') {
        fallbackProfile.is_admin = true;
      }
    }
    // Nome scelto in registrazione (display_name) o dall'account Google
    // (full_name): finisce nella riga profilo fin dalla creazione.
    const metaName = sessionUser?.user_metadata?.display_name || sessionUser?.user_metadata?.full_name;
    if (metaName) (fallbackProfile as any).display_name = metaName;
  } catch (e) {}

  // Seed SOLO se la riga è confermata assente, e con ignoreDuplicates così un
  // insert concorrente non viene mai sovrascritto. Mai su errore di rete.
  if (userId !== 'mock-user-id' && rowMissing) {
    try {
      await supabase.from('user_profiles').upsert(fallbackProfile, { onConflict: 'id', ignoreDuplicates: true });
    } catch (e) {}
  }

  return fallbackProfile;
};

export const getUserTier = async (userId: string): Promise<'free' | 'premium'> => {
  try {
    const profile = await getUserProfile(userId);
    if (!profile) return 'free';

    if (isUserPremium(profile)) {
      if (profile.subscription_tier !== 'premium') {
         await supabase.from('user_profiles').upsert({ ...profile, subscription_tier: 'premium' });
      }
      return 'premium';
    } else {
      if (profile.subscription_status === 'active' || profile.premium_until || profile.subscription_tier === 'premium') {
        // Demote
        const demoted: UserProfile = {
          ...profile,
          subscription_tier: 'free',
          subscription_status: 'canceled',
          premium_until: null,
        };
        try {
          await supabase.from('user_profiles').upsert(demoted);
        } catch (updateErr) {
          console.error("Failed to auto-demote in DB:", updateErr);
        }
      }
      return 'free';
    }
  } catch (err) {
    console.error('Error fetching user tier:', err);
  }
  return 'free'; // Default to free if error or not found
};

/**
 * Checks if a user has enough quota for a specific feature on the current date.
 */
export const checkQuota = async (
  userId: string = "mock-user-id", 
  tier: 'free' | 'premium', 
  featureType: FeatureType,
  profile?: UserProfile
): Promise<boolean> => {
  // Sblocco totale per gli amministratori
  if (profile?.is_admin) {
    return true;
  }

  // 1. Fetch dynamic global quota limits (fallback)
  const globalQuotas = await getGlobalQuotas();
  const tierQuota = globalQuotas.find(q => q.tier === tier) || {
    itineraries_limit: QUOTA_LIMITS[tier].itinerary,
    audio_guides_limit: QUOTA_LIMITS[tier].audio_guide,
    poi_details_limit: QUOTA_LIMITS[tier].poi_detail,
    photo_searches_limit: QUOTA_LIMITS[tier].photo_search,
    premium_guides_limit: QUOTA_LIMITS[tier].premium_guide,
  };

  try {
    const { data: quotas, error } = await supabase
      .from('user_quotas')
      .select('*')
      .eq('user_id', userId);

    let userRecord = quotas && quotas.length > 0 ? quotas[0] : null;

    if (!userRecord) {
      // Create a default record based on tier if missing
      userRecord = {
        user_id: userId,
        itinerari_used: 0,
        itinerari_limit: (tierQuota as any).itineraries_limit || QUOTA_LIMITS[tier].itinerary,
        audioguide_used: 0,
        audioguide_limit: (tierQuota as any).audio_guides_limit || QUOTA_LIMITS[tier].audio_guide,
        vision_used: 0,
        vision_limit: (tierQuota as any).photo_searches_limit || QUOTA_LIMITS[tier].photo_search,
        poi_details_used: 0,
        poi_details_limit: (tierQuota as any).poi_details_limit || QUOTA_LIMITS[tier].poi_detail,
        premium_guide_used: 0,
        premium_guide_limit: (tierQuota as any).premium_guides_limit || QUOTA_LIMITS[tier].premium_guide,
      };
      
      if (userId !== 'mock-user-id') {
        try {
          await supabase.from('user_quotas').upsert(userRecord);
        } catch (insertErr) {
          console.debug("Failed to upsert default user_quotas:", insertErr);
        }
      }
    }

    let limit = 0;
    let used = 0;

    if (featureType === 'itinerary') {
      limit = userRecord.itinerari_limit || 0;
      used = userRecord.itinerari_used || 0;
    } else if (featureType === 'audio_guide') {
      limit = userRecord.audioguide_limit || 0;
      used = userRecord.audioguide_used || 0;
    } else if (featureType === 'poi_detail') {
      limit = userRecord.poi_details_limit || 0;
      used = userRecord.poi_details_used || 0;
    } else if (featureType === 'photo_search') {
      limit = userRecord.vision_limit || 0;
      used = userRecord.vision_used || 0;
    } else if (featureType === 'premium_guide') {
      limit = userRecord.premium_guide_limit || 0;
      used = userRecord.premium_guide_used || 0;
    }

    // Apply specific custom profile overrides if they exist natively (backwards compatibility)
    if (featureType === 'itinerary' && profile?.custom_limit_itinerary !== undefined && profile.custom_limit_itinerary !== null) {
      limit = profile.custom_limit_itinerary;
    }
    if (featureType === 'audio_guide' && profile?.custom_limit_audio_guide !== undefined && profile.custom_limit_audio_guide !== null) {
      limit = profile.custom_limit_audio_guide;
    }

    return used < limit;
  } catch (err) {
    console.error('Error checking quota:', err);
    return true; // Allow gracefully on error
  }
};

/**
 * Checks user quota automatically by fetching the user tier first.
 * If daily quota is exhausted but the user has bonuses, prompts to use a bonus.
 */
export const checkUserQuota = async (
  userId: string = "mock-user-id", 
  featureType: FeatureType
): Promise<boolean> => {
  const profile = await getUserProfile(userId);
  if (profile.is_admin) return true; // Bypass admin

  const tier = await getUserTier(userId);
  const hasQuota = await checkQuota(userId, tier, featureType, profile);
  
  if (hasQuota) return true;

  // Check bonus
  let bonusCount = 0;
  let bonusType = '';
  if (featureType === 'audio_guide') { bonusCount = profile.bonus_audio || 0; bonusType = 'audioguide'; }
  else if (featureType === 'itinerary') { bonusCount = profile.bonus_itinerari || 0; bonusType = 'itinerari'; }
  else if (featureType === 'photo_search') { bonusCount = profile.bonus_vision || 0; bonusType = 'vision'; }

  if (bonusCount > 0) {
    const useBonus = window.confirm(`Hai esaurito il limite giornaliero. Vuoi usare 1 dei tuoi ${bonusCount} bonus ${bonusType} senza scadenza?`);
    if (useBonus) {
      const success = await consumeBonus(userId, featureType);
      return success;
    }
  }

  return false;
};

/**
 * Increments the user's specific quota for today (upsert +1)
 */
export const incrementQuota = async (
  userId: string = "mock-user-id",
  featureType: FeatureType
): Promise<void> => {
  // DEPRECATO — NO-OP. I contatori d'uso (*_used) sono ora scritti solo dal
  // server (checkAndIncrementQuota, autorità unica). Incrementarli anche dal
  // client causava DOPPIO CONTEGGIO (il tetto reale di 500 audioguide/giorno
  // si dimezzava) e, con la protezione DB su *_used (2026-08-09), lancerebbe
  // un'eccezione RLS. La logica storica resta sotto solo per riferimento.
  return;
  try {
    const { data: quotas, error } = await supabase
      .from('user_quotas')
      .select('*')
      .eq('user_id', userId);

    let existingRecord = quotas && quotas.length > 0 ? quotas[0] : null;

    if (existingRecord) {
      const updatePayload: any = { ...existingRecord };
      
      if (featureType === 'itinerary') {
        updatePayload.itinerari_used = (existingRecord.itinerari_used || 0) + 1;
      } else if (featureType === 'audio_guide') {
        updatePayload.audioguide_used = (existingRecord.audioguide_used || 0) + 1;
      } else if (featureType === 'poi_detail') {
        updatePayload.poi_details_used = (existingRecord.poi_details_used || 0) + 1;
      } else if (featureType === 'photo_search') {
        updatePayload.vision_used = (existingRecord.vision_used || 0) + 1;
      } else if (featureType === 'premium_guide') {
        updatePayload.premium_guide_used = (existingRecord.premium_guide_used || 0) + 1;
      }
      
      await supabase.from('user_quotas').upsert(updatePayload);
    } else {
      // Create new record with 1 used for the specific feature and default tier limits
      const tier = await getUserTier(userId);
      const globalQuotas = await getGlobalQuotas();
      const tierQuota = globalQuotas.find(q => q.tier === tier) || {
        itineraries_limit: QUOTA_LIMITS[tier].itinerary,
        audio_guides_limit: QUOTA_LIMITS[tier].audio_guide,
        poi_details_limit: QUOTA_LIMITS[tier].poi_detail,
        photo_searches_limit: QUOTA_LIMITS[tier].photo_search,
        premium_guides_limit: QUOTA_LIMITS[tier].premium_guide,
      };

      const insertPayload: any = {
        user_id: userId,
        itinerari_limit: (tierQuota as any).itineraries_limit || QUOTA_LIMITS[tier].itinerary,
        audioguide_limit: (tierQuota as any).audio_guides_limit || QUOTA_LIMITS[tier].audio_guide,
        vision_limit: (tierQuota as any).photo_searches_limit || QUOTA_LIMITS[tier].photo_search,
        poi_details_limit: (tierQuota as any).poi_details_limit || QUOTA_LIMITS[tier].poi_detail,
        premium_guide_limit: (tierQuota as any).premium_guides_limit || QUOTA_LIMITS[tier].premium_guide,
        itinerari_used: featureType === 'itinerary' ? 1 : 0,
        audioguide_used: featureType === 'audio_guide' ? 1 : 0,
        poi_details_used: featureType === 'poi_detail' ? 1 : 0,
        vision_used: featureType === 'photo_search' ? 1 : 0,
        premium_guide_used: featureType === 'premium_guide' ? 1 : 0,
      };

      await supabase.from('user_quotas').upsert(insertPayload);
    }
  } catch (err) {
    console.error('Error incrementing quota:', err);
  }
};

/**
 * Alias for incrementQuota to maintain backward compatibility
 */
export const incrementUserQuota = incrementQuota;
