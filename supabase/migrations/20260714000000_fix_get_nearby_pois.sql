-- Migrazione per fixare get_nearby_pois
-- Assicura che i POI arricchiti vengano SEMPRE mostrati per primi
-- e include i campi photo_url e image_url per evitare che appaiano come pin generici.

CREATE OR REPLACE FUNCTION get_nearby_pois(user_lat float, user_lon float, radius_meters int, limit_num int default 150)
RETURNS TABLE (
    id text,
    name text,
    lat float,
    lon float,
    category text,
    status text,
    description_ai text,
    is_gem boolean,
    premium boolean,
    photo_url text,
    image_url text,
    distance_meters float
)
LANGUAGE sql STABLE AS $$
  SELECT 
    id, 
    name,
    lat,
    lon,
    category,
    status,
    description_ai,
    is_gem,
    is_gem as premium,
    photo_url,
    image_url,
    st_distance(st_setsrid(st_makepoint(lon, lat), 4326)::geography, st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography) as distance_meters
  FROM shared_pois
  WHERE 
    st_dwithin(st_setsrid(st_makepoint(lon, lat), 4326)::geography, st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography, radius_meters)
    AND status IN ('verified', 'auto', 'approved', 'draft')
    AND name IS NOT NULL
  ORDER BY 
    -- Priorità assoluta ai POI arricchiti (con foto o descrizione)
    CASE WHEN photo_url IS NOT NULL OR image_url IS NOT NULL OR description_ai IS NOT NULL THEN 0 ELSE 1 END ASC,
    -- Poi ordiniamo per distanza
    distance_meters ASC
  LIMIT limit_num;
$$;
