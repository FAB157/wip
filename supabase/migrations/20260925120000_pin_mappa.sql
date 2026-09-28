-- PIN MAPPA (25/09/2026): tabella leggera per i puntini della mappa.
--
-- Perché: `nearby_pois_map` leggeva 500 pin sparsi in `shared_pois` (9,6 milioni di
-- righe, 4,9 GB di heap + indici): la PRIMA apertura di una zona costava 3-5 s di
-- letture casuali dal disco (misurato il 25/09 su Firenze, Roma, Parigi, New York),
-- le successive 0,1-0,3 s. Qui le sole colonne dei pin (~600 MB), scritte in ordine
-- di geohash così i pin di una città stanno su pagine contigue, e un trigger su
-- shared_pois che tiene la copia aggiornata (solo sulle colonne che contano).
--
-- Passi: 1) questa migration (tabella, trigger, funzione v2: nessun effetto sull'app);
--        2) riempimento a celle di notte (scratch/pin-mappa/riempi-pin-mappa.cjs);
--        3) scambio: nearby_pois_map → legge da pin_mappa (in fondo, commentato).
-- Ritorno indietro: ripristinare la funzione vecchia (nearby_pois_map_da_shared_pois)
-- e DROP TABLE pin_mappa. Radar, geofence, schede e servizio nativo NON passano di qui.

create table if not exists public.pin_mappa (
  id text primary key,
  lat float8 not null,
  lon float8 not null,
  geog geography(Point, 4326) not null,
  nome text,
  category text,
  sub_category text,
  image_url text,
  is_gem boolean not null default false,
  status text not null default 'verified',
  description_short text,
  teaser_it text, teaser_en text, teaser_fr text, teaser_es text, teaser_de text, teaser_ru text, teaser_zh text,
  aggiornato_il timestamptz not null default now()
);
comment on table public.pin_mappa is 'Copia leggera dei pin della mappa (da shared_pois, tenuta aggiornata dal trigger trg_pin_mappa_sync). Vedi migration 20260925120000.';

create index if not exists idx_pin_mappa_geog on public.pin_mappa using gist (geog);

alter table public.pin_mappa enable row level security;
drop policy if exists pin_mappa_lettura on public.pin_mappa;
create policy pin_mappa_lettura on public.pin_mappa for select using (true);
grant select on public.pin_mappa to anon, authenticated;

-- Un POI è un pin se: visibile, stato non scartato, coordinate vere, nome non generico.
create or replace function public.pin_mappa_ammesso(sp public.shared_pois)
returns boolean language sql stable as $$
  select sp.lat is not null and sp.lon is not null and sp.lat = sp.lat and sp.lon = sp.lon
     and sp.lat between -90 and 90 and sp.lon between -180 and 180
     and sp.is_hidden is not true
     and coalesce(sp.status, 'verified') not in ('draft','needs_revision','rejected','hidden')
     and not public.is_generic_poi_name(sp.name);
$$;

create or replace function public.pin_mappa_scrivi(sp public.shared_pois)
returns void language plpgsql as $$
begin
  if not public.pin_mappa_ammesso(sp) then
    delete from public.pin_mappa where id = sp.id;
    return;
  end if;
  insert into public.pin_mappa (id, lat, lon, geog, nome, category, sub_category, image_url, is_gem, status, description_short,
                                teaser_it, teaser_en, teaser_fr, teaser_es, teaser_de, teaser_ru, teaser_zh, aggiornato_il)
  values (sp.id, sp.lat, sp.lon, st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography, sp.name, sp.category, sp.poi_type,
          coalesce(sp.image_url, sp.photo_url), coalesce(sp.is_gem, false), coalesce(sp.status, 'verified'), sp.description_short,
          sp.teaser_text_it, sp.teaser_text_en, sp.teaser_text_fr, sp.teaser_text_es, sp.teaser_text_de, sp.teaser_text_ru, sp.teaser_text_zh, now())
  on conflict (id) do update set
    lat = excluded.lat, lon = excluded.lon, geog = excluded.geog, nome = excluded.nome, category = excluded.category,
    sub_category = excluded.sub_category, image_url = excluded.image_url, is_gem = excluded.is_gem, status = excluded.status,
    description_short = excluded.description_short, teaser_it = excluded.teaser_it, teaser_en = excluded.teaser_en,
    teaser_fr = excluded.teaser_fr, teaser_es = excluded.teaser_es, teaser_de = excluded.teaser_de, teaser_ru = excluded.teaser_ru,
    teaser_zh = excluded.teaser_zh, aggiornato_il = now();
