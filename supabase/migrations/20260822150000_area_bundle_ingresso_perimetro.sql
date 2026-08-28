-- ═══════════════════════════════════════════════════════════════════════════
-- PACCHETTI OFFLINE: LA PORTA, IL PERIMETRO E L'INDIRIZZO — DA APPLICARE A MANO
--
-- PERCHE'. Online il geofencing nativo punta all'ingresso (entrance_lat/lon,
-- 277.363 POI al 22/08/2026) e chiede "sono dentro?" al perimetro OSM
-- (poi_footprints, 402.889 POI). Offline no: area_bundle_pois non li
-- restituiva, e i pacchetti scaricati lavoravano a cerchi sul centroide — cioe'
-- esattamente la qualita' che abbiamo smesso di accettare online. Chi scarica
-- un'area per usarla senza rete e' il turista che piu' si affida alla guida.
--
-- COSA CAMBIA. Quattro colonne in piu' nella tabella di ritorno:
--   entrance_lat, entrance_lon  — la porta (null = centroide, come prima)
--   address                     — via e civico, per notifica e voce
--   footprint                   — GeoJSON del perimetro (null per l'82% dei POI)
-- Il resto (filtri, lingua, audioguida, keyset, total_count, firma) e'
-- IDENTICO a 20260813110000_poi_visibility_offline_canonical.sql. Il server
-- (/api/area/bundle) passa le righe cosi' come sono: nessuna modifica la'.
--
-- PESO. Il perimetro mediano ha 15 vertici (~450 byte di GeoJSON); su un
-- pacchetto da 10.000 POI, di cui ~1.800 con perimetro, sono ~800 KB in piu'
-- prima del gzip. Accettabile: e' la differenza fra "parla quando sei dentro"
-- e "parla dall'altra parte della strada".
--
-- Il tipo di ritorno cambia: CREATE OR REPLACE non basta, serve DROP prima.
-- ═══════════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';

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
    count(*) over () as total_count
  from public.shared_pois sp
  left join public.poi_audioguides ag
    on ag.poi_id = sp.id
   and ag.language = upper(p_lang)
   and ag.guide_character = 'nicky'
  -- Il perimetro e' una riga per POI (poi_id e' PRIMARY KEY): il LEFT JOIN non
  -- moltiplica le righe e non sposta il keyset.
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
-- VERIFICA — incollare dopo:
--
--   select count(*) filter (where entrance_lat is not null) as con_porta,
--          count(*) filter (where footprint is not null)    as con_perimetro,
--          count(*)                                          as totale
--   from area_bundle_pois(44.08, 10.10, 3000);               -- Carrara
--   → con_porta > 0 e con_perimetro > 0; totale uguale a prima della migration
-- ═══════════════════════════════════════════════════════════════════════════
