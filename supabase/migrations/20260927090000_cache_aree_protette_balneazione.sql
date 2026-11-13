-- CACHE AREE PROTETTE + BALNEAZIONE (27/09/2026) — «le aree sono troppo lente».
--
-- Perché: `fetchAreeProtette` (src/lib/areeProtette.ts) e `fetchBathingSites`
-- (src/lib/bathingWater.ts) chiamano dal vivo i servizi ArcGIS REST
-- dell'EEA (Agenzia Europea dell'Ambiente) a OGNI apertura del livello: un
-- round-trip verso un server europeo, lento per natura e a volte
-- congestionato. A differenza delle zone di denominazione del gusto (che
-- leggono già una NOSTRA tabella, `denominazioni_geometrie`, via
-- /api/denominazioni/aree), qui non c'era alcuna copia locale.
--
-- Le due fonti cambiano di rado (i confini Natura2000/CDDA quasi mai, la
-- classificazione di balneazione una volta l'anno): si scaricano UNA volta,
-- si tengono in casa, si leggono con un indice spaziale in ~50 ms invece di
-- aspettare l'ArcGIS REST europeo. Stesso modello di `pin_mappa`
-- (migration 20260925120000): tabella leggera + GIST + RPC di lettura;
-- il client resta cache-first con ripiego sul fetch live finché lo script
-- di riempimento non ha coperto una zona (vedi in fondo).
--
-- Passi: 1) questa migration (tabelle + RPC, nessun effetto sull'app finché
--           il client non le chiama); 2) riempimento (scratch/aree-cache/
--           riempi-aree-protette.mjs, riempi-balneazione.mjs, un giro
--           dell'Europa via griglia di celle, come pin_mappa); 3) il client
--           (areeProtette.ts, bathingWater.ts) prova prima l'RPC, e se
--           vuota ripiega sul fetch EEA live com'era prima — nessuna rottura
--           mentre il riempimento è in corso.
-- Ritorno indietro: il client smette di chiamare le RPC (torna al fetch
-- live puro) e si fa DROP TABLE delle due cache.

-- ── Aree protette (Natura 2000 + CDDA nazionali) — poligoni ───────────────
create table if not exists public.aree_protette_cache (
  id text primary key,                 -- 'n2k-<SITECODE>' | 'cdda-<cddaId>'
  tipo text not null,                  -- 'n2k_habitat' | 'n2k_uccelli' | 'nazionale'
  codice text not null,
  nome text,
  kmq numeric,
  iucn text,
  designazione text,
  paese text,
  geom geometry(Geometry, 4326) not null,
  aggiornato_il timestamptz not null default now()
);
comment on table public.aree_protette_cache is
  'Copia locale dei confini Natura2000/CDDA (EEA ArcGIS), per non chiamare il servizio europeo ad ogni apertura del livello. Vedi migration 20260927090000.';

create index if not exists idx_aree_protette_cache_geom on public.aree_protette_cache using gist (geom);
create index if not exists idx_aree_protette_cache_tipo on public.aree_protette_cache (tipo);

alter table public.aree_protette_cache enable row level security;
drop policy if exists aree_protette_cache_lettura on public.aree_protette_cache;
create policy aree_protette_cache_lettura on public.aree_protette_cache for select using (true);
grant select on public.aree_protette_cache to anon, authenticated;

-- Riquadro (WGS84) → poligoni che lo intersecano. `p_semplifica_m` degrada la
-- geometria in lettura (già `ST_SimplifyPreserveTopology`, non tocca la riga
-- salvata): a zoom lontano non serve la stessa precisione del sopralluogo.
create or replace function public.aree_protette_vicine(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_semplifica_m float8 default 0, p_limit integer default 200
)
returns table(id text, tipo text, codice text, nome text, kmq numeric, iucn text, designazione text, paese text, geometria text)
language sql stable
set statement_timeout to '10s'
as $$
  select a.id, a.tipo, a.codice, a.nome, a.kmq, a.iucn, a.designazione, a.paese,
    st_asgeojson(
      case when p_semplifica_m > 0
        then st_simplifypreservetopology(a.geom, p_semplifica_m / 111320.0)
        else a.geom
      end
    ) as geometria
  from public.aree_protette_cache a
  where st_intersects(a.geom, st_makeenvelope(p_west, p_south, p_east, p_north, 4326))
  order by coalesce(a.kmq, 0) asc
  limit greatest(coalesce(p_limit, 200), 1);
$$;
grant execute on function public.aree_protette_vicine(float8, float8, float8, float8, float8, integer) to anon, authenticated;

-- ── Balneazione EEA — punti (la classificazione annuale, non le misure dal
-- vivo di temperatura/onde, che restano chieste al volo all'apertura del
-- popup: quelle CAMBIANO in tempo reale e non si mettono in cache) ────────
create table if not exists public.balneazione_cache (
  id text primary key,                 -- id sito EEA (bathingWaterId o simile)
  nome text,
  lat float8 not null,
  lon float8 not null,
  geog geography(Point, 4326) not null,
  qualita text not null default 'unknown',   -- excellent|good|sufficient|poor|unknown
  stagione integer not null,                 -- anno della classificazione
  aggiornato_il timestamptz not null default now()
);
comment on table public.balneazione_cache is
  'Copia locale della classificazione EEA/WISE Bathing Water (nome/posizione/classe/anno). Temperatura e onde restano dal vivo. Vedi migration 20260927090000.';

create index if not exists idx_balneazione_cache_geog on public.balneazione_cache using gist (geog);

alter table public.balneazione_cache enable row level security;
drop policy if exists balneazione_cache_lettura on public.balneazione_cache;
create policy balneazione_cache_lettura on public.balneazione_cache for select using (true);
grant select on public.balneazione_cache to anon, authenticated;

create or replace function public.balneazione_vicina(
  p_south float8, p_west float8, p_north float8, p_east float8, p_limit integer default 300
)
returns table(id text, nome text, lat float8, lon float8, qualita text, stagione integer)
language sql stable
set statement_timeout to '10s'
as $$
  select b.id, b.nome, b.lat, b.lon, b.qualita, b.stagione
  from public.balneazione_cache b
  where st_intersects(b.geog::geometry, st_makeenvelope(p_west, p_south, p_east, p_north, 4326))
  limit greatest(coalesce(p_limit, 300), 1);
$$;
grant execute on function public.balneazione_vicina(float8, float8, float8, float8, integer) to anon, authenticated;
