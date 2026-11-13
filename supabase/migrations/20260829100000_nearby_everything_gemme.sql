-- nearby_everything: le GEMME in un gruppo proprio (29/08/2026).
--
-- Con le gemme v2 (attrazione principale della zona, qualsiasi categoria)
-- il pannello "Tutto nel raggio" deve aprirsi con le gemme: prima la RPC non
-- restituiva is_gem e una gemma stava in mezzo alla sua categoria. Qui:
--   · nuova colonna in uscita `is_gem`;
--   · group_key = 'gemme' per le righe con is_gem (conteggio e tetto per
--     gruppo calcolati nel database, come per gli altri gruppi).
-- Tutto il resto è identico a 20260827120000_nearby_everything.sql.

set lock_timeout = '5s';

drop function if exists public.nearby_everything(double precision, double precision, integer, integer);

create or replace function public.nearby_everything(
  p_lat double precision,
  p_lon double precision,
  p_radius_m integer,
  p_per_group_limit integer default 50
)
returns table(
  id text,
  name text,
  lat double precision,
  lon double precision,
  category text,
  sub_category text,
  image_url text,
  distanza_m double precision,
  fonte text,
  group_key text,
  group_count bigint,
  is_gem boolean
)
language sql stable
set statement_timeout = '20000'
as $$
  with punto as (
    select st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography as g
  ),
  bbox as (
    select
      p_lat - (p_radius_m / 111000.0) as min_lat,
      p_lat + (p_radius_m / 111000.0) as max_lat,
      p_lon - (p_radius_m / 111000.0 / greatest(cos(radians(p_lat)), 0.2)) as min_lon,
      p_lon + (p_radius_m / 111000.0 / greatest(cos(radians(p_lat)), 0.2)) as max_lon
  ),
  da_shared as (
    select
      sp.id, sp.name, sp.lat, sp.lon,
      sp.category, sp.poi_type as sub_category, coalesce(sp.image_url, sp.photo_url) as image_url,
      st_distance(st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography, punto.g) as distanza_m,
      'shared_pois'::text as fonte,
      case when sp.is_gem is true then 'gemme'::text else sp.category end as group_key,
      coalesce(sp.is_gem, false) as is_gem
    from public.shared_pois sp, punto
    where st_dwithin(st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography, punto.g, p_radius_m)
      and sp.is_hidden is not true
      and coalesce(sp.status, 'verified') not in ('draft', 'needs_revision', 'rejected', 'hidden')
      and not public.is_generic_poi_name(sp.name)
  ),
  da_utility as (
    select
      up.id, up.name, up.lat, up.lon,
      up.category, up.sub_category, null::text as image_url,
      st_distance(st_setsrid(st_makepoint(up.lon, up.lat), 4326)::geography, punto.g) as distanza_m,
      'utility_pois'::text as fonte,
      coalesce(up.category, 'utilita') as group_key,
      false as is_gem
    from public.utility_pois up, punto
    where st_dwithin(st_setsrid(st_makepoint(up.lon, up.lat), 4326)::geography, punto.g, p_radius_m)
  ),
  da_beni as (
    select
      bc.id::text as id, bc.name, bc.lat, bc.lon,
      'beni_culturali'::text as category, bc.typology as sub_category, bc.image_url,
      st_distance(st_setsrid(st_makepoint(bc.lon, bc.lat), 4326)::geography, punto.g) as distanza_m,
      'beni_culturali'::text as fonte,
      'beni_culturali'::text as group_key,
      false as is_gem
    from public.beni_culturali bc, punto, bbox
    where bc.lat between bbox.min_lat and bbox.max_lat
      and bc.lon between bbox.min_lon and bbox.max_lon
      and st_dwithin(st_setsrid(st_makepoint(bc.lon, bc.lat), 4326)::geography, punto.g, p_radius_m)
  ),
  da_percorsi as (
    select
      rg.poi_id as id,
      coalesce(sp2.name, rg.poi_id) as name,
      (rg.min_lat + rg.max_lat) / 2 as lat,
      (rg.min_lon + rg.max_lon) / 2 as lon,
      coalesce(sp2.category, rg.kind) as category,
      rg.profile as sub_category,
      sp2.image_url,
      st_distance(
        st_setsrid(st_makepoint((rg.min_lon + rg.max_lon) / 2, (rg.min_lat + rg.max_lat) / 2), 4326)::geography,
        punto.g
      ) as distanza_m,
      'route_geometries'::text as fonte,
      'percorsi_' || rg.kind as group_key,
      coalesce(sp2.is_gem, false) as is_gem
    from public.route_geometries rg
    left join public.shared_pois sp2 on sp2.id = rg.poi_id
    cross join punto, bbox
    where rg.min_lat <= bbox.max_lat and rg.max_lat >= bbox.min_lat
      and rg.min_lon <= bbox.max_lon and rg.max_lon >= bbox.min_lon
  ),
  tutti as (
    select * from da_shared
    union all select * from da_utility
    union all select * from da_beni
    union all select * from da_percorsi
  ),
  numerati as (
    select
      tutti.*,
      row_number() over (partition by group_key order by distanza_m) as rn,
      count(*) over (partition by group_key) as group_count
    from tutti
  )
  select id, name, lat, lon, category, sub_category, image_url, distanza_m, fonte, group_key, group_count, is_gem
  from numerati
  where rn <= p_per_group_limit
  order by group_key, distanza_m;
$$;

revoke all on function public.nearby_everything(double precision, double precision, integer, integer) from public;
grant execute on function public.nearby_everything(double precision, double precision, integer, integer) to anon, authenticated, service_role;
