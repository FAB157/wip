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

// Coda Vision offline: foto scattate senza rete, in attesa di essere
// riconosciute (CameraScreen la processa al ritorno online). Il dataUrl è la
// JPEG già compressa (lato max 1280 px): mai tenerla in stato React.
export interface VisionQueueItem {
  id: number;            // auto-increment (Dexie '++id')
  dataUrl: string;       // data URL JPEG compressa
  lat: number | null;
  lon: number | null;
  mode: string;          // 'place' | 'artwork' | 'nature'
  ts: number;            // epoch ms dello scatto (indicizzato: purge >7 giorni)
  attempts?: number;     // tentativi falliti non-rete (max 3, poi scartata)
}

const db = new Dexie('ItaliaInTascaDB') as Dexie & {
  pois: EntityTable<LocalPoi, 'id'>;
  visionQueue: EntityTable<VisionQueueItem, 'id'>;
};

// Schema declaration:
// `lastUpdated` è indicizzato: oltre a datare i record serve da chiave per
// l'EVICTION (prunePoisOlderThan) — senza potatura il mirror POI crescerebbe
// senza limite col passare delle aree visitate.
db.version(1).stores({
  pois: 'id, name, lat, lon, category, is_gem, status, lastUpdated'
});

// v2: AGGIUNGE la store visionQueue lasciando `pois` invariata (upgrade Dexie
// additivo, nessuna perdita dati). `ts` è indicizzato per purge ed elaborazione
// in ordine di scatto.
db.version(2).stores({
  pois: 'id, name, lat, lon, category, is_gem, status, lastUpdated',
  visionQueue: '++id, ts'
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
