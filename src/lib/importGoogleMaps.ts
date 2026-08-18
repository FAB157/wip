/**
 * Importa da Google Maps: parser per il CSV di Google Takeout "Luoghi
 * salvati" (colonne tipo Title,Note,URL) e per file GeoJSON, più il motore
 * di matching contro i POI WIP. Per ogni voce con coordinate si cercano i
 * POI entro ~150 m (poiRepository.getNearbyPois) e si confronta il nome
 * (case-insensitive "contains"); i match diventano preferiti tramite
 * lib/favorites.ts (MAI upsert diretto su saved_pois: RLS senza UPDATE).
 */

import { getNearbyPois } from '../services/poiRepository';
import { getLocalFavorites, toggleFavoritePoi } from './favorites';
import { db } from './db';

/** Limite duro per import: protegge Supabase (200 × nearby RPC) e la UI. */
export const MAX_IMPORT_ENTRIES = 200;

export interface ImportedPlace {
  name: string;
  note?: string;
  url?: string;
  lat?: number;
  lon?: number;
}

export interface ImportReport {
  /** Nomi aggiunti ai preferiti in questo import. */
  imported: string[];
  /** Nomi già presenti tra i preferiti (saltati). */
  already: string[];
  /** Voci senza match nel DB WIP (o senza coordinate). */
  notFound: string[];
  /** Voci oltre il limite MAX_IMPORT_ENTRIES, ignorate. */
  skipped: number;
}

const isValidCoord = (lat: number, lon: number): boolean =>
  Number.isFinite(lat) && Number.isFinite(lon) &&
  Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
  !(lat === 0 && lon === 0);

/**
 * Estrae le coordinate da un URL di Google Maps. Pattern supportati:
 * "@lat,lon" (viewport), "!3dLAT!4dLON" (pin del place) e "q=lat,lon"
 * (query diretta, anche URL-encoded). Il pin !3d!4d ha priorità: è il
 * luogo vero, la "@" è solo il centro mappa.
 */
export function extractCoordsFromMapsUrl(url: string): { lat: number; lon: number } | null {
  if (!url) return null;
  let s = String(url);
  try { s = decodeURIComponent(s); } catch { /* già decodificato o malformato */ }

  const pin = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) {
    const lat = parseFloat(pin[1]); const lon = parseFloat(pin[2]);
    if (isValidCoord(lat, lon)) return { lat, lon };
  }
  const at = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) {
    const lat = parseFloat(at[1]); const lon = parseFloat(at[2]);
    if (isValidCoord(lat, lon)) return { lat, lon };
  }
  const q = s.match(/[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (q) {
    const lat = parseFloat(q[1]); const lon = parseFloat(q[2]);
    if (isValidCoord(lat, lon)) return { lat, lon };
  }
  return null;
}

/** Split di una riga CSV rispettando i campi tra virgolette (RFC 4180 base). */
const splitCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
};

/**
 * CSV di Google Takeout "Luoghi salvati": header con almeno Title (o Titolo)
 * e di solito Note + URL. Le coordinate, quando ci sono, stanno dentro l'URL.
 */
export function parseGoogleTakeoutCsv(text: string): ImportedPlace[] {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const idxTitle = header.findIndex(h => h === 'title' || h === 'titolo' || h === 'name' || h === 'nome');
  const idxNote = header.findIndex(h => h === 'note' || h === 'nota' || h === 'comment');
  const idxUrl = header.findIndex(h => h === 'url' || h === 'link');
  if (idxTitle < 0) return [];

  const places: ImportedPlace[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const name = (cols[idxTitle] || '').trim();
    if (!name) continue;
    const url = idxUrl >= 0 ? (cols[idxUrl] || '').trim() : undefined;
    const coords = url ? extractCoordsFromMapsUrl(url) : null;
    places.push({
      name,
      note: idxNote >= 0 ? (cols[idxNote] || '').trim() || undefined : undefined,
      url,
      lat: coords?.lat,
      lon: coords?.lon,
    });
  }
  return places;
}

/**
 * GeoJSON (FeatureCollection o singola Feature con geometry Point).
 * Il nome si cerca in properties (name/Title/location.name — formato
 * Takeout "Saved Places.json").
 */
