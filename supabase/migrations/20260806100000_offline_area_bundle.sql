-- MODALITÀ OFFLINE COMPLETA — prerequisiti server per i "pacchetti area".
--
-- Problema: il delta sync dei pacchetti offline confronta updated_at, ma su
-- shared_pois updated_at è scritto SOLO da alcuni percorsi applicativi
-- (server.ts) e mai dalle edge functions (auto-enrich-poi, manager-poi),
-- da batch-teaser, da lock-poi o dagli upsert Overpass. Inoltre le DELETE
-- sono hard: un client offline non può accorgersi che un POI è sparito.
--
-- Questa migration rende updated_at affidabile (trigger), aggiunge le
-- tombstone per le cancellazioni e la RPC paginata che alimenta
-- POST /api/area/bundle.
--
-- NOTA ORDINE: il backfill va fatto PRIMA di creare il trigger, altrimenti
-- il trigger sovrascriverebbe i valori storici con now().

-- ---------------------------------------------------------------------------
-- 1. Backfill updated_at mancanti (solo righe NULL, ~minuti su 1,8M righe)
-- ---------------------------------------------------------------------------
update public.shared_pois
   set updated_at = coalesce(updated_at, enriched_at, created_at, now())
 where updated_at is null;

-- ---------------------------------------------------------------------------
-- 2. Trigger: ogni UPDATE forza updated_at = now(), qualunque sia il client
-- ---------------------------------------------------------------------------
create or replace function public.tg_shared_pois_set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_shared_pois_updated_at on public.shared_pois;
create trigger trg_shared_pois_updated_at
  before update on public.shared_pois
  for each row execute function public.tg_shared_pois_set_updated_at();

-- Indice per il delta sync: where updated_at > $since order by updated_at, id
create index if not exists idx_shared_pois_updated_at
  on public.shared_pois (updated_at, id);

-- ---------------------------------------------------------------------------
-- 3. Tombstone delle cancellazioni (il client offline rimuove i POI spariti)
-- ---------------------------------------------------------------------------
create table if not exists public.shared_pois_tombstones (
  id text primary key,
  deleted_at timestamptz not null default now()
);

create index if not exists idx_shared_pois_tombstones_deleted_at
  on public.shared_pois_tombstones (deleted_at);

alter table public.shared_pois_tombstones enable row level security;

drop policy if exists "tombstones read" on public.shared_pois_tombstones;
create policy "tombstones read" on public.shared_pois_tombstones
  for select using (true);

create or replace function public.tg_shared_pois_tombstone()
returns trigger
language plpgsql security definer as $$
begin
  insert into public.shared_pois_tombstones (id, deleted_at)
  values (old.id, now())
  on conflict (id) do update set deleted_at = now();
  return old;
end $$;

drop trigger if exists trg_shared_pois_tombstone on public.shared_pois;
create trigger trg_shared_pois_tombstone
  after delete on public.shared_pois
  for each row execute function public.tg_shared_pois_tombstone();

-- Se un POI cancellato viene ricreato con lo stesso id, la tombstone decade.
create or replace function public.tg_shared_pois_untombstone()
returns trigger
language plpgsql security definer as $$
begin
  delete from public.shared_pois_tombstones where id = new.id;
  return new;
end $$;

drop trigger if exists trg_shared_pois_untombstone on public.shared_pois;
create trigger trg_shared_pois_untombstone
  after insert on public.shared_pois
  for each row execute function public.tg_shared_pois_untombstone();

-- ---------------------------------------------------------------------------
-- 4. RPC del pacchetto area: POI nel raggio, testi completi per il TTS
--    nativo, paginazione keyset su (updated_at, id), delta con p_since.
--    total_count è ripetuto su ogni riga (window) così la prima pagina
--    basta a dimensionare la progress bar.
-- ---------------------------------------------------------------------------
drop function if exists public.area_bundle_pois(float, float, int, text, timestamptz, timestamptz, text, int);

create or replace function public.area_bundle_pois(
  p_lat float,
  p_lon float,
  p_radius_m int,
  p_lang text default 'it',
  p_since timestamptz default null,
  p_cursor_updated timestamptz default null,
  p_cursor_id text default null,
  p_limit int default 500
)
returns table (
  id text,
  nome text,
  lat float,
  lon float,
  category text,
  poi_type text,
  is_gem boolean,
  status text,
  alert_radius int,
  geofence_radius int,
  teaser_text text,
  description_short text,
  audio_text text,
  updated_at timestamptz,
  total_count bigint
)
language sql stable as $$
  select
    sp.id,
    sp.name as nome,
    sp.lat,
    sp.lon,
    sp.category,
    sp.poi_type,
    coalesce(sp.is_gem, false) as is_gem,
    coalesce(sp.status, 'verified') as status,
    coalesce(sp.alert_radius, 150) as alert_radius,
    coalesce(sp.geofence_radius, 50) as geofence_radius,
    case p_lang
      when 'en' then coalesce(sp.teaser_text_en, sp.teaser_text_it)
      when 'fr' then coalesce(sp.teaser_text_fr, sp.teaser_text_it)
      when 'es' then coalesce(sp.teaser_text_es, sp.teaser_text_it)
      when 'de' then coalesce(sp.teaser_text_de, sp.teaser_text_it)
      when 'ru' then coalesce(sp.teaser_text_ru, sp.teaser_text_it)
      when 'zh' then coalesce(sp.teaser_text_zh, sp.teaser_text_it)
      else sp.teaser_text_it
    end as teaser_text,
    sp.description_short,
    coalesce(sp.audio_script, sp.description_long, sp.description_ai, sp.full_description) as audio_text,
    sp.updated_at,
    count(*) over () as total_count
  from public.shared_pois sp
  where st_dwithin(
          st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
          st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
          p_radius_m
        )
    and coalesce(sp.status, 'verified') in ('verified', 'auto', 'approved', 'draft')
    and (p_since is null or sp.updated_at > p_since)
    and (
          p_cursor_updated is null
          or (sp.updated_at, sp.id) > (p_cursor_updated, p_cursor_id)
        )
  order by sp.updated_at asc, sp.id asc
  limit least(greatest(p_limit, 1), 1000);
$$;

grant execute on function public.area_bundle_pois(float, float, int, text, timestamptz, timestamptz, text, int)
  to anon, authenticated;

analyze public.shared_pois;
