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
db.version(1).stores({
  pois: 'id, name, lat, lon, category, is_gem, status, lastUpdated' 
});

export { db };
