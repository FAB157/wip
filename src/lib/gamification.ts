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
      .select('visited_pois, xp_points')
      .eq('id', currentUserId)
      .single();

    if (!profile) return;

    const visited = profile.visited_pois || [];
    if (!visited.includes(String(poiId))) {
      // Non è mai stato visitato: aggiungiamo 5 XP e salviamo nella lista.
      const newVisited = [...visited, String(poiId)];
      const newXp = (profile.xp_points || 0) + 5;

      await supabase
        .from('user_profiles')
        .update({ visited_pois: newVisited, xp_points: newXp })
        .eq('id', currentUserId);

      // Il premio di livello NON viene più accreditato "al volo" qui: l'unico
      // accredito è il riscatto esplicito dal popup Missioni
      // (/api/gamification/claim, dedup su user_rewards_claimed). Così si evita
      // il doppio accredito. I livelli si calcolano solo sul modello dinamico
      // (gamification_levels.xp_required), non più con la soglia fissa xp/100.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wip-gamification-badge', {
          detail: { badges: [{ name: 'Luogo Esplorato!', icon: '👁️', description: '+5 XP per aver esplorato questo luogo.' }] }
        }));
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

    const newXp = (profile.xp_points || 0) + (correctAnswers * 20); // 20 XP per risposta

    // Ricompensa immediata del quiz: 1 credito per risposta corretta. Il bonus
    // di livello NON viene sommato qui: evita il doppio accredito con il
    // riscatto esplicito dei livelli (popup Missioni → user_rewards_claimed).
    // I livelli usano solo il modello dinamico (gamification_levels.xp_required).
    const earnedCreditsBonus = correctAnswers;
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
    }
  } catch (e) {
    console.warn("Error recording trivia rewards:", e);
  }
}
