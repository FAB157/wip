-- ═══════════════════════════════════════════════════════════════════════════
-- nearby_pois A 5 KM NON DEVE PIU' ANDARE IN TIMEOUT. DA APPLICARE A MANO.
--
-- COSA SUCCEDEVA (collaudo sul Realme a Carrara, 29/08/2026). Il servizio
-- nativo chiede i POI in un raggio di 5 km a piedi (10 in auto) e riceveva
-- HTTP 500 `57014 canceling statement due to statement timeout`: il ruolo
-- `anon` ha 3 s. Misurato dal PC con la chiave pubblica:
--     5 km → 500 dopo 3,5 s      2 km → 120 POI in 1,4 s      500 m → 0,35 s
-- Le app ripiegano gia' su 2 km (commit 9e9b802), ma e' un cerotto: in centro
-- il raggio largo lo si perde, e la mappa web chiede la stessa funzione con
-- limit 1000 (3,2 s a 2,5 km, col ruolo `authenticated` che ha 8 s).
--
-- PERCHE'. La versione precedente (20260825140000) faceva, per OGNI riga nel
-- raggio: st_distance geodetica, coalesce su status, e la funzione
-- is_generic_poi_name(name) (regex sul nome); poi ORDINAVA tutto per
-- distanza e solo alla fine tagliava a limit_num. Con i POI importati negli
-- ultimi giorni (atlante, enogastronomia, cinema, ingressi mondiali) a 5 km
-- da una citta' toscana le righe nel raggio sono decine di migliaia.
--
-- COME. Due passi:
--  1. CANDIDATI: la ricerca spaziale + i filtri ECONOMICI (colonne), ordinata
--     con l'operatore KNN `<->` sulla STESSA espressione geography dell'indice
--     GIST esistente (20260716000001_optimize_poi_queries.sql): il planner
--     cammina l'indice in ordine di distanza e si ferma dopo limit_num*5
--     righe, invece di leggerle e ordinarle tutte.
--  2. FINALE: solo su quelle poche righe si calcola la distanza esatta e si
--     applica il filtro COSTOSO sui nomi generici; poi il LIMIT vero.
-- limit_num*5 (tetto 1.500): dove i nomi generici sono la maggioranza si
-- rischia di tornare meno di limit_num, ma in quei posti sono per lo piu'
-- POI che comunque non si vogliono. Colonne, tipi, ordine e filtri sono
-- IDENTICI alla versione precedente: le app installate non vedono differenze.
--
-- VERIFICA (incollare dopo, in SQL editor):
--   explain (analyze, buffers) select * from nearby_pois(44.0793, 10.0977, 5000, 120);
--   → deve mostrare "Index Scan using ... " con "Order By: ... <-> ..." e un
--     tempo totale di poche decine di ms. Dal PC, con la chiave pubblica:
--   curl -s -X POST "$URL/rest/v1/rpc/nearby_pois" -H "apikey: $KEY" \
--        -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
--        -d '{"p_lat":44.0793,"p_lon":10.0977,"radius_m":10000,"limit_num":120}'
--   → 200 in meno di un secondo anche a 10 km.
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
  address_source text,
  address_point_lat double precision, address_point_lon double precision, address_point_source text,
  image_attribution text
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
    sp.image_attribution
  FROM candidati sp
  WHERE NOT public.is_generic_poi_name(sp.name)
  ORDER BY distanza_m asc
  LIMIT limit_num;
$$;
GRANT EXECUTE ON FUNCTION public.nearby_pois(float, float, int, int) TO anon, authenticated;
