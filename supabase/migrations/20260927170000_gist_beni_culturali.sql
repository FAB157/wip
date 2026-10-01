-- GIST per beni_culturali (27/09/2026) — «velocizza i pin come per le altre
-- categorie». Tabella a parte (Atlante beni vincolati, ~1,78M righe), oggi
-- con solo un indice btree su (lat, lon): stessa query a griglia che
-- shared_pois usava prima di pin_mappa. Qui NON creo una tabella nuova (i
-- dati sono già dove devono stare, è un layer informativo a sé) — aggiungo
-- solo la colonna geometria e l'indice, e una RPC.
--
-- ATTENZIONE all'ordinamento: a differenza delle RPC di oggi dove
-- `order by id` serviva solo a dare stabilità, qui `order by tier, id` è
-- lo stesso ordinamento che il client usava — SERVE a decidere QUALI beni
-- vincono il taglio (i turistici di fascia A prima dei protetti non
-- visitabili di fascia C: senza, una città densa di vincoli minori
-- riempiva i 400 posti di case a schiera e nessun monumento restava).
-- Non si può quindi ordinare "dopo" un taglio spaziale arbitrario come per
-- le altre RPC: si sovra-campiona con GIST (limite × 6) e SOLO sul
-- campione si applica l'ordine tier/id — un compromesso già usato da
-- `nearby_pois_map_v2` (pin_mappa) per lo stesso motivo.
-- `language plpgsql` + `EXECUTE...USING` fin da subito (non `language sql`):
-- la lezione di oggi (pin_mappa_servizi_per_categoria) è che un piano
-- generico può ignorare l'indice GIST quando la selettività del filtro
-- varia molto da chiamata a chiamata — qui `p_fasce` è esattamente quel
-- tipo di parametro.

alter table public.beni_culturali add column if not exists geog geography(Point, 4326);
update public.beni_culturali
  set geog = st_setsrid(st_makepoint(lon, lat), 4326)::geography
  where geog is null and lat is not null and lon is not null;
create index if not exists idx_beni_culturali_geog on public.beni_culturali using gist (geog);

create or replace function public.tg_beni_culturali_geog()
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
drop trigger if exists trg_beni_culturali_geog on public.beni_culturali;
create trigger trg_beni_culturali_geog
  before insert or update of lat, lon
  on public.beni_culturali
  for each row execute function public.tg_beni_culturali_geog();

create or replace function public.beni_culturali_vicini(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_fasce text[] default null, p_limit integer default 400
)
returns table(id uuid, name text, lat float8, lon float8, tier text, category_wip text, typology text,
              comune text, address text, description text, promoted_poi_id text, matched_poi_id text,
              wikidata_id text, geocode_source text, image_url text, image_attribution text, catalog_url text)
language plpgsql stable
set statement_timeout to '10s'
as $$
begin
  return query execute
    'with candidati as (
       select bc.id, bc.name, bc.lat, bc.lon, bc.tier, bc.category_wip, bc.typology, bc.comune, bc.address,
         bc.description, bc.promoted_poi_id, bc.matched_poi_id, bc.wikidata_id, bc.geocode_source,
         bc.image_url, bc.image_attribution, bc.catalog_url
       from public.beni_culturali bc
       where bc.name is not null and bc.geog is not null
         and st_intersects(bc.geog, st_makeenvelope($2,$1,$4,$3,4326)::geography)
         and ($5 is null or bc.tier = any($5))
       limit greatest($6,1) * 6
     )
     select * from candidati order by tier asc, id asc limit greatest($6,1)'
  using p_south, p_west, p_north, p_east, p_fasce, p_limit;
end;
$$;
grant execute on function public.beni_culturali_vicini(float8, float8, float8, float8, text[], integer) to anon, authenticated;
