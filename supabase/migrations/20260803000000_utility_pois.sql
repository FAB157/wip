-- Migrazione per tabella utility_pois (separata da shared_pois per categorie non storiche)

CREATE TABLE IF NOT EXISTS public.utility_pois (
    id text PRIMARY KEY,
    name text NOT NULL,
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    category text,
    sub_category text,
    source text,
    foursquare_id text,
    rating double precision,
    user_ratings_total integer,
    photo_url text,
    image_url text,
    status text DEFAULT 'verified',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index per ricerca spaziale (PostGIS)
CREATE INDEX IF NOT EXISTS utility_pois_geo_idx 
ON public.utility_pois USING gist (st_setsrid(st_makepoint(lon, lat), 4326));

CREATE INDEX IF NOT EXISTS utility_pois_category_idx 
ON public.utility_pois (category);

-- RPC per fetching utility_pois
CREATE OR REPLACE FUNCTION get_utility_pois(user_lat float, user_lon float, radius_meters int, limit_num int default 150)
RETURNS TABLE (
    id text,
    name text,
    lat float,
    lon float,
    category text,
    sub_category text,
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
    sub_category,
    photo_url,
    image_url,
    st_distance(st_setsrid(st_makepoint(lon, lat), 4326)::geography, st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography) as distance_meters
  FROM utility_pois
  WHERE 
    st_dwithin(st_setsrid(st_makepoint(lon, lat), 4326)::geography, st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography, radius_meters)
    AND status IN ('verified', 'auto')
    AND name IS NOT NULL
  ORDER BY 
    distance_meters ASC
  LIMIT limit_num;
$$;
