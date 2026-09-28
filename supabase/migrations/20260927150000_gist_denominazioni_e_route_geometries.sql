-- GIST per denominazioni_geometrie e route_geometries (27/09/2026).
--
-- Entrambe filtrano oggi per riquadro con 4 colonne separate
-- (min_lat/max_lat/min_lon/max_lon) e un indice btree composito — la
-- stessa tecnica usata da shared_pois prima di pin_mappa. Nessuna delle
-- due chiama un servizio esterno (sono già «cache nostra»), ma un indice
-- GIST su una geometria bbox è più efficiente di 4 colonne btree per
-- l'overlap spaziale, soprattutto quando il riquadro cercato è grande
-- (zoom lontano). Si aggiunge una colonna bbox derivata (non serve
-- decodificare le polyline o i poligoni GeoJSON: l'overlap che si fa oggi
-- è già bbox-contro-bbox, quindi un rettangolo GIST basta) e si mantiene
-- da un trigger.
--
-- Lezione del pomeriggio (pin_mappa_servizi): con poche decine di migliaia
-- di righe (non milioni) il rischio di un piano generico pessimo è basso,
-- ma le nuove RPC vanno comunque misurate prima di considerarle a posto.

-- ── denominazioni_geometrie ────────────────────────────────────────────
alter table public.denominazioni_geometrie add column if not exists bbox geometry(Polygon, 4326);
update public.denominazioni_geometrie
  set bbox = st_makeenvelope(min_lon, min_lat, max_lon, max_lat, 4326)
  where bbox is null;
alter table public.denominazioni_geometrie alter column bbox set not null;
create index if not exists idx_denominazioni_geometrie_bbox_gist on public.denominazioni_geometrie using gist (bbox);

create or replace function public.tg_denominazioni_geometrie_bbox()
returns trigger language plpgsql as $$
begin
  new.bbox := st_makeenvelope(new.min_lon, new.min_lat, new.max_lon, new.max_lat, 4326);
  return new;
end;
$$;
drop trigger if exists trg_denominazioni_geometrie_bbox on public.denominazioni_geometrie;
create trigger trg_denominazioni_geometrie_bbox
  before insert or update of min_lat, min_lon, max_lat, max_lon
  on public.denominazioni_geometrie
  for each row execute function public.tg_denominazioni_geometrie_bbox();

create or replace function public.denominazioni_vicine(
  p_south float8, p_west float8, p_north float8, p_east float8, p_limit integer default 40
)
returns table(id text, fonte text, qualita text, attribuzione text, geom jsonb, area_kmq double precision,
              nome text, tipo text, prodotto text, paese text, url text)
language sql stable
set statement_timeout to '10s'
as $$
  with candidati as (
    select dg.id, dg.fonte, dg.qualita, dg.attribuzione, dg.geom, dg.area_kmq
    from public.denominazioni_geometrie dg
    where st_intersects(dg.bbox, st_makeenvelope(p_west, p_south, p_east, p_north, 4326))
    order by dg.area_kmq asc
    limit greatest(coalesce(p_limit, 40), 1)
  )
  select c.*, d.nome, d.tipo, d.prodotto, d.paese, d.url
  from candidati c join public.denominazioni d on d.id = c.id;
$$;
grant execute on function public.denominazioni_vicine(float8, float8, float8, float8, integer) to anon, authenticated;

-- ── route_geometries ───────────────────────────────────────────────────
alter table public.route_geometries add column if not exists bbox geometry(Polygon, 4326);
update public.route_geometries
  set bbox = st_makeenvelope(min_lon, min_lat, max_lon, max_lat, 4326)
  where bbox is null;
alter table public.route_geometries alter column bbox set not null;
create index if not exists idx_route_geometries_bbox_gist on public.route_geometries using gist (bbox);

create or replace function public.tg_route_geometries_bbox()
returns trigger language plpgsql as $$
begin
  new.bbox := st_makeenvelope(new.min_lon, new.min_lat, new.max_lon, new.max_lat, 4326);
  return new;
end;
$$;
drop trigger if exists trg_route_geometries_bbox on public.route_geometries;
create trigger trg_route_geometries_bbox
  before insert or update of min_lat, min_lon, max_lat, max_lon
  on public.route_geometries
  for each row execute function public.tg_route_geometries_bbox();

-- Stessa forma di fetchRouteLines (routeLines.ts): kind IN (...), la sola
-- colonna `line_regionale` quando serve la scala grossolana, ordinate per
-- lunghezza decrescente (i grandi tracciati prima, se il limite taglia).
create or replace function public.route_geometries_vicine(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_kinds text[], p_solo_regionale boolean default false, p_limit integer default 150
)
returns table(poi_id text, kind text, profile text, line text, line_regionale text, length_km numeric, stops jsonb)
language sql stable
set statement_timeout to '10s'
as $$
  with candidati as (
    select rg.poi_id, rg.kind, rg.profile, rg.line, rg.line_regionale, rg.length_km, rg.stops, rg.length_km as lk
    from public.route_geometries rg
    where rg.kind = any(p_kinds)
      and (not p_solo_regionale or rg.line_regionale is not null)
      and st_intersects(rg.bbox, st_makeenvelope(p_west, p_south, p_east, p_north, 4326))
    limit greatest(coalesce(p_limit, 150), 1) * 3
  )
  select poi_id, kind, profile, line, line_regionale, length_km, stops
  from candidati
  order by lk desc nulls last
  limit greatest(coalesce(p_limit, 150), 1);
$$;
grant execute on function public.route_geometries_vicine(float8, float8, float8, float8, text[], boolean, integer) to anon, authenticated;
