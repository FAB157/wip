-- FIX (27/09/2026): `pin_mappa_servizi_per_categoria` misurata a 21-24 SECONDI
-- invece di ~100ms (Toscana, categoria 'shopping'). Causa: `order by pm.id`
-- prima del `limit` costringe Postgres a scandire la tabella nell'ordine
-- della chiave primaria invece di usare l'indice GIST su `geog` — con
-- 9,48M di righe e una categoria rara in un riquadro piccolo, lo scan
-- nell'ordine sbagliato deve attraversare gran parte della tabella prima
-- di trovare abbastanza righe che soddisfano il filtro.
--
-- Stesso errore che `nearby_pois_map_v2` (migration 20260925120000, su
-- pin_mappa) NON fa: lì il CTE `candidati` applica prima il filtro
-- spaziale (con `limit`, senza `order by` che lo comprometta) e SOLO DOPO,
-- su un risultato già piccolo, ordina. Qui si applica la stessa struttura.

create or replace function public.pin_mappa_servizi_per_categoria(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_category text, p_sub_categories text[] default null, p_limit integer default 200
)
returns table(id text, nome text, lat float8, lon float8, sub_category text, image_url text,
              description_short text, contact_website text, contact_phone text)
language sql stable
set statement_timeout to '10s'
as $$
  with candidati as (
    select pm.id, pm.nome, pm.lat, pm.lon, pm.sub_category, pm.image_url,
      pm.description_short, pm.contact_website, pm.contact_phone
    from public.pin_mappa_servizi pm
    where (p_category is null or pm.category = p_category)
      and (p_sub_categories is null or pm.sub_category = any(p_sub_categories))
      and st_intersects(pm.geog, st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography)
    limit greatest(coalesce(p_limit, 200), 1)
  )
  select * from candidati order by id;
$$;
grant execute on function public.pin_mappa_servizi_per_categoria(float8, float8, float8, float8, text, text[], integer) to anon, authenticated;

-- Stessa forma per `pin_mappa_servizi_per_tipi`: oggi non ha `order by` (per
-- questo è già veloce), ma la si riscrive con lo stesso CTE per sicurezza
-- futura — se un domani qualcuno aggiunge un ordinamento, lo farà sul
-- risultato già piccolo, non sulla tabella intera.
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
