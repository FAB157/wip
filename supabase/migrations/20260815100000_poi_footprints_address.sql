-- ═══════════════════════════════════════════════════════════════════════════
-- PERIMETRI + INDIRIZZI POI — DA APPLICARE A MANO (Supabase SQL editor).
--
-- Completa il modello dati del progetto footprint/ingressi (vedi memoria
-- geofencing-footprint-entrate + cataloghi-patrimonio-indirizzi-poi):
-- finora in shared_pois arrivavano solo i valori DERIVATI (geofence_radius,
-- alert_radius, entrance_lat/lon); il perimetro vero (poligono OSM) restava
-- solo nel DuckDB locale. Con questa migration il DB ha TUTTO:
--   raggi + ingresso (già in shared_pois)
--   + indirizzo con fonte/attribuzione (nuove colonne shared_pois)
--   + perimetro completo (nuova tabella poi_footprints, PostGIS + GeoJSON)
-- Usi: trigger poligonali futuri (dentro/fuori il perimetro, più precisi del
-- cerchio per palazzi a L, mura, parchi), evidenziazione footprint su mappa,
-- ricalcolo ingressi senza rifare l'estrazione dal planet.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- ── Indirizzo sul POI ──────────────────────────────────────────────────────
-- address: "Via Roma 12" (via + civico, senza città: c'è già la colonna city).
-- address_source: da dove viene ('osm', 'mic_catalogo', 'wikidata', 'merimee',
--   'nrhp', 'geoapify', 'photon', ...) — serve per attribuzione licenze e per
--   sapere quali record ri-arricchire quando una fonte migliore diventa
--   disponibile. Mai sovrascrivere una fonte migliore con una peggiore.
ALTER TABLE public.shared_pois
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS address_source text;

-- ── Perimetro completo ─────────────────────────────────────────────────────
-- Tabella separata (non colonne su shared_pois): i poligoni pesano, servono a
-- pochi flussi, e la riga POI resta leggera per la RPC nearby.
-- geom: per le query spaziali server-side (ST_Contains per trigger poligonali,
--   ST_ClosestPoint per il punto del perimetro verso una strada).
-- geojson: rappresentazione pronta per i client (la REST di Supabase
--   serializza geometry come WKB esadecimale, scomodo per la WebView).
-- source + source_id: provenienza (osm way/relation id, scheda catalogo...).
CREATE TABLE IF NOT EXISTS public.poi_footprints (
  poi_id text PRIMARY KEY REFERENCES public.shared_pois(id) ON DELETE CASCADE,
  geom geometry(Geometry, 4326) NOT NULL,
  geojson text NOT NULL,
  npts integer,
  source text NOT NULL DEFAULT 'osm',
  source_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poi_footprints_geom
  ON public.poi_footprints USING GIST (geom);

-- RLS: lettura pubblica (la mappa può disegnare i perimetri), scrittura SOLO
-- service key (gli apply-script passano dal server/DuckDB, mai dal client).
ALTER TABLE public.poi_footprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS poi_footprints_public_read ON public.poi_footprints;
CREATE POLICY poi_footprints_public_read ON public.poi_footprints
  FOR SELECT USING (true);
-- Nessuna policy INSERT/UPDATE/DELETE: bloccate per i client, passa solo la
-- service key (stesso pattern di community_content_reports).

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE:
--   select column_name from information_schema.columns
--   where table_name='shared_pois' and column_name in ('address','address_source');
--   → 2 righe
--   select tablename, rowsecurity from pg_tables where tablename='poi_footprints';
--   → rowsecurity = true
--   select count(*) from pg_policies where tablename='poi_footprints';
--   → 1 (solo la SELECT pubblica)
-- ═══════════════════════════════════════════════════════════════════════════
