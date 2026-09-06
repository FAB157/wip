-- ═══════════════════════════════════════════════════════════════════════════
-- IL PUNTO D'ARRIVO: IL MARCIAPIEDE DAVANTI ALLA PORTA. DA APPLICARE A MANO.
--
-- Decisione del committente (05/09/2026): «il marciapiede davanti all'ingresso
-- e' il top». Fino a oggi il navigatore (WIP Nav, OSRM) riceveva come
-- destinazione l'INGRESSO stesso (`entrance_lat/lon`) e OSRM lo agganciava da
-- solo alla via piu' vicina: per un portone in fondo a un cortile, o su un
-- edificio che da' su due strade, quella via poteva essere quella sul RETRO,
-- e l'intero percorso girava dalla parte sbagliata.
--
-- Ora il matcher (droplet, match-entrances v3.1) calcola per ogni POI un
-- secondo punto, distinto dalla porta:
--   arrival_lat/lon   proiezione della PORTA sulla way pedonale percorribile
--                     piu' vicina entro 40 m (footway, path, pedestrian,
--                     steps, living_street, residential, unclassified,
--                     tertiary, secondary, primary; MAI motorway/trunk/
--                     service), proiettata DALLA porta cosi' cade sul lato
--                     giusto della strada; oltre 40 m la proiezione sulla via
--                     DICHIARATA (entro 120 m); altrimenti la porta stessa.
--                     Per i punti gia' derivati (proiezioni) e' il punto
--                     stesso, che sta gia' su una way.
--   arrival_method    'sidewalk' | 'declared_street' | 'entrance' | 'derived'
--   arrival_dist_m    metri fra la porta e il punto d'arrivo (diagnostica).
--
-- CHI USA COSA (regola da non confondere):
--   • il TRIGGER dell'audioguida resta sulla PORTA (`entrance_lat/lon`, o il
--     perimetro quando c'e'): «perimetro > ingresso > strada» (memoria di
--     progetto). Questa migration non lo tocca.
--   • il NAVIGATORE (tappa del giro, «Vai» dalla scheda, mappe esterne)
--     punta al PUNTO D'ARRIVO: puntoArrivo.ts::puntoNavigazione.
--
-- Le tre RPC hanno la lista di colonne FISSA: senza aggiungerle qui la
-- colonna scritta sul database resterebbe invisibile all'app (stesso
-- inciampo dei teaser 22/08, dell'indirizzo 23/08, del punto 23/08). Si
-- aggiungono IN CODA: le app gia' installate leggono per nome e ignorano
-- cio' che non conoscono; un pacchetto offline scaricato ieri resta valido.
--
-- ORDINE DI APPLICAZIONE: PRIMA di eseguire la fase B dello staging
-- (sql-staging-ingressi.sql, gli UPDATE ... FROM ingressi_staging): l'UPDATE
-- scrive arrival_* e fallirebbe senza le colonne. L'ALTER TABLE e' solo
-- metadati (nessuna riscrittura della tabella), ma prende un lock esclusivo
-- per un istante: lock_timeout corto, se qualcuno tiene un lock si fallisce
-- subito e si riprova (lezione del 18/08).
--
-- Corpi delle RPC ricopiati IDENTICI dalle versioni correnti:
--   nearby_pois        ← 20260829150000_nearby_pois_knn.sql
--   get_geofence_pois  ← 20260823170000_rpc_address_point.sql
--   area_bundle_pois   ← 20260823180000_area_bundle_address_point.sql
-- cambiano SOLO le colonne in coda.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- ── 0. Le colonne ──────────────────────────────────────────────────────────
alter table public.shared_pois
  add column if not exists arrival_lat    double precision,
  add column if not exists arrival_lon    double precision,
  add column if not exists arrival_method text,
  add column if not exists arrival_dist_m double precision;

comment on column public.shared_pois.arrival_lat    is 'Punto d''arrivo per il navigatore: la porta proiettata sulla way pedonale davanti (match-entrances v3.1). Il trigger usa entrance_lat/lon, non questo.';
comment on column public.shared_pois.arrival_method is 'sidewalk | declared_street | entrance | derived — da dove viene arrival_lat/lon.';

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
  address_point_lat double precision, address_point_lon double precision, address_point_source text,
  image_attribution text,
  -- ── NUOVE, IN CODA (05/09/2026) ─────────────────────────────────────────
  arrival_lat double precision, arrival_lon double precision, arrival_method text
)
LANGUAGE sql STABLE AS $$
  WITH candidati AS (
    SELECT sp.*
    FROM public.shared_pois sp
    WHERE st_dwithin(
        st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, radius_m)
      AND sp.is_hidden IS NOT TRUE
      AND coalesce(sp.status, 'verified') NOT IN ('draft','needs_revision','rejected','hidden')
    ORDER BY st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography
             <-> st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    LIMIT least(greatest(coalesce(limit_num, 60), 1) * 5, 1500)
  )
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
    sp.address_point_lat, sp.address_point_lon, sp.address_point_source,
    sp.image_attribution,
    sp.arrival_lat, sp.arrival_lon, sp.arrival_method
  FROM candidati sp
  WHERE NOT public.is_generic_poi_name(sp.name)
  ORDER BY distanza_m asc
  LIMIT limit_num;
