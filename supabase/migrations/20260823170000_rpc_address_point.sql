-- ═══════════════════════════════════════════════════════════════════════════
-- LE DUE RPC PORTANO IL PUNTO DELL'INDIRIZZO. DA APPLICARE A MANO.
--
-- Regola dell'utente (23/08/2026): «chi ha indirizzo, quello È l'arrivo: il
-- trigger a 30 m da lì, e il navigatore punta a quell'indirizzo».
--
-- Il punto sta in `shared_pois.address_point_lat/lon` (migration
-- 20260823160000) e NON viene da un geocoder che interpreta il testo: viene
-- dalla casa più vicina al POI nel dump Nominatim, cioè da vicinanza
-- MISURATA a pochi metri. Vale quindi come punto d'arrivo anche senza numero
-- civico, e il raggio ci resta stretto invece di raddoppiare.
--
-- Ma finché le RPC non lo restituiscono, sul telefono e sul web quel campo è
-- sempre null e non cambia niente: le funzioni SQL hanno la lista di colonne
-- FISSA. È lo stesso inciampo dei teaser (20260822100000) e dell'indirizzo
-- (20260823090000): colonna scritta sul database e invisibile all'app.
--
-- Si aggiungono in coda: le app già installate leggono per nome e ignorano
-- ciò che non conoscono.
--
--   nearby_pois        → radar e servizi nativi (Android/iOS)
--   get_geofence_pois  → candidati dei trigger sulla PWA
--
-- lock_timeout corto: se qualcuno tiene un lock si fallisce subito e si
-- riprova, non si blocca la produzione (lezione del 18/08).
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- ── 1. nearby_pois ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.nearby_pois(float, float, int, int);
CREATE FUNCTION public.nearby_pois(
  p_lat float, p_lon float, radius_m int, limit_num int default 60
)
RETURNS TABLE (
  id text, nome text, lat float, lon float, distanza_m float, source text,
  category text, sub_category text, description_short text, description_ai text,
  image_url text, is_gem boolean, status text,
  alert_radius int, geofence_radius int, entrance_lat double precision, entrance_lon double precision,
  teaser_text_it text, teaser_text_en text, teaser_text_fr text, teaser_text_es text,
  teaser_text_de text, teaser_text_ru text, teaser_text_zh text,
  address text, city text, region text, country text,
  address_source text,
  address_point_lat double precision, address_point_lon double precision, address_point_source text
)
LANGUAGE sql STABLE AS $$
  SELECT
    sp.id, sp.name as nome, sp.lat, sp.lon,
    st_distance(
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    ) as distanza_m,
    coalesce(sp.enrichment_source, 'official') as source,
    sp.category, sp.poi_type as sub_category, sp.description_short, sp.description_ai,
    coalesce(sp.image_url, sp.photo_url) as image_url,
    coalesce(sp.is_gem, false) as is_gem,
    coalesce(sp.status, 'verified') as status,
    sp.alert_radius, sp.geofence_radius, sp.entrance_lat, sp.entrance_lon,
    sp.teaser_text_it, sp.teaser_text_en, sp.teaser_text_fr, sp.teaser_text_es,
    sp.teaser_text_de, sp.teaser_text_ru, sp.teaser_text_zh,
    sp.address, sp.city, sp.region, sp.country,
    sp.address_source,
    sp.address_point_lat, sp.address_point_lon, sp.address_point_source
  FROM public.shared_pois sp
  WHERE st_dwithin(
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, radius_m)
    AND sp.is_hidden IS NOT TRUE
    AND coalesce(sp.status, 'verified') NOT IN ('draft','needs_revision','rejected','hidden')
    AND NOT public.is_generic_poi_name(sp.name)
  ORDER BY distanza_m asc
  LIMIT limit_num;
$$;
GRANT EXECUTE ON FUNCTION public.nearby_pois(float, float, int, int) TO anon, authenticated;

-- ── 2. get_geofence_pois ───────────────────────────────────────────────────
-- Corpo ricopiato IDENTICO da 20260823140000_get_geofence_pois_ingresso.sql
-- (argomenti, colonne, `eff_*` col coalesce per non rompere il contratto di
-- GeofencePoi, filtri, ordinamento): cambiano SOLO le tre colonne in coda.
DROP FUNCTION IF EXISTS public.get_geofence_pois(double precision, double precision, uuid, integer);
CREATE FUNCTION public.get_geofence_pois(
    user_lat       DOUBLE PRECISION,
    user_lon       DOUBLE PRECISION,
    p_user_id      UUID DEFAULT NULL,
    radius_meters  INTEGER DEFAULT 500
)
RETURNS TABLE (
    id TEXT, osm_id VARCHAR, name VARCHAR, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    category VARCHAR, city VARCHAR, premium BOOLEAN, source VARCHAR, status VARCHAR,
    eff_alert_radius INT, eff_geofence_radius INT,
    alert_enabled BOOLEAN, audio_enabled BOOLEAN,
    distance_meters DOUBLE PRECISION,
    entrance_lat DOUBLE PRECISION, entrance_lon DOUBLE PRECISION,
    address TEXT, address_source TEXT,
    alert_radius INT, geofence_radius INT,
    -- ── NUOVE, IN CODA ──────────────────────────────────────────────────
    address_point_lat DOUBLE PRECISION, address_point_lon DOUBLE PRECISION,
    address_point_source TEXT
)
LANGUAGE sql STABLE AS $$
    SELECT
        sp.id,
        NULL::varchar                             AS osm_id,
        sp.name::varchar                          AS name,
        sp.lat, sp.lon,
        sp.category::varchar                      AS category,
        sp.city::varchar                          AS city,
        coalesce(sp.is_gem, false)                AS premium,
        coalesce(sp.enrichment_source, 'official')::varchar AS source,
        coalesce(sp.status, 'verified')::varchar  AS status,
        coalesce(sp.alert_radius, 150)            AS eff_alert_radius,
        coalesce(sp.geofence_radius, 50)          AS eff_geofence_radius,
        true                                      AS alert_enabled,
        true                                      AS audio_enabled,
        ST_Distance(
            st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
            st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography
        )                                         AS distance_meters,
        sp.entrance_lat, sp.entrance_lon,
        sp.address, sp.address_source,
        sp.alert_radius, sp.geofence_radius,
        -- IL PUNTO DELL'INDIRIZZO: quando c'è, È l'arrivo — trigger stretto e
        -- navigatore che punta lì, senza geocodificare niente al volo.
        sp.address_point_lat, sp.address_point_lon, sp.address_point_source
    FROM public.shared_pois sp
    WHERE st_dwithin(
            st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
            st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography,
            radius_meters
          )
      AND sp.is_hidden IS NOT TRUE
      AND coalesce(sp.status, 'verified') NOT IN ('draft','needs_revision','rejected','hidden')
      AND NOT public.is_generic_poi_name(sp.name)
    ORDER BY distance_meters ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_geofence_pois(double precision, double precision, uuid, integer)
  TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA (dopo che la passata dei punti è girata; prima di quella tutti i
-- valori sono null ed è normale):
--   select id, nome, address, address_point_lat, address_point_source
--     from public.nearby_pois(41.8902, 12.4922, 1000, 5);
--
-- Quanti POI hanno un punto e da dove viene:
--   select address_point_source, count(*)
--     from public.shared_pois where address_point_lat is not null group by 1;
-- ═══════════════════════════════════════════════════════════════════════════
