import {
  findExistingOsmIds,
  insertAutoPois,
  saveIndexedArea,
  type AutoPoiInput,
} from './poiRepository';
import type { PoiCategory } from '../types/poi';

interface DiscoveryResult {
  found: number;
  accepted: number;
  inserted: number;
  freshPois?: AutoPoiInput[];
}

/**
 * Mappa le categorie Foursquare in quelle interne di ItaInta.
 */
function mapFsqCategory(fsqCategories: any[]): PoiCategory | null {
  for (const cat of fsqCategories) {
    const id = String(cat.id);
    
    // Locali e Cucine Specifiche
    if (id === "13064") return "pizzeria" as PoiCategory;
    if (id === "13236") return "pesce" as PoiCategory;
    if (id === "13068" || id === "13002") return "carne" as PoiCategory; // Steakhouse / BBQ
    if (id === "13377" || id === "13306") return "vegetariano" as PoiCategory;
    if (id === "13263" || id === "13148") return "sushi" as PoiCategory; // Sushi / Japanese
    if (id === "13046") return "gelateria" as PoiCategory;
    if (id === "13003" || id === "13006" || id === "13022" || id === "13032") return "bar" as PoiCategory; // Bar, Coffee Shop, Sports Bar, Cafe
    if (id.startsWith("13")) return "restaurant" as PoiCategory; // Fallback generico per Dining and Drinking

    // Altre Categorie
    if (id === "10027") return "museum"; // Museum
    if (id.startsWith("10")) return "attraction"; // Arts and Entertainment
    if (id.startsWith("16")) return "monument"; // Landmarks and Outdoors
  }
  return null;
}

export async function runFoursquareDiscovery(
  lat: number,
  lon: number,
  radius = 500,
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = { found: 0, accepted: 0, inserted: 0 };

  let places: any[] = [];
  try {
    const res = await fetch('/api/foursquare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon, radius }),
    });
    if (res.ok) {
      const json = await res.json();
      places = json.results || [];
    } else {
      console.warn('[foursquareDiscovery] API Error:', await res.text());
    }
  } catch (e) {
    console.warn('[foursquareDiscovery] fetch fallita', e);
    return result;
  }

  result.found = places.length;

  const candidates = new Map<string, AutoPoiInput>();
  for (const p of places) {
    const category = mapFsqCategory(p.categories || []);
    if (!category) continue;
    
    const name = p.name;
    if (!name || name.trim().length < 2) continue;

    const coordLat = p.geocodes?.main?.latitude;
    const coordLon = p.geocodes?.main?.longitude;
    if (coordLat == null || coordLon == null) continue;

    // Use fsq_id come osm_id per evitare duplicati. Aggiungiamo il prefisso fsq_ per sicurezza.
    const fsq_id = "fsq_" + p.fsq_id;
    if (candidates.has(fsq_id)) continue;
    candidates.set(fsq_id, {
      osm_id: fsq_id,
      name,
      lat: coordLat,
      lon: coordLon,
      category,
    });
  }
  result.accepted = candidates.size;

  const existing = await findExistingOsmIds([...candidates.keys()]);
  const fresh: AutoPoiInput[] = [];
  for (const [osmId, poi] of candidates) {
    if (!existing.has(osmId)) fresh.push(poi);
  }

  if (fresh.length > 0) {
    result.inserted = await insertAutoPois(fresh);
    result.freshPois = fresh;
  }

  // Registra l'area come indicizzata
  await saveIndexedArea(lat, lon, radius, result.inserted);

  return result;
}
