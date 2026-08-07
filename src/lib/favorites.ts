import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export const FAVORITES_EVENT = 'wip-favorites-updated';

const PENDING_FAV_SYNC_KEY = 'wip_pending_fav_sync';

type PendingFavOp = { poiId: string; poi: any; add: boolean; ts: number };

// Scrive (o cancella) il preferito su Supabase. Lancia se l'utente è loggato
// ma la chiamata fallisce, così il chiamante può accodare il retry.
const syncFavoriteRemote = async (poiId: string, poi: any, add: boolean): Promise<void> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id;
  // startsWith: il mock client assegna anche id "mock-user-<timestamp>" e il
  // suo query builder non supporta la catena delete().eq().eq().
  if (!userId || String(userId).startsWith('mock-user')) return;

  if (add) {
    // Niente upsert: le policy RLS di saved_pois coprono solo SELECT/INSERT/
    // DELETE (manca UPDATE), quindi l'ON CONFLICT DO UPDATE veniva rifiutato
    // con 42501 e l'operazione restava in coda per sempre. Delete+insert usa
    // solo policy esistenti ed evita anche i duplicati senza vincolo unique.
    await supabase.from('saved_pois').delete()
      .eq('user_id', userId)
      .eq('poi_id', poiId);
    const { error } = await supabase.from('saved_pois').insert({
      user_id: userId,
      poi_id: poiId,
      data: poi,
      created_at: new Date().toISOString()
    });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase.from('saved_pois').delete()
      .eq('user_id', userId)
      .eq('poi_id', poiId);
    if (error) throw error;
  }
};

const readPendingFavQueue = (): PendingFavOp[] => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_FAV_SYNC_KEY) || '[]');
  } catch {
    return [];
  }
};

// Accoda un'operazione fallita. Una sola voce per POI: l'ultima vince
// (un add seguito da un remove non deve lasciare il POI su Supabase).
const queuePendingFavSync = (poiId: string, poi: any, add: boolean) => {
  const queue = readPendingFavQueue().filter(op => op.poiId !== poiId);
  queue.push({ poiId, poi, add, ts: Date.now() });
  localStorage.setItem(PENDING_FAV_SYNC_KEY, JSON.stringify(queue));
};

// Riprova le sync in coda; le operazioni ancora fallite restano accodate.
// Il flag impedisce flush concorrenti (load modulo + evento online + login):
// due flush in parallelo eseguivano due volte le stesse op (duplicati sul
// cloud) e l'ultima a terminare sovrascriveva la coda perdendo le operazioni
// accodate nel frattempo.
let isFlushingFavQueue = false;
export const flushPendingFavSync = async () => {
  if (isFlushingFavQueue) return;
  const queue = readPendingFavQueue();
  if (queue.length === 0) return;
  // Senza sessione syncFavoriteRemote esce subito "con successo" e la coda
  // veniva svuotata PRIMA del ripristino della sessione al riavvio: le
  // operazioni accumulate offline andavano perse. Con sessione assente la
  // coda resta intatta.
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData?.session?.user?.id;
  if (!uid || String(uid).startsWith('mock-user')) return;
  isFlushingFavQueue = true;
  try {
    const stillPending: PendingFavOp[] = [];
    for (const op of queue) {
      try {
        await syncFavoriteRemote(op.poiId, op.poi, op.add);
      } catch {
        stillPending.push(op);
      }
    }
    // Non sovrascrivere le op accodate DURANTE la flush: si riscrivono le
    // fallite dello snapshot + tutte quelle nuove (l'ultima per POI vince).
    const snapshotKeys = new Set(queue.map(op => `${op.poiId}:${op.ts}`));
    const addedMeanwhile = readPendingFavQueue().filter(op => !snapshotKeys.has(`${op.poiId}:${op.ts}`));
    const merged = [
      ...stillPending.filter(op => !addedMeanwhile.some(a => a.poiId === op.poiId)),
      ...addedMeanwhile
    ];
    localStorage.setItem(PENDING_FAV_SYNC_KEY, JSON.stringify(merged));
  } finally {
    isFlushingFavQueue = false;
  }
};