end;
$$;

create or replace function public.tg_pin_mappa_sync()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    delete from public.pin_mappa where id = old.id;
    return old;
  end if;
  perform public.pin_mappa_scrivi(new);
  return new;
end;
$$;

-- Solo le colonne che il pin mostra o che ne decidono la presenza: gli aggiornamenti
-- di massa su altre colonne (arrival_*, contatti, indirizzi…) non lo fanno scattare.
drop trigger if exists trg_pin_mappa_sync on public.shared_pois;
create trigger trg_pin_mappa_sync
  after insert or delete or update of
    lat, lon, name, category, poi_type, image_url, photo_url, is_gem, status, is_hidden, description_short,
    teaser_text_it, teaser_text_en, teaser_text_fr, teaser_text_es, teaser_text_de, teaser_text_ru, teaser_text_zh
  on public.shared_pois
  for each row execute function public.tg_pin_mappa_sync();

-- La funzione nuova, con lo stesso contratto di nearby_pois_map, per le prove
-- affiancate; allo scambio diventa nearby_pois_map.
create or replace function public.nearby_pois_map_v2(p_lat float8, p_lon float8, radius_m integer, limit_num integer default 500, p_lang text default 'it')
returns table(id text, nome text, lat float8, lon float8, distanza_m float8, category text, sub_category text, image_url text,
              is_gem boolean, status text, description_short text, teaser text)
language sql stable
set statement_timeout to '25s'
as $$
  with candidati as (
    select pm.*, st_distance(pm.geog, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) as d
    from public.pin_mappa pm
    where st_dwithin(pm.geog, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, radius_m)
    limit greatest(coalesce(limit_num, 500), 1) * 4
  )
  select c.id, c.nome, c.lat, c.lon, c.d as distanza_m, c.category, c.sub_category, c.image_url, c.is_gem, c.status, c.description_short,
    case lower(coalesce(p_lang, 'it'))
      when 'en' then coalesce(c.teaser_en, c.teaser_it)
      when 'fr' then coalesce(c.teaser_fr, c.teaser_en, c.teaser_it)
      when 'es' then coalesce(c.teaser_es, c.teaser_en, c.teaser_it)
      when 'de' then coalesce(c.teaser_de, c.teaser_en, c.teaser_it)
      when 'ru' then coalesce(c.teaser_ru, c.teaser_en, c.teaser_it)
      when 'zh' then coalesce(c.teaser_zh, c.teaser_en, c.teaser_it)
      else c.teaser_it
    end as teaser
  from candidati c
  order by c.d asc
  limit limit_num;
$$;
grant execute on function public.nearby_pois_map_v2(float8, float8, integer, integer, text) to anon, authenticated;

-- Stato del riempimento (una riga per cella, per riprendere).
create table if not exists public.pin_mappa_riempimento (
  cella text primary key,
  righe integer not null default 0,
  fatta_il timestamptz not null default now()
);

-- ── SCAMBIO (da eseguire SOLO a riempimento completo e prove superate) ────────
-- alter function public.nearby_pois_map(float8, float8, integer, integer, text) rename to nearby_pois_map_da_shared_pois;
-- create or replace function public.nearby_pois_map(p_lat float8, p_lon float8, radius_m integer, limit_num integer default 500, p_lang text default 'it')
-- returns table(id text, nome text, lat float8, lon float8, distanza_m float8, category text, sub_category text, image_url text,
--               is_gem boolean, status text, description_short text, teaser text)
-- language sql stable set statement_timeout to '25s'
-- as $$ select * from public.nearby_pois_map_v2(p_lat, p_lon, radius_m, limit_num, p_lang) $$;
