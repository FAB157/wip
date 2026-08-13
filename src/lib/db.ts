import Dexie, { type EntityTable } from 'dexie';

export interface LocalPoi {
  id: string;
  name: string;
  lat: number;
  lon: number;
  category: string;
  subCategory?: string;
  is_gem?: boolean;
  description?: string;
  description_short?: string;
  description_long?: string;
  // Campi extra per l'esperienza offline completa (non indicizzati:
  // Dexie li salva comunque senza bisogno di version bump)
  description_ai?: string;
  audio_script?: string;
  teaser_text_it?: string;
  practical_info?: string;
  image_url?: string;
  photo_url?: string;
  status?: string;
  lastUpdated: number;
}

const db = new Dexie('ItaliaInTascaDB') as Dexie & {
  pois: EntityTable<LocalPoi, 'id'>;
};

// Schema declaration:
// `lastUpdated` è indicizzato: oltre a datare i record serve da chiave per
// l'EVICTION (prunePoisOlderThan) — senza potatura il mirror POI crescerebbe
// senza limite col passare delle aree visitate.
db.version(1).stores({
  pois: 'id, name, lat, lon, category, is_gem, status, lastUpdated'
});

/**
 * Eviction: rimuove dal mirror i POI non aggiornati da oltre `maxAgeMs`
 * (usa l'indice lastUpdated). Le aree scaricate vengono ri-mirrorate dalla
 * sync periodica, quindi restano fresche finché l'utente va online ogni tanto.
 * Ritorna il numero di record rimossi. Best-effort: mai lancia.
 */
export async function prunePoisOlderThan(maxAgeMs: number): Promise<number> {
  try {
    const cutoff = Date.now() - maxAgeMs;
    const stale = await db.pois.where('lastUpdated').below(cutoff).primaryKeys();
    if (stale.length) await db.pois.bulkDelete(stale as string[]);
    return stale.length;
  } catch {
    return 0;
  }
}

export { db };
