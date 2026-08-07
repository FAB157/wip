-- Migrazione per la funzione di ricerca POI entro un raggio (necessaria per offline maps)
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
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id, 
    p.name, 
    p.lat, 
    p.lon, 
    p.category, 
    p.description, 
    p.is_gem
  FROM public.pois p
  WHERE (
    6371 * acos(
      cos(radians(center_lat)) * cos(radians(p.lat)) *
      cos(radians(p.lon) - radians(center_lon)) +
      sin(radians(center_lat)) * sin(radians(p.lat))
    )
  ) <= radius_km;
END;
$$;
