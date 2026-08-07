import { supabase } from './supabase';

export interface ListeningHistoryEntry {
  id?: string;
  poi_id: string;
  poi_name: string;
  category: string;
  image_url: string | null;
  listened_at: string;
}

export const LISTENING_HISTORY_EVENT = 'wip-listening-history-updated';

/**
 * Registra un nuovo ascolto (sia online che offline)
 */
export async function recordListening(poi: any, currentUserId?: string | null) {
  if (!poi || !poi.id) return;

  const entry: ListeningHistoryEntry = {
    poi_id: String(poi.id),
    poi_name: poi.name || "Luogo d'interesse",
    category: poi.category || "Altro",
    image_url: poi.image_url || poi.photo_url || null,
    listened_at: new Date().toISOString()
  };

  // 1. Salva in LocalStorage (Offline / Pre-Login fallback)
  try {
    const localData = JSON.parse(localStorage.getItem('mock_db_listening_history') || '[]');
    // Evitiamo duplicati troppo ravvicinati (stesso POI ascoltato nelle ultime 24 ore)
    const existingIdx = localData.findIndex((e: any) => e.poi_id === entry.poi_id);
    if (existingIdx >= 0) {
       localData.splice(existingIdx, 1);
    }
    localData.unshift(entry);
    // Teniamo al massimo gli ultimi 100 ascolti in locale
    if (localData.length > 100) localData.length = 100;
    localStorage.setItem('mock_db_listening_history', JSON.stringify(localData));
  } catch (e) {
    console.warn("Failed to save listening history locally", e);
  }

  // 2. Salva in Supabase se l'utente è loggato
  if (currentUserId && currentUserId !== "mock-user-id") {
    try {
      // In Supabase facciamo semplicemente un insert (la storia può avere più righe per lo stesso utente/poi ma il frontend raggrupperà)
      // O usiamo un upsert se vogliamo solo l'ultima data
      
      // Cerchiamo prima se c'è un record
      const { data: existing } = await supabase
          .from('user_listening_history')
          .select('id')
          .eq('user_id', currentUserId)
          .eq('poi_id', entry.poi_id)
          .single();

      if (existing) {
        await supabase
          .from('user_listening_history')
          .update({
            listened_at: entry.listened_at,
            poi_name: entry.poi_name,
            image_url: entry.image_url
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('user_listening_history')
          .insert({
            user_id: currentUserId,
            poi_id: entry.poi_id,
            poi_name: entry.poi_name,
            category: entry.category,
            image_url: entry.image_url,
            listened_at: entry.listened_at
          });
          
        // GAMIFICATION: Nuova audioguida ascoltata, assegna 10 XP
        import('./gamification').then(({ rewardAudioListen }) => {
          rewardAudioListen(currentUserId);
        });
      }
    } catch (e) {
      console.warn("Failed to sync listening history to Supabase", e);
    }
  }

  // Emetti evento per aggiornare l'interfaccia (spostato alla fine)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LISTENING_HISTORY_EVENT));
  }
}

/**
 * Recupera la cronologia combinata (Supabase + LocalStorage)
 */
export async function getListeningHistory(currentUserId?: string | null): Promise<ListeningHistoryEntry[]> {
  let combinedMap = new Map<string, ListeningHistoryEntry>();

  // 1. Carica da localStorage
  try {
    const localData = JSON.parse(localStorage.getItem('mock_db_listening_history') || '[]');
    localData.forEach((item: ListeningHistoryEntry) => {
      combinedMap.set(item.poi_id, item);
    });
  } catch (e) { }

  // 2. Carica da Supabase se loggato
  if (currentUserId && currentUserId !== "mock-user-id") {
    try {
      const { data, error } = await supabase
        .from('user_listening_history')
        .select('*')
        .eq('user_id', currentUserId)
        .order('listened_at', { ascending: false });

      if (!error && data) {
        data.forEach(item => {
          // Sovrascrive la versione locale perché il cloud è la single source of truth se online
          combinedMap.set(item.poi_id, {
            id: item.id,
            poi_id: item.poi_id,
            poi_name: item.poi_name,
            category: item.category,
            image_url: item.image_url,
            listened_at: item.listened_at
          });
        });
      }
    } catch (e) {
      console.warn("Failed to fetch listening history from Supabase", e);
    }
  }

  // Ordina in modo decrescente (dal più recente al più vecchio)
  return Array.from(combinedMap.values()).sort((a, b) => 
    new Date(b.listened_at).getTime() - new Date(a.listened_at).getTime()
  );
}

/**
 * Elimina una voce dalla cronologia di ascolto (sia online che offline)
 */
export async function deleteListeningHistory(poi_id: string, currentUserId?: string | null) {
  // 1. Delete from LocalStorage
  try {
    const localData = JSON.parse(localStorage.getItem('mock_db_listening_history') || '[]');
    const updatedData = localData.filter((e: any) => e.poi_id !== poi_id);
    localStorage.setItem('mock_db_listening_history', JSON.stringify(updatedData));
  } catch (e) {
    console.warn("Failed to delete listening history locally", e);
  }

  // 2. Delete from Supabase if logged in
  if (currentUserId && currentUserId !== "mock-user-id") {
    try {
      await supabase
        .from('user_listening_history')
        .delete()
        .eq('user_id', currentUserId)
        .eq('poi_id', poi_id);
    } catch (e) {
      console.warn("Failed to delete listening history from Supabase", e);
    }
  }

  // Emetti evento per aggiornare l'interfaccia
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LISTENING_HISTORY_EVENT));
  }
}