export function parseGeoJson(text: string): ImportedPlace[] {
  let root: any;
  try { root = JSON.parse(text); } catch { return []; }
  const features: any[] = Array.isArray(root?.features)
    ? root.features
    : (root?.type === 'Feature' ? [root] : []);

  const places: ImportedPlace[] = [];
  for (const f of features) {
    const props = f?.properties || {};
    const name = String(
      props.name || props.Name || props.title || props.Title ||
      props.location?.name || props.Location?.name || ''
    ).trim();
    let lat: number | undefined;
    let lon: number | undefined;
    if (f?.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates)) {
      // GeoJSON: [lon, lat]
      const gLon = Number(f.geometry.coordinates[0]);
      const gLat = Number(f.geometry.coordinates[1]);
      if (isValidCoord(gLat, gLon)) { lat = gLat; lon = gLon; }
    }
    if (lat === undefined) {
      const url = props.google_maps_url || props.url || props.URL || props.link;
      const coords = url ? extractCoordsFromMapsUrl(String(url)) : null;
      if (coords) { lat = coords.lat; lon = coords.lon; }
    }
    if (!name && lat === undefined) continue;
    places.push({
      name: name || 'Luogo senza nome',
      url: props.google_maps_url || props.url,
      lat,
      lon,
    });
  }
  return places;
}

/** Sceglie il parser dal nome file / contenuto. */
export function parseImportFile(fileName: string, text: string): ImportedPlace[] {
  const lower = String(fileName || '').toLowerCase();
  const trimmed = String(text || '').trim();
  if (lower.endsWith('.json') || lower.endsWith('.geojson') || trimmed.startsWith('{')) {
    return parseGeoJson(text);
  }
  return parseGoogleTakeoutCsv(text);
}

const norm = (s: string) => String(s || '').toLowerCase().trim();

/** Match nome case-insensitive "contains" nei due sensi (min 4 caratteri). */
const nameMatches = (a: string, b: string): boolean => {
  const na = norm(a); const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
};

const isAlreadyFavorite = (poiId: string | number): boolean =>
  getLocalFavorites().some((f: any) => String(f.poi_id || f.id) === String(poiId));

/**
 * Match "banale" per le voci SENZA coordinate: nome esattamente uguale
 * (case-insensitive) a UN SOLO POI della cache locale Dexie. Niente ricerca
 * full-text sul DB remoto: il repository non la espone e un contains remoto
 * produrrebbe falsi positivi.
 */
async function trivialNameMatch(name: string): Promise<any | null> {
  try {
    const target = norm(name);
    if (target.length < 4) return null;
    const all = await db.pois.toArray();
    const exact = all.filter(p => norm(p.name) === target);
    return exact.length === 1 ? exact[0] : null;
  } catch {
    return null;
  }
}

/**
 * Importa le voci come preferiti WIP. Sequenziale (niente raffiche sulla RPC
 * nearby): onProgress(fatte, totali) per la barra di avanzamento.
 */
export async function importPlacesAsFavorites(
  places: ImportedPlace[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportReport> {
  const limited = places.slice(0, MAX_IMPORT_ENTRIES);
  const report: ImportReport = {
    imported: [],
    already: [],
    notFound: [],
    skipped: Math.max(0, places.length - limited.length),
  };

  let done = 0;
  for (const place of limited) {
    try {
      let match: any = null;
      if (place.lat !== undefined && place.lon !== undefined && isValidCoord(place.lat, place.lon)) {
        // ~150 m attorno alla voce importata, poi confronto nome
        const nearby = await getNearbyPois(place.lat, place.lon, 150);
        match = (nearby || []).find(p => nameMatches(place.name, (p as any).name)) || null;
        // Nome non combacia ma c'è UN SOLO POI a tiro: coordinate del pin
        // Google = coordinate del POI, lo consideriamo lo stesso luogo.
        if (!match && (nearby || []).length === 1) match = nearby[0];
      } else {
        match = await trivialNameMatch(place.name);
      }

      if (!match) {
        report.notFound.push(place.name);
      } else if (isAlreadyFavorite(match.id)) {
        report.already.push(place.name);
      } else {
        // toggleFavoritePoi = add (appena verificato che NON è preferito);
        // scrive localStorage + sync Supabase via delete+insert (RLS-safe).
        await toggleFavoritePoi(match);
        report.imported.push(place.name);
      }
    } catch (e) {
      console.warn('[importGoogleMaps] Voce fallita:', place.name, e);
      report.notFound.push(place.name);
    } finally {
      done++;
      try { onProgress?.(done, limited.length); } catch { /* UI smontata */ }
    }
  }
  return report;
}
