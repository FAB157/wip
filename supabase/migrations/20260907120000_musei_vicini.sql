-- MOSTRE: la lettura dei musei intorno a un punto andava in timeout.
--
-- /api/mostre e /api/mostre/permanenti leggevano shared_pois con un
-- riquadro su lat/lon (lat=gte..&lat=lte..&lon=..) e limit 300-400: su una
-- tabella da milioni di righe quella query non usa l'indice geografico
-- (idx_shared_pois_geog, sull'espressione geography) e Postgres scade.
-- Verificato il 07/09/2026: limit 5 risponde, limit 400 → HTTP 500; a Milano
-- e Firenze la vista Mostre mostrava ZERO musei, e la cella vuota finiva in
-- cache per 12 ore (e il cron la saltava per 7 giorni).
--
-- Stessa lezione di nearby_pois (04/08/2026): una funzione con st_dwithin
-- sull'indice, che restituisce le colonne che servono alla scheda Eventi.

CREATE OR REPLACE FUNCTION public.musei_vicini(
  p_lat float,
  p_lon float,
  radius_m int,
  limit_num int DEFAULT 300,
  solo_con_sito boolean DEFAULT false
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
  distanza_m float
)
LANGUAGE sql STABLE AS $$
  SELECT
    sp.id,
    sp.name,
    sp.lat,
    sp.lon,
    sp.category,
    sp.contact_website,
    sp.contact_phone,
    sp.image_url,
    sp.photo_url,
    sp.address,
    sp.city,
    sp.description_short,
    st_distance(
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    ) AS distanza_m
  FROM public.shared_pois sp
  WHERE st_dwithin(
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
      radius_m
    )
    AND sp.category IN ('musei', 'museum', 'gallery', 'art_gallery', 'monumenti')
    AND coalesce(sp.is_hidden, false) = false
    AND coalesce(sp.status, 'verified') NOT IN ('draft', 'rejected', 'needs_revision')
    AND (NOT solo_con_sito OR (sp.contact_website IS NOT NULL AND sp.contact_website ~* '^https?://'))
  ORDER BY distanza_m ASC
  LIMIT limit_num;
$$;

-- Solo il service_role la chiama (rotte server): niente grant ad anon.
REVOKE ALL ON FUNCTION public.musei_vicini(float, float, int, int, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.musei_vicini(float, float, int, int, boolean) TO service_role;
