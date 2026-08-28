-- ═══════════════════════════════════════════════════════════════════════════
-- nearby_pois: AGGIUNGE address_source. DA APPLICARE A MANO.
--
-- Perché serve. La migration di stamattina (20260823090000) ha aggiunto
-- `address`, `city`, `region`, `country` a `nearby_pois`. Ma UN INDIRIZZO
-- SENZA LA SUA PROVENIENZA NON È USABILE: dal 23/08/2026 la colonna
-- `shared_pois.address` ospita anche righe con `address_source='strada_vicina'`,
-- cioè la strada più vicina trovata dal dump — non l'indirizzo del luogo.
-- Se il client si fidasse ciecamente, il navigatore porterebbe a un punto a
-- caso di quella via (`src/lib/puntoArrivo.ts:88-100` scarta apposta quel
-- caso, ma può farlo solo se conosce la fonte).
--
-- Oggi il client tampona interrogando `shared_pois` una volta per POI quando
-- la fonte manca (`puntoArrivo.ts:79-85`). Con questa colonna quella query
-- sparisce: una richiesta in meno per ogni POI aperto.
--
-- La colonna si aggiunge IN CODA al RETURNS TABLE, quindi le app già
-- installate — che leggono per nome — non si accorgono di nulla.
-- Fratello di `20260823140000_get_geofence_pois_ingresso.sql`, che fa la
-- stessa cosa per l'altra RPC (quella dei trigger).
--
-- lock_timeout corto: se qualcuno tiene un lock si fallisce subito e si
-- riprova, non si blocca la produzione (lezione del 18/08).
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

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
  address_source text
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
    sp.address_source
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

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA (Roma, 1 km): la fonte deve arrivare accanto all'indirizzo.
--   select id, nome, address, address_source
--     from public.nearby_pois(41.8902, 12.4922, 1000, 5);
--
-- Quante righe hanno un indirizzo VERO e quante solo la strada vicina:
--   select address_source, count(*)
--     from public.nearby_pois(41.8902, 12.4922, 3000, 500)
--    where address is not null group by 1 order by 2 desc;
-- ═══════════════════════════════════════════════════════════════════════════
