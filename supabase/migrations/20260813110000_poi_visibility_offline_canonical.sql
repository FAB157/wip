-- ═══════════════════════════════════════════════════════════════════════════
-- CANONICALIZZAZIONE VISIBILITÀ POI + OFFLINE — WIP (2026-08-13)
-- DA APPLICARE A MANO (Supabase SQL editor). Idempotente: rieseguibile.
--
-- Porta a un'unica definizione version-controlled le RPC che alimentano radar,
-- geofencing e pacchetti offline, con lo STESSO filtro di visibilità ovunque
-- (niente draft/needs_revision/rejected/hidden, niente is_hidden, niente nomi
-- vuoti/generici). Chiude quattro buchi dell'audit:
--
--   [BLOCCANTE] area_bundle_pois includeva 'draft' → i pacchetti offline
--     scaricavano bozze/allucinazioni Vision, che offline fanno scattare
--     "Sei arrivato!" da sole. Ora status IN ('verified','auto','approved') e
--     esclusione nomi generici (is_generic_poi_name), come il radar.
--
--   [GRAVE] Le bonifiche non si propagavano offline: un POI che passa a
--     hidden/rejected/needs_revision spariva dal delta senza tombstone → il
--     client offline non lo cancellava mai. Nuova RPC companion
--     area_bundle_removed(): restituisce gli id dei POI che nell'area hanno
--     PERSO la visibilità dopo p_since, così il server li aggiunge alle
--     tombstone del bundle (le hard-delete sono già coperte da
--     shared_pois_tombstones, ma quelle NON coprono i cambi di stato).
--
--   [GRAVE] get_pois_within_radius (download mappe offline web) includeva
--     'draft' e non restituiva lo status → il client non poteva filtrare, e
--     su tabelle da 1,8M righe il payload era illimitato. Ora niente draft,
--     colonna status esposta, ORDER BY distanza + LIMIT 5000.
--
--   [GRAVE] Schema drift nearby_pois: 20260811130000 (footprint/entrance)
--     aveva ricreato nearby_pois PERDENDO il filtro visibilità di
--     20260808200000. La versione canonica qui tiene INSIEME footprint +
--     visibilità + esclusione generici (= 20260812130000, ri-affermata). In
--     più porta get_geofence_pois a leggere da shared_pois (non più la tabella
--     legacy 'pois', vuota → geofencing web morto).
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────────────────────
-- Dipendenza: is_generic_poi_name (port di isGenericUtilityName). Ri-creata
-- qui (versione più recente = 20260812150000, coi placeholder "Punto di
-- interesse") così le RPC sotto compilano anche se le migration 20260812* non
-- fossero ancora state applicate a mano. Idempotente, nessuna regressione.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_generic_poi_name(n text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT
    n IS NULL
    OR length(trim(n)) < 2
    OR lower(trim(n)) IN (
      'parcheggio','parco','giardino','giardinetti','giardinetto','villa','parking',
      'park','garden','playground','posteggio','sosta','stazionamento',
      'luogo d''interesse','luogo d interesse','area camper','area sosta',
      'area di sosta','sito','punto',
      -- placeholder del vecchio import CSV/OSM (nessun contenuto):
      'punto di interesse','punto d''interesse','punto d interesse',
      'luogo di interesse','point of interest','points of interest'
    )
    OR lower(trim(n)) ~* '^(parcheggio|posteggio|parking|park)( (pubblic[oi]|comunal[ei]|gratuit[oi]|privat[oi]|riservat[oi]|clienti|coperto|scoperto|cittadin[oi]|auto|camper|moto|disabili|residenti|gratis|free|public|private|custodito|interrato|multipiano|a|di|per|e|pagamento))+$'
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 7a — nearby_pois CANONICA: 17 colonne (raggi + entrance dal footprint)
--   + filtro visibilità (is_hidden/status) + esclusione nomi generici.
--   Base: 20260812130000_hide_empty_utility_pois.sql:38-71 (che già univa
--   footprint di 20260811130000 e visibilità di 20260808200000). Qui è la
--   versione definitiva version-controlled.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.nearby_pois(float, float, int, int);
CREATE OR REPLACE FUNCTION public.nearby_pois(
  p_lat float, p_lon float, radius_m int, limit_num int default 60
)
RETURNS TABLE (
  id text, nome text, lat float, lon float, distanza_m float, source text,
  category text, sub_category text, description_short text, description_ai text,
  image_url text, is_gem boolean, status text,
  alert_radius int, geofence_radius int, entrance_lat double precision, entrance_lon double precision
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
    sp.alert_radius, sp.geofence_radius, sp.entrance_lat, sp.entrance_lon
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

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 7b — get_geofence_pois CANONICA su shared_pois (non più la legacy 'pois').
--   Base: pois_schema.sql:190-225 (stessa firma di argomenti e stesse colonne
--   di output, così il client non cambia: poiRepository.ts::getGeofencePois).
--   Cambia solo la SORGENTE (shared_pois) e i filtri, allineati al radar.
--
--   NOTE / GUESS FLAGGED:
--   - shared_pois NON ha le colonne osm_id/city/premium/source (nessuna RPC le
--     referenzia): mappate a NULL / a colonne equivalenti
--     (premium<-is_gem, source<-enrichment_source). id è TEXT (era BIGINT sulla
--     tabella legacy) → serve DROP+CREATE, non basta CREATE OR REPLACE.
--   - Gli override per-utente (user_poi_settings) NON sono agganciabili: la sua
--     poi_id è BIGINT (FK verso la legacy pois) e non combacia con
--     shared_pois.id (text). I raggi effettivi usano quindi i default del POI;
--     il client (useGeofencing) li ricalcola comunque con radiiForTransport, per
--     cui eff_* vale solo da fallback coerente (stesso criterio del ramo Dexie).
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_geofence_pois(double precision, double precision, uuid, integer);
CREATE OR REPLACE FUNCTION public.get_geofence_pois(
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
    distance_meters DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
    SELECT
        sp.id,
        NULL::varchar                             AS osm_id,
        sp.name::varchar                          AS name,
        sp.lat, sp.lon,
        sp.category::varchar                      AS category,
        NULL::varchar                             AS city,
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
        )                                         AS distance_meters
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

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 3 — area_bundle_pois: pacchetti offline SENZA draft e SENZA nomi generici.
--   Base: 20260809110000_area_bundle_audio_lang.sql (versione live col LEFT JOIN
--   poi_audioguides per lingua). UNICHE modifiche: (a) 'draft' tolto dalla
--   IN-list dello status; (b) aggiunto AND NOT is_generic_poi_name(sp.name).
--   Tutto il resto (join audioguide, gestione lingua/character, keyset,
--   total_count, firma) è IDENTICO.
-- ───────────────────────────────────────────────────────────────────────────
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
    -- Audioguida NELLA LINGUA: prima la traduzione cachata in poi_audioguides
    -- (language in MAIUSCOLO, come il web/get-or-create), poi i campi italiani
    -- come rete di sicurezza finché quella lingua non è ancora stata generata.
    coalesce(ag.audio_text, sp.audio_script, sp.description_long, sp.description_ai, sp.full_description) as audio_text,
    sp.updated_at,
    count(*) over () as total_count
  from public.shared_pois sp
  left join public.poi_audioguides ag
    on ag.poi_id = sp.id
   and ag.language = upper(p_lang)
   and ag.guide_character = 'nicky'
  where st_dwithin(
          st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
          st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
          p_radius_m
        )
    -- 'draft' RIMOSSO: le bozze/allucinazioni non finiscono più nei pacchetti.
    and coalesce(sp.status, 'verified') in ('verified', 'auto', 'approved')
    -- is_hidden escluso come nel radar (nearby_pois/get_geofence_pois): un POI
    -- nascosto-ma-con-status-visibile non deve entrare nei pacchetti offline, e
    -- area_bundle_removed lo conta come rimosso → evita pois[] ∩ tombstones[].
    and sp.is_hidden is not true
    -- Nomi vuoti/generici ("Punto di interesse", "Parcheggio"…) esclusi come nel radar.
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

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 4 — area_bundle_removed: companion delle tombstone per il delta sync.
--   Ritorna gli id dei POI che NELL'AREA hanno perso la visibilità (o sono
--   diventati generici) DOPO p_since. Sono i POI che area_bundle_pois smette di
--   restituire senza che esista una riga in shared_pois_tombstones (che copre
--   solo le HARD DELETE). Il server (/api/area/bundle) unisce questi id alle
--   tombstone della prima pagina del delta, così i client offline li cancellano.
--   Complemento esatto del filtro di bundle-eligibilità di area_bundle_pois.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.area_bundle_removed(
  p_lat float,
  p_lon float,
  p_radius_m int,
  p_since timestamptz
)
returns table (id text)
language sql stable as $$
  select sp.id
  from public.shared_pois sp
  where st_dwithin(
          st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
          st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
          p_radius_m
        )
    and p_since is not null
    and sp.updated_at > p_since
    and (
          coalesce(sp.status, 'verified') not in ('verified', 'auto', 'approved')
          or sp.is_hidden is true
          or public.is_generic_poi_name(sp.name)
        )
  limit 5000;
$$;

grant execute on function public.area_bundle_removed(float, float, int, timestamptz)
  to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 5 — get_pois_within_radius (download mappe offline web): niente draft,
--   colonna status esposta, ORDER BY distanza + LIMIT 5000.
--   Base: 20260716000001_optimize_poi_queries.sql:12-44 (legge shared_pois).
--   Serve DROP+CREATE perché cambia la RETURNS TABLE (aggiunta di status).
--   La firma di argomenti resta identica → il client non cambia
--   (OfflineMapsTab.tsx::get_pois_within_radius).
-- ───────────────────────────────────────────────────────────────────────────
drop function if exists public.get_pois_within_radius(double precision, double precision, double precision);
create or replace function public.get_pois_within_radius(
  center_lat double precision,
  center_lon double precision,
  radius_km double precision
)
returns table (
  id text,
  name text,
  lat double precision,
  lon double precision,
  category text,
  description text,
  is_gem boolean,
  status text
)
language sql stable
as $$
  select
    p.id,
    p.name,
    p.lat,
    p.lon,
    p.category,
    coalesce(p.description_ai, p.description_short) as description,
    p.is_gem,
    coalesce(p.status, 'verified') as status
  from public.shared_pois p
  where
    st_dwithin(
      st_setsrid(st_makepoint(p.lon, p.lat), 4326)::geography,
      st_setsrid(st_makepoint(center_lon, center_lat), 4326)::geography,
      radius_km * 1000
    )
    -- 'draft' RIMOSSO dal filtro (era: verified/auto/approved/draft).
    and coalesce(p.status, 'verified') in ('verified', 'auto', 'approved')
  -- ORDER BY distanza + LIMIT: su 1,8M righe protegge dal payload illimitato,
  -- tenendo comunque i 5000 POI più vicini al centro dell'area scaricata.
  order by st_distance(
      st_setsrid(st_makepoint(p.lon, p.lat), 4326)::geography,
      st_setsrid(st_makepoint(center_lon, center_lat), 4326)::geography
    ) asc
  limit 5000;
$$;

grant execute on function public.get_pois_within_radius(double precision, double precision, double precision)
  to anon, authenticated;

analyze public.shared_pois;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE (eseguire a mano nell'SQL editor)
--
-- 1) Le funzioni esistono con la firma attesa:
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public'
--      and p.proname in ('nearby_pois','get_geofence_pois','area_bundle_pois',
--                        'area_bundle_removed','get_pois_within_radius',
--                        'is_generic_poi_name')
--    order by p.proname;
--
-- 2) area_bundle_pois / get_pois_within_radius NON restituiscono più draft:
--   select count(*) from area_bundle_pois(43.87, 10.24, 3000);      -- Carrara
--   select count(*) from get_pois_within_radius(43.87, 10.24, 3.0);
--   -- confrontare con: select count(*) from shared_pois
--   --   where status='draft' and st_dwithin(...) ;  -- deve essere ESCLUSO
--
-- 3) get_geofence_pois ora legge shared_pois (prima 'pois' legacy, vuota):
--   select count(*) from get_geofence_pois(43.87, 10.24, null, 1000);
--   -- deve essere > 0 in una zona con POI (prima tornava 0 = geofencing morto)
--
-- 4) get_pois_within_radius espone status e rispetta il LIMIT:
--   select status, count(*) from get_pois_within_radius(41.90, 12.49, 5.0)
--    group by status;  -- solo verified/auto/approved, <= 5000 righe totali
-- ═══════════════════════════════════════════════════════════════════════════
