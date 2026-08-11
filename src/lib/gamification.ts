import { supabase } from './supabase';
import { getTranslation } from './i18n';
import { notifyCreditsChanged } from './pricing';
import { getApiUrl } from './api';

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
    // Accredito SERVER-SIDE: scrivere earned_credits/xp_points dal browser è
    // bloccato dal trigger anti-escalation su user_profiles (prima chiunque
    // poteva farsi crediti da console). Il server valida e accredita con la
    // service key. 1 credito + 20 XP per risposta corretta.
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token;
    if (!token) return;

    const res = await fetch(getApiUrl('/api/gamification/trivia-reward'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ correctAnswers }),
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    const earnedCreditsBonus = data?.credits || 0;

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
