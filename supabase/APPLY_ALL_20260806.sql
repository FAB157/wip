-- ============================================================================
-- WIP / World in Pocket — SQL COMPLETO da eseguire nel SQL Editor di Supabase
-- Data: 2026-08-06 · Contiene 5 migration IN ORDINE (idempotenti: rieseguirle
-- non fa danni). Dopo l'esecuzione, fare il deploy del server dalla ROOT.
--
--  1) offline_area_bundle   → updated_at affidabile, tombstones, RPC pacchetti
--  2) day_pass              → tabella user_passes (Day Pass 24h)
--  3) profile_display_name  → nome utente su user_profiles
--  4) admin_user_stats      → policy RLS per la tab admin Utenti
--  5) credit_transactions   → storico crediti + contatore chat server-side
--
-- NOTA: il backfill del punto 1 tocca ~1,8M righe: qualche minuto di attesa
-- e scritture su shared_pois bloccate durante l'indice. Eseguire in orario
-- di basso traffico.
-- ============================================================================


-- ============================================================================
-- 1/5 — 20260806100000_offline_area_bundle.sql
-- ============================================================================

-- Backfill updated_at mancanti (PRIMA del trigger, per non sovrascrivere)
update public.shared_pois
   set updated_at = coalesce(updated_at, enriched_at, created_at, now())
 where updated_at is null;

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

create index if not exists idx_shared_pois_updated_at
  on public.shared_pois (updated_at, id);

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


-- ============================================================================
-- 2/5 — 20260806120000_day_pass.sql
-- ============================================================================

create table if not exists public.user_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pass_type text not null default 'day',
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  guides_used int not null default 0,
  guides_cap int not null default 40,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_passes_user_expires
  on public.user_passes (user_id, expires_at desc);

alter table public.user_passes enable row level security;

drop policy if exists "user_passes select own" on public.user_passes;
create policy "user_passes select own" on public.user_passes
  for select using (auth.uid() = user_id);

drop policy if exists "user_passes insert own" on public.user_passes;
create policy "user_passes insert own" on public.user_passes
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_passes update own" on public.user_passes;
create policy "user_passes update own" on public.user_passes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.tg_user_passes_guard()
returns trigger
language plpgsql as $$
begin
  new.expires_at := old.expires_at;
  new.activated_at := old.activated_at;
  new.guides_cap := old.guides_cap;
  new.pass_type := old.pass_type;
  new.user_id := old.user_id;
  if new.guides_used < old.guides_used then
    new.guides_used := old.guides_used;
  end if;
  return new;
end $$;

drop trigger if exists trg_user_passes_guard on public.user_passes;
create trigger trg_user_passes_guard
  before update on public.user_passes
  for each row execute function public.tg_user_passes_guard();


-- ============================================================================
-- 3/5 — 20260806130000_profile_display_name.sql
-- ============================================================================

alter table public.user_profiles
  add column if not exists display_name text;


-- ============================================================================
-- 4/5 — 20260806140000_admin_user_stats.sql
-- ============================================================================

drop policy if exists "user_passes admin select" on public.user_passes;
create policy "user_passes admin select" on public.user_passes
  for select to authenticated using (public.is_admin_user());

do $$
begin
  if exists (
    select from pg_tables
    where schemaname = 'public' and tablename = 'user_listening_history'
  ) then
    execute 'alter table public.user_listening_history enable row level security';
    if not exists (
      select from pg_policies
      where schemaname = 'public' and tablename = 'user_listening_history'
        and policyname = 'listening_history own'
    ) then
      execute 'create policy "listening_history own" on public.user_listening_history
                 for all to authenticated
                 using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    end if;
    if not exists (
      select from pg_policies
      where schemaname = 'public' and tablename = 'user_listening_history'
        and policyname = 'listening_history admin select'
    ) then
      execute 'create policy "listening_history admin select" on public.user_listening_history
                 for select to authenticated using (public.is_admin_user())';
    end if;
  end if;
end $$;


-- ============================================================================
-- 5/5 — 20260806150000_credit_transactions.sql
-- ============================================================================

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount int not null,
  type text not null,
  source text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_transactions_user
  on public.credit_transactions (user_id, created_at desc);

alter table public.credit_transactions enable row level security;

drop policy if exists "credit_transactions select own or admin" on public.credit_transactions;
create policy "credit_transactions select own or admin" on public.credit_transactions
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin_user());

CREATE OR REPLACE FUNCTION public.consume_credits(p_user_id UUID, p_amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_earned INTEGER;
    v_purchased INTEGER;
    v_remaining_cost INTEGER;
BEGIN
    SELECT earned_credits, purchased_credits
    INTO v_earned, v_purchased
    FROM public.user_profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF (v_earned + v_purchased) < p_amount THEN
        RETURN FALSE;
    END IF;

    v_remaining_cost := p_amount;

    IF v_earned >= v_remaining_cost THEN
        v_earned := v_earned - v_remaining_cost;
        v_remaining_cost := 0;
    ELSE
        v_remaining_cost := v_remaining_cost - v_earned;
        v_earned := 0;
    END IF;

    IF v_remaining_cost > 0 THEN
        v_purchased := v_purchased - v_remaining_cost;
    END IF;

    UPDATE public.user_profiles
    SET earned_credits = v_earned,
        purchased_credits = v_purchased
    WHERE id = p_user_id;

    INSERT INTO public.credit_transactions (user_id, amount, type, source)
    VALUES (p_user_id, -p_amount, 'consume', 'rpc');

    RETURN TRUE;
END;
$$;

create or replace function public.refund_credits(p_amount int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 or p_amount > 1000 then
    return false;
  end if;
  update public.user_profiles
     set purchased_credits = coalesce(purchased_credits, 0) + p_amount
   where id = auth.uid();
  if not found then
    return false;
  end if;
  insert into public.credit_transactions (user_id, amount, type, source)
  values (auth.uid(), p_amount, 'refund', 'rpc');
  return true;
end;
$$;

create table if not exists public.user_chat_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages_left int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_chat_sessions enable row level security;

drop policy if exists "chat_sessions select own" on public.user_chat_sessions;
create policy "chat_sessions select own" on public.user_chat_sessions
  for select to authenticated using (auth.uid() = user_id);

-- FINE — verifica rapida:
--   select count(*) from public.user_passes;             -- 0, nessun errore
--   select count(*) from public.credit_transactions;     -- 0, nessun errore
--   select display_name from public.user_profiles limit 1;
