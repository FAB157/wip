-- MOSTRE / COLLEZIONI PERMANENTI / STAGIONALI: il raggio scelto dall'utente (100 / 300 / 500 km) deve
-- valere davvero (committente, 10/10/2026). Misurato a Carrara: a 100, 300 e 500 km le collezioni
-- permanenti erano le STESSE 27 righe (la più lontana a 17 km) e le mostre gli stessi 24 siti entro
-- 99 km, perché musei_vicini restituisce «i primi N più vicini» e con N = 200 non si esce mai dalla
-- provincia. Anche gli anelli di 50/150/500 km rileggevano le stesse 200 righe.
--
-- Due pezzi:
-- 1) musei_vicini_corona: come musei_vicini ma fra un raggio MINIMO e uno massimo (la corona), così
--    ogni fascia di distanza porta le sue righe; e con `solo_gemme` per prendere, nelle fasce larghe,
--    i musei che contano (gemme) invece dei primi che capitano.
-- 2) Indice geografico parziale sulle gemme-musei: ordinando per distanza con il filtro is_gem sul
--    solo indice dei musei la corona 150–500 km costava 4,5 s e quella 50–500 km 38 s (misurato dal
--    pooler il 10/10/2026); le gemme-musei sono una frazione piccola delle righe (782 entro 500 km da
--    Carrara) e con il loro indice la stessa lettura è in millisecondi.
--    CONCURRENTLY: non blocca le scritture; eseguito a mano dal pooler il 10/10/2026.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shared_pois_geog_musei_gemme
  ON public.shared_pois
  USING gist (((st_setsrid(st_makepoint(lon, lat), 4326))::geography))
  WHERE category IN ('musei', 'museum', 'gallery', 'art_gallery', 'monumenti')
    AND is_gem = true
    AND coalesce(is_hidden, false) = false;

CREATE OR REPLACE FUNCTION public.musei_vicini_corona(
  p_lat float,
  p_lon float,
  min_m int,
  max_m int,
  limit_num int DEFAULT 200,
  solo_con_sito boolean DEFAULT false,
  solo_gemme boolean DEFAULT false
)
RETURNS TABLE (
  id text,
  name text,
  lat float,
  lon float,
  category text,
  contact_website text,
  contact_phone text,
  image_url text,
  photo_url text,
  address text,
  city text,
  description_short text,
  is_gem boolean,
  distanza_m float
)
-- plpgsql con DUE rami, non una SQL function con «(NOT solo_gemme OR is_gem = true)»: dal pooler (piano
-- su misura, costanti sostituite) la prima versione rispondeva in 230 ms, da PostgREST (piano generico,
-- `solo_gemme` resta un parametro) il predicato dell'indice parziale non è dimostrabile, il planner
-- torna all'indice generale dei musei e la fascia 300–500 km scade a 8 s (misurato il 10/10/2026). Nel
-- ramo delle gemme `is_gem = true` è scritto per esteso e l'indice parziale si usa sempre.
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF solo_gemme THEN
    RETURN QUERY
    SELECT
      sp.id, sp.name, sp.lat, sp.lon, sp.category, sp.contact_website, sp.contact_phone,
      sp.image_url, sp.photo_url, sp.address, sp.city, sp.description_short,
      coalesce(sp.is_gem, false) AS is_gem,
      st_distance(
        st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
      ) AS distanza_m
    FROM public.shared_pois sp
    WHERE st_dwithin(
        st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
        max_m
      )
      AND (min_m <= 0 OR NOT st_dwithin(
        st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
        min_m
      ))
      AND sp.category IN ('musei', 'museum', 'gallery', 'art_gallery', 'monumenti')
      AND sp.is_gem = true
      AND coalesce(sp.is_hidden, false) = false
      AND coalesce(sp.status, 'verified') NOT IN ('draft', 'rejected', 'needs_revision')
      AND (NOT solo_con_sito OR (sp.contact_website IS NOT NULL AND sp.contact_website ~* '^https?://'))
    ORDER BY
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography
        <-> st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    LIMIT limit_num;
  ELSE
    RETURN QUERY
    SELECT
      sp.id, sp.name, sp.lat, sp.lon, sp.category, sp.contact_website, sp.contact_phone,
      sp.image_url, sp.photo_url, sp.address, sp.city, sp.description_short,
      coalesce(sp.is_gem, false) AS is_gem,
      st_distance(
        st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
      ) AS distanza_m
    FROM public.shared_pois sp
    WHERE st_dwithin(
        st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
        max_m
      )
      AND (min_m <= 0 OR NOT st_dwithin(
        st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
        st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
        min_m
      ))
      AND sp.category IN ('musei', 'museum', 'gallery', 'art_gallery', 'monumenti')
      AND coalesce(sp.is_hidden, false) = false
      AND coalesce(sp.status, 'verified') NOT IN ('draft', 'rejected', 'needs_revision')
      AND (NOT solo_con_sito OR (sp.contact_website IS NOT NULL AND sp.contact_website ~* '^https?://'))
    ORDER BY
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography
        <-> st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    LIMIT limit_num;
  END IF;
END;
$$;

-- Solo il service_role la chiama (rotte server): niente grant ad anon.
REVOKE ALL ON FUNCTION public.musei_vicini_corona(float, float, int, int, int, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.musei_vicini_corona(float, float, int, int, int, boolean, boolean) TO service_role;
