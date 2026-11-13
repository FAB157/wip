-- PIN MAPPA SERVIZI (27/09/2026) — «creiamo una tabella per i pin delle
-- categorie non culturali».
--
-- Perché: `pin_mappa` (migration 20260925120000) copre gemme/monumenti/
-- chiese/musei/panorami — ma tutto il resto (gusto, shopping, lusso,
-- utilità, famiglie) interrogava ancora `shared_pois` diretto, senza indice
-- spaziale, o `utility_pois` (che un GIST ce l'ha già, ma è una fonte a
-- parte). NON una tabella per ogni sottocategoria (colonnine, acquario,
-- vette...): sarebbe decine di tabelle da mantenere per un guadagno che un
-- indice su `category`/`sub_category` dentro UNA tabella dà già gratis.
-- Una tabella sola, «tutto quello che non è culturale», stesso schema di
-- pin_mappa, indice GIST, riempita con un INSERT diretto (non serve il
-- riempimento a celle di pin_mappa: qui non c'è una API esterna da
-- centellinare, solo una copia da una tabella nostra).
--
-- «Culturale» = la stessa lista che osmToUiCategory (MapArea.tsx) mappa a
-- chiese/musei/monumenti/panorami, più le gemme (is_gem=true, qualunque
-- categoria): quelle restano SOLO in pin_mappa, per non duplicarle.

create table if not exists public.pin_mappa_servizi (
  id text primary key,
  lat float8 not null,
  lon float8 not null,
  geog geography(Point, 4326) not null,
  nome text,
  category text,
  sub_category text,
  image_url text,
  status text not null default 'verified',
  description_short text,
  contact_website text,
  contact_phone text,
  fonte text not null default 'shared_pois',   -- 'shared_pois' | 'utility_pois'
  aggiornato_il timestamptz not null default now()
);
comment on table public.pin_mappa_servizi is
  'Copia leggera dei pin NON culturali (gusto, shopping, lusso, utilità, famiglie), da shared_pois e utility_pois. Vedi migration 20260927110000. Il culturale resta in pin_mappa.';

create index if not exists idx_pin_mappa_servizi_geog on public.pin_mappa_servizi using gist (geog);
create index if not exists idx_pin_mappa_servizi_category on public.pin_mappa_servizi (category);

alter table public.pin_mappa_servizi enable row level security;
drop policy if exists pin_mappa_servizi_lettura on public.pin_mappa_servizi;
create policy pin_mappa_servizi_lettura on public.pin_mappa_servizi for select using (true);
grant select on public.pin_mappa_servizi to anon, authenticated;

-- Le categorie/poi_type che restano SOLO in pin_mappa (culturale): usate sia
-- dall'ammissione qui sotto sia dal trigger, per non doverle ripetere.
create or replace function public.pin_mappa_servizi_culturale(category text, is_gem boolean)
returns boolean language sql immutable as $$
  select coalesce(is_gem, false) = true
    or lower(coalesce(category, '')) in ('church','museum','monument','castle','ruins','archaeological_site','artwork','viewpoint','gemme','chiese','musei','monumenti','panorami');
$$;

create or replace function public.pin_mappa_servizi_ammesso(sp public.shared_pois)
returns boolean language sql stable as $$
  select public.pin_mappa_ammesso(sp) and not public.pin_mappa_servizi_culturale(sp.category, sp.is_gem);
$$;

create or replace function public.pin_mappa_servizi_scrivi(sp public.shared_pois)
returns void language plpgsql as $$
begin
  if not public.pin_mappa_servizi_ammesso(sp) then
    delete from public.pin_mappa_servizi where id = sp.id and fonte = 'shared_pois';
    return;
  end if;
  insert into public.pin_mappa_servizi (id, lat, lon, geog, nome, category, sub_category, image_url, status,
                                        description_short, contact_website, contact_phone, fonte, aggiornato_il)
  values (sp.id, sp.lat, sp.lon, st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography, sp.name, sp.category, sp.poi_type,
          coalesce(sp.image_url, sp.photo_url), coalesce(sp.status, 'verified'), sp.description_short,
          sp.contact_website, sp.contact_phone, 'shared_pois', now())
  on conflict (id) do update set
    lat = excluded.lat, lon = excluded.lon, geog = excluded.geog, nome = excluded.nome, category = excluded.category,
    sub_category = excluded.sub_category, image_url = excluded.image_url, status = excluded.status,
    description_short = excluded.description_short, contact_website = excluded.contact_website,
    contact_phone = excluded.contact_phone, fonte = 'shared_pois', aggiornato_il = now();
end;
$$;

create or replace function public.tg_pin_mappa_servizi_sync()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    delete from public.pin_mappa_servizi where id = old.id and fonte = 'shared_pois';
    return old;
  end if;
  perform public.pin_mappa_servizi_scrivi(new);
  return new;
end;
$$;

drop trigger if exists trg_pin_mappa_servizi_sync on public.shared_pois;
create trigger trg_pin_mappa_servizi_sync
  after insert or delete or update of
    lat, lon, name, category, poi_type, image_url, photo_url, status, is_hidden, description_short,
    contact_website, contact_phone, is_gem
  on public.shared_pois
  for each row execute function public.tg_pin_mappa_servizi_sync();

