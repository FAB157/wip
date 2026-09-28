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
  // Porta, punto d'arrivo (marciapiede davanti alla porta, 05/09/2026) e
  // indirizzo: li legge il geofencing offline. Non indicizzati.
  entrance_lat?: number | null;
  entrance_lon?: number | null;
  arrival_lat?: number | null;
  arrival_lon?: number | null;
  arrival_method?: string | null;
  address?: string | null;
  address_source?: string | null;
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

/**
 * REGISTRO UNICO DEI DOWNLOAD (08/09/2026): una riga per ogni cosa che
 * l'utente ha scaricato — itinerario, zona mappa, audioguide, guida — con le
 * PARTI che la compongono e il loro stato. Tutti i flussi di download
 * esistenti (mappe offline, bundle audio, pacchetti nativi) scrivono qui, e
 * la schermata "I miei download" legge solo da qui. Prima erano tre posti
 * diversi senza una vista d'insieme.
 */
// 'museo' (10/09/2026): il pacchetto della visita a un museo o a una chiesa —
// percorso, audioguide di tutte le opere, foto. Si scarica la sera prima col
// wifi dell'albergo e il giorno dopo funziona senza rete.
export type DownloadTipo = 'itinerario' | 'zona' | 'audioguida' | 'guida' | 'museo';
export interface DownloadRecord {
  /** Chiave stabile: `iti:<id>`, `zona:<areaId>`, `audio:<poiId>`, `guida:<id>`. */
  id: string;
  tipo: DownloadTipo;
  nome: string;
  sottotitolo?: string;
  /** Byte stimati/misurati di tutto il pacchetto. */
  bytes: number;
  parti: {
    /** Tile della mappa per la zona del percorso/area. */
    mappa?: boolean;
    /** Celle stradali pedonali per la navigazione offline. */
    strade?: boolean;
    /** POI della zona nel mirror locale. */
    poi?: boolean;
    /** Audioguide delle tappe: quante pronte su quante previste. */
    audioguide?: { fatte: number; totali: number };
  };
  /** Dati di appoggio: bbox, id dell'itinerario/area, lingua, voce... */
  meta?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * CELLE STRADALI PEDONALI (08/09/2026): la stessa griglia 0,05° delle road
 * tiles del server (`x{gx}_y{gy}_foot.json.gz` su Supabase Storage). Sono il
 * grafo per il ricalcolo del percorso SENZA rete. `geometrie` = elenco di
 * polilinee [lat, lon][]. `cella` e' la chiave "gx_gy".
 */
export interface RoadCell {
  cella: string;
  geometrie: number[][][];
  bytes: number;
  lastUpdated: number;
}

const db = new Dexie('ItaliaInTascaDB') as Dexie & {
  pois: EntityTable<LocalPoi, 'id'>;
  visionQueue: EntityTable<VisionQueueItem, 'id'>;
  downloads: EntityTable<DownloadRecord, 'id'>;
  roadCells: EntityTable<RoadCell, 'cella'>;
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

// v3 (08/09/2026): registro unico dei download + celle stradali pedonali per
// la navigazione offline. Upgrade additivo: le store precedenti non cambiano.
db.version(3).stores({
  pois: 'id, name, lat, lon, category, is_gem, status, lastUpdated',
  visionQueue: '++id, ts',
  downloads: 'id, tipo, updatedAt',
  roadCells: 'cella, lastUpdated',
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
