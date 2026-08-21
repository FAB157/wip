-- ═══════════════════════════════════════════════════════════════════════════
-- PERIMETRI DEI POI (poi_footprints) — DA APPLICARE A MANO (SQL editor).
--
-- Ripresa di 20260815100000_poi_footprints_address.sql, che era stato
-- applicato SOLO A META': le colonne address/address_source su shared_pois ci
-- sono (verificato il 21/08/2026, 152.806 POI le usano gia'), la tabella
-- poi_footprints NO. Questo file rifa' tutto ed e' idempotente: le parti gia'
-- fatte non danno errore, quindi in pratica crea solo la tabella mancante.
--
-- A COSA SERVE. Oggi in shared_pois arrivano solo i valori DERIVATI dal
-- perimetro: geofence_radius, alert_radius, entrance_lat/lon. Il perimetro
-- vero — il poligono OSM dell'edificio — resta nel DuckDB locale e si perde a
-- ogni ricalcolo. Con questa tabella il database ha anche quello, e servono:
--   • trigger poligonali (dentro/fuori il perimetro), piu' precisi del cerchio
--     per palazzi a L, cinte murarie, parchi;
--   • il perimetro disegnato sulla mappa;
--   • ricalcolare gli ingressi senza rifare l'estrazione dal planet OSM
--     (che sono ore di macchina e 90 GB di scaricamento).
-- ═══════════════════════════════════════════════════════════════════════════

-- Su Supabase PostGIS vive nello schema `extensions`, non in `public`: senza
-- questa riga il tipo `geometry` non si risolve e la CREATE TABLE fallisce con
-- "type geometry does not exist". Metterli entrambi copre tutte e due le
-- installazioni possibili.
set search_path = public, extensions;

-- Lock corto: se qualcosa tiene occupata shared_pois, questa migration
-- rinuncia invece di mettersi in coda e bloccare le letture degli utenti.
set lock_timeout = '5s';

-- ── Indirizzo sul POI (gia' presenti: qui solo per completezza) ────────────
-- address: "Via Roma 12" — via e civico, senza citta' (c'e' gia' la colonna).
-- address_source: da dove viene ('osm_civico', 'dati_cultura_it', 'wikidata',
--   'imls_us', 'museofile_fr', 'registro_patrimonio', 'viator', ...). Serve
--   per l'attribuzione delle licenze e per sapere cosa ri-arricchire quando
--   arriva una fonte migliore. Regola: mai sovrascrivere una fonte migliore
--   con una peggiore.
ALTER TABLE public.shared_pois
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS address_source text;

-- ── Perimetro completo ─────────────────────────────────────────────────────
-- Tabella separata e non colonne su shared_pois: i poligoni pesano, servono a
-- pochi flussi, e la riga del POI deve restare leggera perche' ci passa sopra
-- la RPC nearby_pois a ogni movimento dell'utente.
--
-- geom:    per le query spaziali lato server (ST_Contains per i trigger
--          poligonali, ST_ClosestPoint per il punto del perimetro verso la via
--          dell'indirizzo).
-- geojson: la stessa cosa pronta per i client. La REST di Supabase serializza
--          geometry come WKB esadecimale, che nella WebView andrebbe decodificato
--          a mano: tenere il GeoJSON pronto costa spazio e risparmia codice.
-- npts:    quanti punti ha il poligono, per scartare al volo i perimetri
--          assurdi senza aprire la geometria.
CREATE TABLE IF NOT EXISTS public.poi_footprints (
  poi_id     text PRIMARY KEY REFERENCES public.shared_pois(id) ON DELETE CASCADE,
  geom       geometry(Geometry, 4326) NOT NULL,
  geojson    text NOT NULL,
  npts       integer,
  source     text NOT NULL DEFAULT 'osm',
  source_id  text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poi_footprints_geom
  ON public.poi_footprints USING GIST (geom);

-- ── RLS: lettura pubblica, scrittura solo service key ──────────────────────
-- La mappa deve poter disegnare i perimetri; gli script che li caricano
-- passano dal server o dal DuckDB locale, mai dal client. Nessuna policy di
-- INSERT/UPDATE/DELETE = bloccati per anon e authenticated (stesso schema di
-- community_content_reports).
ALTER TABLE public.poi_footprints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS poi_footprints_public_read ON public.poi_footprints;
CREATE POLICY poi_footprints_public_read ON public.poi_footprints
  FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA — incollare dopo, deve dare esattamente questo:
--
--   select count(*) from information_schema.columns
--   where table_schema='public' and table_name='shared_pois'
--     and column_name in ('address','address_source');
--   → 2
--
--   select rowsecurity from pg_tables
--   where schemaname='public' and tablename='poi_footprints';
--   → true
--
--   select count(*) from pg_policies
--   where schemaname='public' and tablename='poi_footprints';
--   → 1   (solo la SELECT pubblica: se esce 0 la tabella e' inaccessibile
--          alla mappa, se esce piu' di 1 qualcuno puo' scriverci)
--
--   select count(*) from pg_indexes
--   where tablename='poi_footprints' and indexdef ilike '%gist%';
--   → 1   (senza l'indice GIST le query spaziali fanno scansione completa)
-- ═══════════════════════════════════════════════════════════════════════════
