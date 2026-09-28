-- PIN MAPPA — SCAMBIO (25/09/2026): nearby_pois_map legge dalla tabella leggera.
-- Da eseguire SOLO a riempimento mondiale completo (pin_mappa_riempimento copre tutte le celle).
-- La vecchia resta come nearby_pois_map_da_shared_pois: ritorno indietro = i due rename al contrario.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'nearby_pois_map_da_shared_pois') then
    alter function public.nearby_pois_map(float8, float8, integer, integer, text) rename to nearby_pois_map_da_shared_pois;
  end if;
end $$;

create or replace function public.nearby_pois_map(p_lat float8, p_lon float8, radius_m integer, limit_num integer default 500, p_lang text default 'it')
returns table(id text, nome text, lat float8, lon float8, distanza_m float8, category text, sub_category text, image_url text,
              is_gem boolean, status text, description_short text, teaser text)
language sql stable
set statement_timeout to '25s'
as $$
  select * from public.nearby_pois_map_v2(p_lat, p_lon, radius_m, limit_num, p_lang);
$$;
grant execute on function public.nearby_pois_map(float8, float8, integer, integer, text) to anon, authenticated;

-- Ritorno indietro (commentato):
-- drop function public.nearby_pois_map(float8, float8, integer, integer, text);
-- alter function public.nearby_pois_map_da_shared_pois(float8, float8, integer, integer, text) rename to nearby_pois_map;
