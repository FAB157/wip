-- Confini delle denominazioni d'origine, dove esistono in forma aperta.
-- 27/08/2026. Una riga per denominazione (id = denominazioni.id), geometria
-- GeoJSON già semplificata (~100 m) e bbox per la query per riquadro senza
-- PostGIS. `qualita`:
--   'ufficiale'  confine pubblicato dall'autorità (USA TTB via UC Davis, CC0)
--   'derivata'   unione dei confini amministrativi dei comuni/regioni
--                collegati su Wikidata: AREA INDICATIVA, non il disciplinare.
-- Fonti in `fonte` (ttb_ava, wikidata_osm, …), sempre con attribuzione.

create table if not exists public.denominazioni_geometrie (
  id text primary key references public.denominazioni(id) on delete cascade,
  fonte text not null,
  qualita text not null check (qualita in ('ufficiale', 'derivata')),
  attribuzione text,
  geom jsonb not null,                 -- GeoJSON Polygon/MultiPolygon, WGS84
  min_lat double precision not null,
  min_lon double precision not null,
  max_lat double precision not null,
  max_lon double precision not null,
  area_kmq double precision,
  updated_at timestamptz not null default now()
);

create index if not exists denominazioni_geometrie_bbox_idx
  on public.denominazioni_geometrie (min_lat, max_lat, min_lon, max_lon);

alter table public.denominazioni_geometrie enable row level security;
drop policy if exists "denominazioni_geometrie lettura pubblica" on public.denominazioni_geometrie;
create policy "denominazioni_geometrie lettura pubblica" on public.denominazioni_geometrie for select using (true);
