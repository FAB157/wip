-- =====================================================================
-- GEOMETRIE DEI PERCORSI — la linea, non solo il punto di partenza
-- =====================================================================
--
-- Fino a oggi in shared_pois di un cammino c'era UN punto: all'import da
-- QLever si prendeva la prima coppia di coordinate col trucco del SUBSTR
-- perche' trasferire le geometrie sembrava proibitivo. Misurato il
-- 21/08/2026: una relazione costa 0,3 s, non 3. Quindi si importano.
--
-- PERCHE' UNA TABELLA A PARTE e non una colonna su shared_pois:
--  1. shared_pois ha il trigger protect_poi_review_columns, che ha gia'
--     bloccato scritture del service role: meglio non passarci per un
--     dato che di revisione non ha bisogno;
--  2. la RPC nearby_pois ha colonne fisse e non tornerebbe mai la nuova
--     colonna (lezione gia' pagata con technical_data);
--  3. la geometria si legge solo quando si disegna la mappa, non a ogni
--     lettura di POI: tenerla fuori vuol dire righe POI che restano
--     leggere.
--
-- PERCHE' UNA POLYLINE CODIFICATA e non GeoJSON in jsonb: 30.000 percorsi
-- semplificati a ~100 punti fanno 15 MB codificati contro ~60 MB in JSON.
-- Su un DB che ha gia' avuto un incidente da Disk IO (18/08) la differenza
-- non e' accademica. Il decoder lato client e' src/lib/polyline.ts, venti
-- righe, formato Google precision 5 — lo stesso che parla OSRM.
--
-- LICENZE: ogni riga porta la sua. Le tracce OSM e CAI sono ODbL e vanno
-- attribuite; quelle calcolate con OSRM sono derivate da OSM lo stesso.
-- La colonna `attribution` e' quello che la mappa deve scrivere sotto.
-- =====================================================================

create table if not exists public.route_geometries (
  -- Stesso id del POI in shared_pois: la geometria e' del percorso, non
  -- un oggetto suo. Niente foreign key: shared_pois viene ripulita da
  -- script che non devono fallire per colpa di questa tabella.
  poi_id text primary key,

  -- 'cai' | 'osm' | 'gusto' | 'pdipr' — da dove viene la linea.
  kind text not null,

  -- Come e' stata ottenuta: 'reale' = traccia originale della fonte;
  -- 'car' | 'bike' | 'foot' = calcolata col routing su quel grafo;
  -- 'dritta' = collegamento in linea d'aria (treno, barca) che il client
  -- DEVE disegnare tratteggiato grigio e mai spacciare per percorso.
  profile text not null default 'reale',

  -- Polyline codificata (Google, precisione 5), come la manda OSRM.
  line text not null,
  points integer not null,
  length_km numeric,

  -- Riquadro: il client filtra per questi come fa per i POI, su indice.
  min_lat double precision not null,
  min_lon double precision not null,
  max_lat double precision not null,
  max_lon double precision not null,

  source text not null,
  attribution text,
  updated_at timestamptz not null default now()
);

-- Filtro per riquadro: stessa strada dei POI (gte/lte su colonne indicizzate).
create index if not exists route_geometries_bbox_idx
  on public.route_geometries (min_lat, max_lat, min_lon, max_lon);
create index if not exists route_geometries_kind_idx
  on public.route_geometries (kind);

alter table public.route_geometries enable row level security;

-- Lettura pubblica: e' cartografia, sta gia' su OpenStreetMap.
-- Scrittura solo service role (gli script di import), come le altre
-- tabelle di contenuto: nessuna policy di insert/update per anon.
drop policy if exists "route_geometries leggibili da tutti" on public.route_geometries;
create policy "route_geometries leggibili da tutti"
  on public.route_geometries for select
  to anon, authenticated
  using (true);

comment on table public.route_geometries is
  'Tracciati dei percorsi (cammini, sentieri, strade del vino e del gusto). Polyline Google precisione 5. Fonti ODbL: OpenStreetMap, CAI INFOMONT. Popolata da scratch/geometrie-percorsi.mjs.';
