-- =====================================================================
-- CONTATTI POI STRUTTURATI — WIP (2026-08-09)
--
-- Telefono / sito / orari NON come testo libero dentro la descrizione, ma in
-- colonne dedicate: il frontend può renderli come bottoni d'azione (chiama,
-- apri sito, vedi orari). Fonti: OpenStreetMap (tag phone/website/
-- opening_hours, gratis, già sorgente del radar) e Wikidata (P856 sito
-- ufficiale, P1329 telefono) per i monumenti gestiti.
--
-- opening_hours_json è JSONB: dentro { "raw": "Mo-Fr 09:00-18:00", "source":
-- "osm" } — la stringa OSM grezza (rendibile subito) più spazio per un parse
-- strutturato futuro senza migrazioni.
--
-- L'arricchimento è ON-DEMAND (alla prima apertura del POI) + batch opzionale,
-- MAI un scraping globale di massa (1,8M POI = saturazione DB/Overpass).
-- contact_enriched_at evita di ri-scaricare un POI già processato.
--
-- DA APPLICARE A MANO su Supabase. DDL leggero.
-- =====================================================================

set lock_timeout = '5s';

alter table public.shared_pois
  add column if not exists contact_phone text,
  add column if not exists contact_website text,
  add column if not exists opening_hours_json jsonb,
  add column if not exists contact_enriched_at timestamptz;

-- Indice parziale per il batch: trova in fretta i POI non ancora processati.
create index if not exists idx_shared_pois_contacts_todo
  on public.shared_pois (id)
  where contact_enriched_at is null;