// Svuota la coda quando torna la rete (e al primo load del modulo).
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { flushPendingFavSync(); });
  flushPendingFavSync();
}

// Ottieni i preferiti dal localStorage in modo sincrono
export const getLocalFavorites = (): any[] => {
  try {
    return JSON.parse(localStorage.getItem('mock_db_saved_pois') || '[]');
  } catch {
    return [];
  }
};

// Salva i preferiti localmente e notifica l'app
export const setLocalFavorites = (favs: any[]) => {
  localStorage.setItem('mock_db_saved_pois', JSON.stringify(favs));
  window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
};

// Toggle condiviso da cuore (popup mappa), stella (PoiDetailSheet via App) e
// salvataggio eventi: PRIMA ognuno scriveva in uno store diverso (solo stato
// React, solo Supabase, solo localStorage) e le liste non si vedevano a vicenda.
export const toggleFavoritePoi = async (poi: any): Promise<boolean> => {
  const currentFavs = getLocalFavorites();
  const poiIdString = String(poi.id);
  const existingIdx = currentFavs.findIndex((f: any) => String(f.poi_id || f.id) === poiIdString);

  let newFavs;
  let isNowFavorite = false;

  if (existingIdx >= 0) {
    // Rimuovi dai preferiti
    newFavs = currentFavs.filter((_: any, idx: number) => idx !== existingIdx);
    isNowFavorite = false;
  } else {
    // Aggiungi ai preferiti
    const newFav = {
      id: poi.id,
      poi_id: poiIdString,
      data: poi,
      created_at: new Date().toISOString()
    };
    newFavs = [...currentFavs, newFav];
    isNowFavorite = true;
  }

  // 1. Aggiornamento UI Immediato e Notifica Globale
  setLocalFavorites(newFavs);

  // 2. Sincronizzazione Background con Supabase (offline-first: se fallisce
  // la mettiamo in coda e riproviamo quando torna la rete)
  try {
    await syncFavoriteRemote(poiIdString, poi, isNowFavorite);
    // Ri-notifica a scrittura remota COMMITTATA: i listener che rifanno la
    // select sul cloud (Diario, PlanScreen) al primo evento possono leggere
    // lo stato precedente (select servita prima del commit) — questo secondo
    // evento li riallinea.
    window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
  } catch (err) {
    console.error('Favorites sync error, accodo per retry:', err);
    queuePendingFavSync(poiIdString, poi, isNowFavorite);
  }

  return isNowFavorite;
};

// Rimozione esplicita (usata dal cestino de "Le Mie Scoperte"): aggiorna il
// localStorage, notifica l'app e cancella dal cloud.
export const removeFavoritePoi = async (poiId: string | number): Promise<void> => {
  const idStr = String(poiId);
  const newFavs = getLocalFavorites().filter((f: any) => String(f.poi_id || f.id) !== idStr);
  setLocalFavorites(newFavs);
  try {
    await syncFavoriteRemote(idStr, null, false);
    // Vedi toggleFavoritePoi: riallinea i listener che leggono il cloud dopo
    // che la delete è stata committata (altrimenti la card "riappariva").
    window.dispatchEvent(new CustomEvent(FAVORITES_EVENT));
  } catch (err) {
    console.error('Favorites remove sync error, accodo per retry:', err);
    queuePendingFavSync(idStr, null, false);
  }
};

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<any[]>(getLocalFavorites());

  useEffect(() => {
    const handleUpdate = () => {
      setFavorites(getLocalFavorites());
    };
    // Ascolta l'evento globale per l'aggiornamento
    window.addEventListener(FAVORITES_EVENT, handleUpdate);
    return () => window.removeEventListener(FAVORITES_EVENT, handleUpdate);
  }, []);

  const isFavorite = (poiId: string) => {
    return favorites.some(f => String(f.poi_id || f.id) === String(poiId));
  };

  return { favorites, toggleFavorite: toggleFavoritePoi, isFavorite };
};
