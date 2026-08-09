-- VISIBILITÀ: nearby_pois serviva QUALSIASI riga di shared_pois, compresi i
-- POI status='draft' e is_hidden=true. Nel test in auto dell'8/8/2026 un POI
-- 'draft' allucinato dalla Vision ("Pietà Vaticana… Museo Omero" con le
-- coordinate di Avenza, per giunta is_gem) è arrivato fino alla notifica
-- "Sei arrivato!". I client ora filtrano anche da soli (parsePoiList iOS e
-- Android, poiRepository.ts web), ma il filtro giusto sta qui: meno righe in
-- rete e nessun client dimenticato.
--
-- Stessa firma e stesse colonne di 20260804190000_nearby_pois_fast.sql:
-- cambia solo il WHERE. L'indice geografico resta quello.
--
-- Da applicare a mano (SQL editor Supabase). DDL rapido, nessun indice.

set lock_timeout = '5s';

create or replace function public.nearby_pois(
  p_lat float,
  p_lon float,
  radius_m int,
  limit_num int default 60
)
returns table (
  id text,
  nome text,
  lat float,
  lon float,
  distanza_m float,
  source text,
  category text,
  sub_category text,
  description_short text,
  description_ai text,
  image_url text,
  is_gem boolean,
  status text
)
language sql stable as $$
  select
    sp.id,
    sp.name as nome,
    sp.lat,
    sp.lon,
    st_distance(
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    ) as distanza_m,
    coalesce(sp.enrichment_source, 'official') as source,
    sp.category,
    sp.poi_type as sub_category,
    sp.description_short,
    sp.description_ai,
    coalesce(sp.image_url, sp.photo_url) as image_url,
    coalesce(sp.is_gem, false) as is_gem,
    coalesce(sp.status, 'verified') as status
  from public.shared_pois sp
  where st_dwithin(
    st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
    radius_m
  )
  and coalesce(sp.is_hidden, false) = false
  and coalesce(sp.status, 'verified') not in ('draft', 'needs_revision', 'rejected', 'hidden')
  order by distanza_m asc
  limit limit_num;
$$;

grant execute on function public.nearby_pois(float, float, int, int) to anon, authenticated;
