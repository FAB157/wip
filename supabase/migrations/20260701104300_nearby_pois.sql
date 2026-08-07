-- Migrazione per la funzione nearby_pois con fallback Overpass API
-- Ottimizzata per Foreground Service Android

create or replace function nearby_pois(p_lat float, p_lon float, radius_m int, limit_num int default 60)
returns table(id text, nome text, lat float, lon float, distanza_m float, source text)
language sql stable as $$
  select id, name as nome,
         lat,
         lon,
         st_distance(st_setsrid(st_makepoint(lon, lat), 4326)::geography, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) as distanza_m,
         coalesce(enrichment_source, 'official') as source
  from shared_pois
  where st_dwithin(st_setsrid(st_makepoint(lon, lat), 4326)::geography, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, radius_m)
  order by distanza_m asc
  limit limit_num;
$$;
