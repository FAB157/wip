-- ═══════════════════════════════════════════════════════════════════════════
-- ACCURATEZZA GEOFENCING — perimetri reali + punti d'ingresso (idee sez. 9 PDF)
-- DA APPLICARE A MANO (Supabase SQL editor). Additiva e sicura.
--
-- Problema: i POI hanno solo il CENTROIDE (lat/lon). I raggi di trigger sono
-- costanti per modalità + un bump forfettario per categoria (una piazza e una
-- statua ottengono lo stesso raggio). Le colonne per-POI alert_radius/
-- geofence_radius esistono ma la RPC nearby_pois non le restituisce e nessun
-- client le usa. Manca anche il punto d'ingresso (entrance) su cui centrare il
-- trigger invece che sul centro dell'edificio.
--
-- Questa migration NON cambia il comportamento da sola: aggiunge le colonne
-- entrance e fa restituire a nearby_pois i raggi + l'ingresso, così che:
--   1) lo script scratch/footprint-pilot (che calcola raggio reale ed entrance
--      dai poligoni OSM) possa finalmente scrivere i suoi risultati;
--   2) i client (web + nativo) usino i raggi calibrati SOLO per i POI che hanno
--      un entrance valorizzato (= processati dal footprint), lasciando tutti gli
--      altri identici a oggi.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- 1) Colonne ingresso (usate da footprint-pilot/staging-update.sql, che le
--    assumeva esistenti). NULL = POI non ancora processato col perimetro.
ALTER TABLE public.shared_pois
  ADD COLUMN IF NOT EXISTS entrance_lat double precision,
  ADD COLUMN IF NOT EXISTS entrance_lon double precision;

-- 2) nearby_pois restituisce anche alert_radius, geofence_radius ed entrance.
--    Additivo: i client che mappano campi specifici ignorano le colonne extra.
DROP FUNCTION IF EXISTS public.nearby_pois(float, float, int, int);

CREATE OR REPLACE FUNCTION public.nearby_pois(
  p_lat float,
  p_lon float,
  radius_m int,
  limit_num int default 60
)
RETURNS TABLE (
  id text,
  nome text,
  lat float,
  lon float,
  distanza_m float,
  source text,
  category text,
  sub_category text,
  description_short text,
  description_ai text,
  image_url text,
  is_gem boolean,
  status text,
  alert_radius int,
  geofence_radius int,
  entrance_lat double precision,
  entrance_lon double precision
)
LANGUAGE sql STABLE AS $$
  SELECT
    sp.id,
    sp.name as nome,
    sp.lat,
    sp.lon,
    st_distance(
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    ) as distanza_m,
    coalesce(sp.enrichment_source, 'official') as source,
    sp.category,
    sp.poi_type as sub_category,
    sp.description_short,
    sp.description_ai,
    coalesce(sp.image_url, sp.photo_url) as image_url,
    coalesce(sp.is_gem, false) as is_gem,
    coalesce(sp.status, 'verified') as status,
    sp.alert_radius,
    sp.geofence_radius,
    sp.entrance_lat,
    sp.entrance_lon
  FROM public.shared_pois sp
  WHERE st_dwithin(
    st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
    radius_m
  )
  ORDER BY distanza_m asc
  LIMIT limit_num;
$$;

GRANT EXECUTE ON FUNCTION public.nearby_pois(float, float, int, int) TO anon, authenticated;

-- ROLLBACK:
--   drop function if exists public.nearby_pois(float,float,int,int);
--   -- e ricreare la versione precedente da 20260804190000_nearby_pois_fast.sql
--   alter table public.shared_pois drop column if exists entrance_lat, drop column if exists entrance_lon;