-- ── utility_pois (fontanelle...): stessa tabella, righe con fonte diversa,
-- niente contatti/descrizione (quella fonte non li ha). ──
create or replace function public.tg_pin_mappa_servizi_sync_utility()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    delete from public.pin_mappa_servizi where id = old.id and fonte = 'utility_pois';
    return old;
  end if;
  if new.name is null or coalesce(new.status, 'verified') not in ('verified', 'auto') then
    delete from public.pin_mappa_servizi where id = new.id and fonte = 'utility_pois';
    return new;
  end if;
  insert into public.pin_mappa_servizi (id, lat, lon, geog, nome, category, sub_category, image_url, status, fonte, aggiornato_il)
  values (new.id, new.lat, new.lon, st_setsrid(st_makepoint(new.lon, new.lat), 4326)::geography, new.name, new.category, new.sub_category,
          coalesce(new.image_url, new.photo_url), coalesce(new.status, 'verified'), 'utility_pois', now())
  on conflict (id) do update set
    lat = excluded.lat, lon = excluded.lon, geog = excluded.geog, nome = excluded.nome, category = excluded.category,
    sub_category = excluded.sub_category, image_url = excluded.image_url, status = excluded.status,
    fonte = 'utility_pois', aggiornato_il = now();
  return new;
end;
$$;

drop trigger if exists trg_pin_mappa_servizi_sync_utility on public.utility_pois;
create trigger trg_pin_mappa_servizi_sync_utility
  after insert or delete or update of lat, lon, name, category, sub_category, image_url, photo_url, status
  on public.utility_pois
  for each row execute function public.tg_pin_mappa_servizi_sync_utility();

-- Lettura per riquadro + categoria (+ eventuale lista di sub_category, come
-- per pin_mappa_per_categoria: gusto la usa per produttori/botteghe).
create or replace function public.pin_mappa_servizi_per_categoria(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_category text, p_sub_categories text[] default null, p_limit integer default 200
)
returns table(id text, nome text, lat float8, lon float8, sub_category text, image_url text,
              description_short text, contact_website text, contact_phone text)
language sql stable
set statement_timeout to '10s'
as $$
  select pm.id, pm.nome, pm.lat, pm.lon, pm.sub_category, pm.image_url,
    pm.description_short, pm.contact_website, pm.contact_phone
  from public.pin_mappa_servizi pm
  where (p_category is null or pm.category = p_category)
    and (p_sub_categories is null or pm.sub_category = any(p_sub_categories))
    and st_intersects(pm.geog, st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography)
  order by pm.id
  limit greatest(coalesce(p_limit, 200), 1);
$$;
grant execute on function public.pin_mappa_servizi_per_categoria(float8, float8, float8, float8, text, text[], integer) to anon, authenticated;

-- Variante multi-categoria (monumenti/locali/utilità/famiglie a zoom
-- lontano leggono per MACRO, che sul DB non è un singolo `category` ma un
-- elenco di poi_type/category diversi — vedi UTILITA_TYPES/FAMIGLIE_TYPES).
create or replace function public.pin_mappa_servizi_per_tipi(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_categorie text[], p_limit integer default 400
)
returns table(id text, nome text, lat float8, lon float8, category text, sub_category text, image_url text,
              description_short text, contact_website text, contact_phone text)
language sql stable
set statement_timeout to '10s'
as $$
  select pm.id, pm.nome, pm.lat, pm.lon, pm.category, pm.sub_category, pm.image_url,
    pm.description_short, pm.contact_website, pm.contact_phone
  from public.pin_mappa_servizi pm
  where (pm.category = any(p_categorie) or pm.sub_category = any(p_categorie))
    and st_intersects(pm.geog, st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography)
  limit greatest(coalesce(p_limit, 400), 1);
$$;
grant execute on function public.pin_mappa_servizi_per_tipi(float8, float8, float8, float8, text[], integer) to anon, authenticated;

-- ── Riempimento iniziale (copia diretta, nessuna API esterna: si può fare
-- in un colpo solo, a differenza del riempimento a celle di pin_mappa) ────
insert into public.pin_mappa_servizi (id, lat, lon, geog, nome, category, sub_category, image_url, status,
                                      description_short, contact_website, contact_phone, fonte, aggiornato_il)
select sp.id, sp.lat, sp.lon, st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography, sp.name, sp.category, sp.poi_type,
       coalesce(sp.image_url, sp.photo_url), coalesce(sp.status, 'verified'), sp.description_short,
       sp.contact_website, sp.contact_phone, 'shared_pois', now()
from public.shared_pois sp
where public.pin_mappa_servizi_ammesso(sp)
on conflict (id) do nothing;

insert into public.pin_mappa_servizi (id, lat, lon, geog, nome, category, sub_category, image_url, status, fonte, aggiornato_il)
select up.id, up.lat, up.lon, st_setsrid(st_makepoint(up.lon, up.lat), 4326)::geography, up.name, up.category, up.sub_category,
       coalesce(up.image_url, up.photo_url), coalesce(up.status, 'verified'), 'utility_pois', now()
from public.utility_pois up
where up.name is not null and coalesce(up.status, 'verified') in ('verified', 'auto')
on conflict (id) do nothing;
