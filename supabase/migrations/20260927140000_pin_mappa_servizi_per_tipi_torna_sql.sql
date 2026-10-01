-- FIX 3 (27/09/2026): `pin_mappa_servizi_per_tipi` in `language sql` (CTE,
-- migration 20260927120000) misurava 60-92ms — nessun problema di piano
-- generico per questa (la lista di categorie/poi_type ha selettività più
-- uniforme di una singola categoria come 'shopping'). Riscritta in
-- `plpgsql`/EXECUTE per lo stesso motivo di `per_categoria` (20260927130000),
-- è invece PEGGIORATA a 6-7s: ripianificare da zero ad ogni chiamata costa
-- più di quanto risolva quando il piano generico era già buono. Si torna
-- alla versione SQL/CTE per questa funzione; `per_categoria` resta plpgsql.

create or replace function public.pin_mappa_servizi_per_tipi(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_categorie text[], p_limit integer default 400
)
returns table(id text, nome text, lat float8, lon float8, category text, sub_category text, image_url text,
              description_short text, contact_website text, contact_phone text)
language sql stable
set statement_timeout to '10s'
as $$
  with candidati as (
    select pm.id, pm.nome, pm.lat, pm.lon, pm.category, pm.sub_category, pm.image_url,
      pm.description_short, pm.contact_website, pm.contact_phone
    from public.pin_mappa_servizi pm
    where (pm.category = any(p_categorie) or pm.sub_category = any(p_categorie))
      and st_intersects(pm.geog, st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography)
    limit greatest(coalesce(p_limit, 400), 1)
  )
  select * from candidati;
$$;
grant execute on function public.pin_mappa_servizi_per_tipi(float8, float8, float8, float8, text[], integer) to anon, authenticated;
