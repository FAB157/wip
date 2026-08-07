import { supabase } from './supabase';
import { getTranslation } from './i18n';
import { notifyCreditsChanged } from './pricing';

export interface GamificationReward {
  poiId: string | number;
  type: 'vision' | 'audio';
  xp: number;
}

/**
 * Registra una "Vision" (apertura scheda) o una Visita Fisica.
 * Assegna 5 XP se il POI non è mai stato esplorato.
 */
export async function recordPoiVision(poiId: string | number, currentUserId?: string | null): Promise<void> {
  if (!currentUserId || currentUserId === "mock-user-id" || !poiId) return;

  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      // earned_credits è indispensabile: senza, il calcolo del bonus di
      // livello partiva da 0 e l'update AZZERAVA i crediti guadagnati
      // dell'utente invece di sommarci il premio.
      .select('visited_pois, xp_points, earned_credits')
      .eq('id', currentUserId)
      .single();

    if (!profile) return;

    const visited = profile.visited_pois || [];
    if (!visited.includes(String(poiId))) {
      // Non è mai stato visitato: aggiungiamo 5 XP e salviamo nella lista
      const newVisited = [...visited, String(poiId)];
      const oldXp = profile.xp_points || 0;
      const newXp = oldXp + 5;
      
      const newLevel = Math.floor(newXp / 100);
      const oldLevel = Math.floor(oldXp / 100);
      
      let updatePayload: any = {
        visited_pois: newVisited,
        xp_points: newXp
      };

      let earnedCreditsBonus = 0;
      if (newLevel > oldLevel) {
        const targetLevel = newLevel + 1; // since 0-based XP logic maps 0->level 1
        const { data: levelData } = await supabase
          .from('gamification_levels')
          .select('reward_credits')
          .eq('level', targetLevel)
          .single();
        
        earnedCreditsBonus = levelData?.reward_credits || 30; // Fallback a 30

        const currentEarned = profile.earned_credits || 0;
        updatePayload.earned_credits = currentEarned + earnedCreditsBonus;
      }

      await supabase
        .from('user_profiles')
        .update(updatePayload)
        .eq('id', currentUserId);

      if (earnedCreditsBonus > 0) notifyCreditsChanged({ userId: currentUserId, delta: earnedCreditsBonus });

      // Mostriamo un piccolo feedback nell'app
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wip-gamification-badge', { 
          detail: { badges: [{ name: 'Luogo Esplorato!', icon: '👁️', description: '+5 XP per aver esplorato questo luogo.' }] } 
        }));
        
        if (earnedCreditsBonus > 0) {
           setTimeout(() => {
             window.dispatchEvent(new CustomEvent('wip-gamification-badge', { 
               detail: { badges: [{ name: 'Level Up!', icon: '🏆', description: `Livello ${newLevel + 1} raggiunto! +30 Crediti Vinti!` }] } 
             }));
           }, 3000);
        }
      }
    }
  } catch (e) {
    console.warn("Error recording POI vision:", e);
  }
}

/**
 * Assegna XP per aver ascoltato un'audioguida.
 * Assegna 10 XP sempre. (Oppure solo la prima volta, per ora aggiungiamo semplicemente 10 XP)
 */
export async function rewardAudioListen(currentUserId?: string | null): Promise<void> {
  if (!currentUserId || currentUserId === "mock-user-id") return;

  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('xp_points')
      .eq('id', currentUserId)
      .single();

    if (!profile) return;

    const newXp = (profile.xp_points || 0) + 10;

    await supabase
      .from('user_profiles')
      .update({ xp_points: newXp })
      .eq('id', currentUserId);

  } catch (e) {
    console.warn("Error rewarding audio listen:", e);
  }
}

/**
 * Assegna ricompense per le risposte corrette del Trivia Quiz.
 * @param currentUserId L'ID dell'utente
 * @param correctAnswers Il numero di risposte corrette indovinate
 */
export async function addTriviaRewards(currentUserId: string | null | undefined, correctAnswers: number): Promise<void> {
  if (!currentUserId || currentUserId === "mock-user-id" || correctAnswers <= 0) return;

  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('xp_points, earned_credits')
      .eq('id', currentUserId)
      .single();

    if (!profile) return;

    const oldXp = profile.xp_points || 0;
    const newXp = oldXp + (correctAnswers * 20); // 20 XP per risposta
    
    const newLevel = Math.floor(newXp / 100);
    const oldLevel = Math.floor(oldXp / 100);
    
    let earnedCreditsBonus = correctAnswers; // 1 Credito per risposta

    if (newLevel > oldLevel) {
      const targetLevel = newLevel + 1;
      const { data: levelData } = await supabase
        .from('gamification_levels')
        .select('reward_credits')
        .eq('level', targetLevel)
        .single();
      
      const levelUpBonus = levelData?.reward_credits || 30;
      earnedCreditsBonus += levelUpBonus; // Bonus per leveling up
    }

    const currentEarned = profile.earned_credits || 0;

    await supabase
      .from('user_profiles')
      .update({
        xp_points: newXp,
        earned_credits: currentEarned + earnedCreditsBonus
      })
      .eq('id', currentUserId);

    if (earnedCreditsBonus > 0) notifyCreditsChanged({ userId: currentUserId, delta: earnedCreditsBonus });

    // Feedback visuale per l'utente
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wip-gamification-badge', { 
        detail: { badges: [{ 
          name: 'Quiz Master!', 
          icon: '🧠', 
          description: `+${correctAnswers * 20} XP e +${correctAnswers} Crediti vinti!` 
        }] } 
      }));
      
      if (newLevel > oldLevel) {
         setTimeout(() => {
           window.dispatchEvent(new CustomEvent('wip-gamification-badge', { 
             detail: { badges: [{ name: 'Level Up!', icon: '🏆', description: `Livello ${newLevel + 1} raggiunto! +30 Crediti Vinti!` }] } 
           }));
         }, 3000);
      }
    }
  } catch (e) {
    console.warn("Error recording trivia rewards:", e);
  }
}
