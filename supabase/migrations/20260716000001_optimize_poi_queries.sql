-- 1. Create a PostGIS functional index on shared_pois for lightning-fast spatial queries
CREATE INDEX IF NOT EXISTS idx_shared_pois_geom 
ON public.shared_pois 
USING GIST ( (st_setsrid(st_makepoint(lon, lat), 4326)::geography) );

-- 2. Also create simple B-tree indexes just in case (for sorting or basic filtering)
CREATE INDEX IF NOT EXISTS idx_shared_pois_lat ON public.shared_pois(lat);
CREATE INDEX IF NOT EXISTS idx_shared_pois_lon ON public.shared_pois(lon);
CREATE INDEX IF NOT EXISTS idx_shared_pois_status ON public.shared_pois(status);

-- 3. Rewrite get_pois_within_radius to use shared_pois and PostGIS (much faster!)
CREATE OR REPLACE FUNCTION public.get_pois_within_radius(
  center_lat double precision,
  center_lon double precision,
  radius_km double precision
)
RETURNS TABLE (
  id text,
  name text,
  lat double precision,
  lon double precision,
  category text,
  description text,
  is_gem boolean
)
LANGUAGE sql STABLE
AS $$
  SELECT 
    p.id, 
    p.name, 
    p.lat, 
    p.lon, 
    p.category, 
    COALESCE(p.description_ai, p.description_short) as description, 
    p.is_gem
  FROM public.shared_pois p
  WHERE 
    st_dwithin(
      st_setsrid(st_makepoint(p.lon, p.lat), 4326)::geography, 
      st_setsrid(st_makepoint(center_lon, center_lat), 4326)::geography, 
      radius_km * 1000
    )
    AND p.status IN ('verified', 'auto', 'approved', 'draft');
$$;
