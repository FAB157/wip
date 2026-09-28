-- GIST per locali_pois (28/09/2026) — stessa richiesta e stessa logica di
-- 20260927170000_gist_beni_culturali.sql: «velocizza i pin come per gli
-- altri livelli». Tabella a parte (~6,5M righe, Overture Places), oggi con
-- solo btree su (lat) e (sub_category, lat): la chip "Locali" in MapArea.tsx
-- filtra ancora con gte/lte separati su lat e lon, che un GIST da solo NON
-- accelera (serve un operatore spaziale, non un range su due colonne).
-- Qui: aggiungo la colonna geometria + indice GIST + trigger di
-- mantenimento, e una RPC (locali_pois_vicini) che il client deve chiamare
-- al posto della select diretta per beneficiarne davvero.

alter table public.locali_pois add column if not exists geog geography(Point, 4326);
create index if not exists idx_locali_pois_geog on public.locali_pois using gist (geog);

create or replace function public.tg_locali_pois_geog()
returns trigger language plpgsql as $$
begin
  if new.lat is not null and new.lon is not null then
    new.geog := st_setsrid(st_makepoint(new.lon, new.lat), 4326)::geography;
  else
    new.geog := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_locali_pois_geog on public.locali_pois;
create trigger trg_locali_pois_geog
  before insert or update of lat, lon
  on public.locali_pois
  for each row execute function public.tg_locali_pois_geog();

-- RPC: stesso compromesso di beni_culturali_vicini (sovra-campiona con GIST,
-- poi applica l'ordine che il client usava — qui "confidence desc" — SOLO
-- sul campione). language plpgsql + EXECUTE...USING fin da subito: un piano
-- generico puo' ignorare il GIST quando la selettivita' di sub_category
-- varia molto da chiamata a chiamata.
create or replace function public.locali_pois_vicini(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_sub_category text[] default null, p_limit integer default 400
)
returns table(id text, name text, lat double precision, lon double precision, sub_category text,
              cucina text, brand text, address text, city text, website text, phone text,
              socials jsonb, operating_status text, confidence double precision)
language plpgsql stable
set statement_timeout to '10s'
as $$
begin
  return query execute
    'with candidati as (
       select lp.id, lp.name, lp.lat, lp.lon, lp.sub_category, lp.cucina, lp.brand, lp.address,
         lp.city, lp.website, lp.phone, lp.socials, lp.operating_status, lp.confidence
       from public.locali_pois lp
       where lp.geog is not null
         and st_intersects(lp.geog, st_makeenvelope($2,$1,$4,$3,4326)::geography)
         and (lp.operating_status is null or lp.operating_status <> ''closed'')
         and ($5 is null or lp.sub_category = any($5))
       limit greatest($6,1) * 6
     )
     select * from candidati order by confidence desc nulls last limit greatest($6,1)'
  using p_south, p_west, p_north, p_east, p_sub_category, p_limit;
end;
$$;
grant execute on function public.locali_pois_vicini(float8, float8, float8, float8, text[], integer) to anon, authenticated;
