-- PRESTAZIONI: shared_pois ha ~1,8 milioni di righe. La funzione calcolava
-- st_setsrid(st_makepoint(lon, lat)) per OGNI riga a ogni chiamata: nessun
-- indice era utilizzabile, quindi Postgres scansionava l'intera tabella.
-- Risultato: nelle aree dense (Firenze, Roma) la query superava il tempo
-- massimo e la mappa restava VUOTA con errore 500 (statement timeout).
--
-- Due interventi:
--   1) indice geografico sull'espressione usata dal filtro;
--   2) funzione riscritta con le colonne reali (niente to_jsonb per riga, che
--      serializzava l'intera riga — descrizioni lunghe incluse — per ogni
--      record esaminato).
--
-- `sub_category` non esiste in questa tabella: il campo reale è `poi_type`.
--
-- NOTA: la creazione dell'indice su 1,8M di righe richiede qualche minuto e
-- blocca le SCRITTURE su shared_pois (le letture proseguono normalmente).

-- 1. Indice geospaziale — è questo che elimina il timeout
create index if not exists idx_shared_pois_geog
  on public.shared_pois
  using gist ((st_setsrid(st_makepoint(lon, lat), 4326)::geography));

-- 2. Funzione ottimizzata
drop function if exists public.nearby_pois(float, float, int, int);

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
  order by distanza_m asc
  limit limit_num;
$$;

grant execute on function public.nearby_pois(float, float, int, int) to anon, authenticated;

-- Aiuta il pianificatore a usare subito il nuovo indice
analyze public.shared_pois;
