-- =====================================================================
-- RLS per user_profiles e user_quotas — WIP (2026-08-05)
-- Chiude la falla: profili (email, crediti, is_admin) leggibili e
-- modificabili con la chiave anonima.
-- Compatibilità garantita: service_role (server/webhook) bypassa tutto,
-- gli admin autenticati vedono/modificano tutto, gli utenti solo la
-- propria riga e senza poter toccare i campi sensibili.
-- =====================================================================

-- Helper anti-ricorsione: legge is_admin senza attraversare le policy
create or replace function public.is_admin_user()
returns boolean language sql security definer stable
set search_path = public
as $$
  select coalesce((select is_admin from public.user_profiles where id = auth.uid()), false)
$$;

-- ── USER_PROFILES ────────────────────────────────────────────────────
alter table public.user_profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.user_profiles;
create policy "profiles_select_own_or_admin" on public.user_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin_user());

drop policy if exists "profiles_insert_own" on public.user_profiles;
create policy "profiles_insert_own" on public.user_profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own_or_admin" on public.user_profiles;
create policy "profiles_update_own_or_admin" on public.user_profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin_user())
  with check (id = auth.uid() or public.is_admin_user());

-- Nessuna policy per anon: la chiave anonima senza login non legge nulla.

-- Trigger: un utente normale non può modificare i campi sensibili della
-- propria riga (crediti, admin, tier). Service role e admin passano.
create or replace function public.protect_profile_sensitive_cols()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin_user() then
    return new;
  end if;
  if new.is_admin is distinct from old.is_admin
     or new.purchased_credits is distinct from old.purchased_credits
     or new.earned_credits is distinct from old.earned_credits
     or new.subscription_tier is distinct from old.subscription_tier
     or new.subscription_status is distinct from old.subscription_status
     or new.is_forever_premium is distinct from old.is_forever_premium
     or new.premium_until is distinct from old.premium_until
     or new.custom_limit_itinerary is distinct from old.custom_limit_itinerary
     or new.custom_limit_audio_guide is distinct from old.custom_limit_audio_guide then
    raise exception 'Campo riservato: modifica non consentita';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile_cols on public.user_profiles;
create trigger trg_protect_profile_cols
  before update on public.user_profiles
  for each row execute function public.protect_profile_sensitive_cols();

-- ── USER_QUOTAS ──────────────────────────────────────────────────────
alter table public.user_quotas enable row level security;

drop policy if exists "quotas_select_own_or_admin" on public.user_quotas;
create policy "quotas_select_own_or_admin" on public.user_quotas
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_user());

drop policy if exists "quotas_insert_own_or_admin" on public.user_quotas;
create policy "quotas_insert_own_or_admin" on public.user_quotas
  for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin_user());

drop policy if exists "quotas_update_own_or_admin" on public.user_quotas;
create policy "quotas_update_own_or_admin" on public.user_quotas
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin_user())
  with check (user_id = auth.uid() or public.is_admin_user());

-- Trigger: un utente normale non può alzarsi i propri limiti
create or replace function public.protect_quota_limit_cols()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin_user() then
    return new;
  end if;
  if new.itinerari_limit is distinct from old.itinerari_limit
     or new.audioguide_limit is distinct from old.audioguide_limit
     or new.vision_limit is distinct from old.vision_limit
     or new.premium_guide_limit is distinct from old.premium_guide_limit
     or new.plan_type is distinct from old.plan_type then
    raise exception 'Campo riservato: modifica non consentita';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_quota_cols on public.user_quotas;
create trigger trg_protect_quota_cols
  before update on public.user_quotas
  for each row execute function public.protect_quota_limit_cols();

-- ── BULK UPDATE RPC (per il pannello admin) ──────────────────────────
create or replace function public.bulk_adjust_quota_limits(
  p_plan_type text, p_feature text, p_amount int
) returns int language plpgsql security definer
set search_path = public
as $$
declare v_count int;
begin
  if not public.is_admin_user() then
    raise exception 'Solo gli admin possono eseguire modifiche di massa';
  end if;
  if p_feature not in ('itinerari','audioguide','vision','premium_guide') then
    raise exception 'feature non valida';
  end if;
  execute format(
    'update public.user_quotas set %I = greatest(0, coalesce(%I,0) + $1) %s',
    p_feature || '_limit', p_feature || '_limit',
    case when p_plan_type = 'all' then '' else 'where plan_type = $2' end
  ) using p_amount, p_plan_type;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- =====================================================================
-- ROLLBACK (in caso di problemi, eseguire solo queste righe):
-- alter table public.user_profiles disable row level security;
-- alter table public.user_quotas disable row level security;
-- drop trigger if exists trg_protect_profile_cols on public.user_profiles;
-- drop trigger if exists trg_protect_quota_cols on public.user_quotas;
-- =====================================================================
