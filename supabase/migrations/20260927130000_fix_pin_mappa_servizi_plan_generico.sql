-- FIX 2 (27/09/2026): la riscrittura col CTE (20260927120000) non è bastata —
-- misurato ANCORA 19-40 secondi. `EXPLAIN` sulla CHIAMATA alla funzione mostra
-- un `Function Scan` che legge da solo ~34.000 pagine (~268 MB, quasi 40s di
-- I/O), mentre la STESSA query eseguita fuori dalla funzione (stessi parametri,
-- stessi valori) legge ~2.500-3.000 pagine e finisce in ~1,6-1,9s.
--
-- Causa: una funzione `language sql stable` viene pianificata dai motori SPI
-- con un piano GENERICO (non conosce il valore reale di `p_category` al
-- momento di scegliere il piano), mentre la stessa query lanciata come SQL
-- diretto (anche parametrizzata) viene pianificata sui valori REALI. Per una
-- colonna con selettività molto diversa da una categoria all'altra (gusto,
-- shopping, lusso...) il piano generico può risultare molto peggiore.
--
-- Fix: `language plpgsql` con `EXECUTE ... USING` (SQL dinamico) — forza una
-- pianificazione fresca, sui valori reali, ad ogni chiamata. Costa qualche
-- decimo di millisecondo di pianificazione in più, trascurabile rispetto al
-- guadagno.

create or replace function public.pin_mappa_servizi_per_categoria(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_category text, p_sub_categories text[] default null, p_limit integer default 200
)
returns table(id text, nome text, lat float8, lon float8, sub_category text, image_url text,
              description_short text, contact_website text, contact_phone text)
language plpgsql stable
set statement_timeout to '10s'
as $$
begin
  return query execute
    'select pm.id, pm.nome, pm.lat, pm.lon, pm.sub_category, pm.image_url,
       pm.description_short, pm.contact_website, pm.contact_phone
     from public.pin_mappa_servizi pm
     where ($5 is null or pm.category = $5)
       and ($6 is null or pm.sub_category = any($6))
       and st_intersects(pm.geog, st_makeenvelope($2,$1,$4,$3,4326)::geography)
     order by pm.id
     limit greatest(coalesce($7, 200), 1)'
  using p_south, p_west, p_north, p_east, p_category, p_sub_categories, p_limit;
end;
$$;
grant execute on function public.pin_mappa_servizi_per_categoria(float8, float8, float8, float8, text, text[], integer) to anon, authenticated;

create or replace function public.pin_mappa_servizi_per_tipi(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_categorie text[], p_limit integer default 400
)
returns table(id text, nome text, lat float8, lon float8, category text, sub_category text, image_url text,
              description_short text, contact_website text, contact_phone text)
language plpgsql stable
set statement_timeout to '10s'
as $$
begin
  return query execute
    'select pm.id, pm.nome, pm.lat, pm.lon, pm.category, pm.sub_category, pm.image_url,
       pm.description_short, pm.contact_website, pm.contact_phone
     from public.pin_mappa_servizi pm
     where (pm.category = any($5) or pm.sub_category = any($5))
       and st_intersects(pm.geog, st_makeenvelope($2,$1,$4,$3,4326)::geography)
     limit greatest(coalesce($6, 400), 1)'
  using p_south, p_west, p_north, p_east, p_categorie, p_limit;
end;
$$;
grant execute on function public.pin_mappa_servizi_per_tipi(float8, float8, float8, float8, text[], integer) to anon, authenticated;