$$;
GRANT EXECUTE ON FUNCTION public.nearby_pois(float, float, int, int) TO anon, authenticated;

-- ── 2. get_geofence_pois ───────────────────────────────────────────────────
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
    address_point_lat DOUBLE PRECISION, address_point_lon DOUBLE PRECISION,
    address_point_source TEXT,
    -- ── NUOVE, IN CODA (05/09/2026) ─────────────────────────────────────
    arrival_lat DOUBLE PRECISION, arrival_lon DOUBLE PRECISION, arrival_method TEXT
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
        sp.address_point_lat, sp.address_point_lon, sp.address_point_source,
        sp.arrival_lat, sp.arrival_lon, sp.arrival_method
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

-- ── 3. area_bundle_pois (pacchetto offline) ────────────────────────────────
drop function if exists public.area_bundle_pois(float, float, int, text, timestamptz, timestamptz, text, int);

create or replace function public.area_bundle_pois(
  p_lat float,
  p_lon float,
  p_radius_m int,
  p_lang text default 'it',
  p_since timestamptz default null,
  p_cursor_updated timestamptz default null,
  p_cursor_id text default null,
  p_limit int default 500
)
returns table (
  id text,
  nome text,
  lat float,
  lon float,
  category text,
  poi_type text,
  is_gem boolean,
  status text,
  alert_radius int,
  geofence_radius int,
  teaser_text text,
  description_short text,
  audio_text text,
  updated_at timestamptz,
  entrance_lat float,
  entrance_lon float,
  address text,
  footprint text,
  address_source text,
  address_point_lat double precision,
  address_point_lon double precision,
  address_point_source text,
  -- ── NUOVE (05/09/2026); total_count resta l'ultima come sempre ─────────
  arrival_lat double precision,
  arrival_lon double precision,
  arrival_method text,
  total_count bigint
)
language sql stable as $$
  select
    sp.id,
    sp.name as nome,
    sp.lat,
    sp.lon,
    sp.category,
    sp.poi_type,
    coalesce(sp.is_gem, false) as is_gem,
    coalesce(sp.status, 'verified') as status,
    coalesce(sp.alert_radius, 150) as alert_radius,
    coalesce(sp.geofence_radius, 50) as geofence_radius,
    case p_lang
      when 'en' then coalesce(sp.teaser_text_en, sp.teaser_text_it)
      when 'fr' then coalesce(sp.teaser_text_fr, sp.teaser_text_it)
      when 'es' then coalesce(sp.teaser_text_es, sp.teaser_text_it)
      when 'de' then coalesce(sp.teaser_text_de, sp.teaser_text_it)
      when 'ru' then coalesce(sp.teaser_text_ru, sp.teaser_text_it)
      when 'zh' then coalesce(sp.teaser_text_zh, sp.teaser_text_it)
      else sp.teaser_text_it
    end as teaser_text,
    sp.description_short,
    coalesce(ag.audio_text, sp.audio_script, sp.description_long, sp.description_ai, sp.full_description) as audio_text,
    sp.updated_at,
    sp.entrance_lat,
    sp.entrance_lon,
    sp.address,
    fp.geojson as footprint,
    sp.address_source,
    sp.address_point_lat,
    sp.address_point_lon,
    sp.address_point_source,
    sp.arrival_lat,
    sp.arrival_lon,
    sp.arrival_method,
    count(*) over () as total_count
  from public.shared_pois sp
  -- 'nicky' FISSO E' UNA SCELTA (23/08/2026): il testo e' unico, la voce la
  -- sceglie il sistema dalle prefs "guideCharacter". Non aggiungere p_character.
  left join public.poi_audioguides ag
    on ag.poi_id = sp.id
   and ag.language = upper(p_lang)
   and ag.guide_character = 'nicky'
  left join public.poi_footprints fp
    on fp.poi_id = sp.id
  where st_dwithin(
          st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
          st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
          p_radius_m
        )
    and coalesce(sp.status, 'verified') in ('verified', 'auto', 'approved')
    and sp.is_hidden is not true
    and not public.is_generic_poi_name(sp.name)
    and (p_since is null or sp.updated_at > p_since)
    and (
          p_cursor_updated is null
          or (sp.updated_at, sp.id) > (p_cursor_updated, p_cursor_id)
        )
  order by sp.updated_at asc, sp.id asc
  limit least(greatest(p_limit, 1), 1000);
$$;

grant execute on function public.area_bundle_pois(float, float, int, text, timestamptz, timestamptz, text, int)
  to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA — incollare dopo (prima della fase B dello staging arrival_* sono
-- tutti null ed e' normale: la colonna c'e', i dati arrivano con l'UPDATE):
--
--   select id, nome, entrance_lat, arrival_lat, arrival_method
--     from public.nearby_pois(44.0793, 10.0977, 1000, 5);
--
--   select arrival_method, count(*), round(avg(arrival_dist_m)::numeric, 1) as media_m
--     from public.shared_pois where arrival_lat is not null group by 1;
--   → dopo la scrittura Italia: 'sidewalk' la maggioranza, media_m sotto i 20.
-- ═══════════════════════════════════════════════════════════════════════════
