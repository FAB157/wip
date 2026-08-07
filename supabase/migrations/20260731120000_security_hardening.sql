-- ============================================================================
-- HARDENING SICUREZZA — da eseguire nel SQL Editor di Supabase (produzione)
-- Chiude le falle emerse dalla revisione del 31/07/2026:
--   1. user_profiles: chiunque poteva scriversi is_admin/crediti/premium
--      dalla console del browser con la anon key.
--   2. saved_pois: lettura/cancellazione cross-utente.
--   3. coupons: riscatto client-side non atomico e fraudabile.
--   4. refund crediti: read-modify-write non atomico dal client.
-- Verificare prima lo stato attuale con: select * from pg_policies;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper: è admin l'utente corrente? (SECURITY DEFINER evita la ricorsione
--    delle policy su user_profiles)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.user_profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------------
-- 1. user_profiles: RLS + trigger anti-escalation
--    L'utente può leggere/aggiornare il proprio profilo (nome, preferenze...)
--    ma NON può toccare le colonne sensibili: ci pensa il trigger, che vale
--    anche per gli upsert. Il service_role (server, webhook) bypassa tutto.
-- ---------------------------------------------------------------------------
alter table public.user_profiles enable row level security;

drop policy if exists "read own profile" on public.user_profiles;
create policy "read own profile" on public.user_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "insert own profile" on public.user_profiles;
create policy "insert own profile" on public.user_profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "update own profile" on public.user_profiles;
create policy "update own profile" on public.user_profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Colonne sensibili bloccate per i non-admin (il service_role non passa di qui)
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.is_admin            := old.is_admin;
    new.purchased_credits   := old.purchased_credits;
    new.earned_credits      := old.earned_credits;
    new.subscription_tier   := old.subscription_tier;
    new.subscription_status := old.subscription_status;
    new.premium_until       := old.premium_until;
    new.current_period_end  := old.current_period_end;
    new.is_forever_premium  := old.is_forever_premium;
    new.bonus_vision        := old.bonus_vision;
    new.bonus_audio         := old.bonus_audio;
    new.bonus_itinerari     := old.bonus_itinerari;
  else -- INSERT: valori sicuri di default (i 100 crediti di benvenuto sono ok)
    new.is_admin           := false;
    new.subscription_tier  := 'free';
    new.is_forever_premium := false;
    new.premium_until      := null;
    new.purchased_credits  := 0;
    new.earned_credits     := least(coalesce(new.earned_credits, 0), 100);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_columns on public.user_profiles;
create trigger trg_protect_profile_columns
  before insert or update on public.user_profiles
  for each row execute function public.protect_profile_columns();

-- ---------------------------------------------------------------------------
-- 2. saved_pois: ognuno vede e cancella solo i propri salvataggi
-- ---------------------------------------------------------------------------
alter table public.saved_pois enable row level security;

drop policy if exists "own saved pois select" on public.saved_pois;
create policy "own saved pois select" on public.saved_pois
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own saved pois insert" on public.saved_pois;
create policy "own saved pois insert" on public.saved_pois
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own saved pois delete" on public.saved_pois;
create policy "own saved pois delete" on public.saved_pois
  for delete to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. coupons: riscatto SOLO via RPC atomica; scritture dirette solo admin
--    (il client fa fallback sul vecchio percorso finché questa migration non
--    è applicata: dopo, il vecchio percorso viene rifiutato dalle policy)
-- ---------------------------------------------------------------------------
alter table public.coupons enable row level security;

drop policy if exists "coupons read" on public.coupons;
create policy "coupons read" on public.coupons
  for select to authenticated using (true);

drop policy if exists "coupons admin write" on public.coupons;
create policy "coupons admin write" on public.coupons
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.redeem_coupon(p_code text)
returns table (duration_days int)
language sql
security definer
set search_path = public
as $$
  with c as (
    update public.coupons
       set uses_count = coalesce(uses_count, 0) + 1
     where code = p_code
       and is_active
       and coalesce(uses_count, 0) < max_uses
    returning coupons.duration_days
  ), p as (
    update public.user_profiles
       set subscription_tier = 'premium',
           premium_until = greatest(coalesce(premium_until, now()), now())
                           + make_interval(days => (select duration_days from c))
     where id = auth.uid()
       and exists (select 1 from c)
  )
  select duration_days from c;
$$;

-- ---------------------------------------------------------------------------
-- 3-bis. Tabelle amministrate dal pannello: lettura pubblica dove serve,
--        scritture SOLO admin. Il pannello continua a funzionare per gli admin
--        veri (le policy usano is_admin()), ma un utente qualunque non può più
--        bannare POI, svuotare system_errors o inventarsi challenge con crediti.
-- ---------------------------------------------------------------------------

-- shared_pois: lettura per tutti (è il catalogo), scrittura solo admin.
-- NOTA: se l'auto-discovery Overpass client-side (poiDiscovery) deve poter
-- inserire POI con status='auto', mantenere una policy INSERT dedicata.
alter table public.shared_pois enable row level security;

drop policy if exists "shared_pois public read" on public.shared_pois;
create policy "shared_pois public read" on public.shared_pois
  for select using (true);

drop policy if exists "shared_pois auto discovery insert" on public.shared_pois;
create policy "shared_pois auto discovery insert" on public.shared_pois
  for insert to authenticated
  with check (public.is_admin() or coalesce(status, 'auto') = 'auto');

drop policy if exists "shared_pois admin update" on public.shared_pois;
create policy "shared_pois admin update" on public.shared_pois
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "shared_pois admin delete" on public.shared_pois;
create policy "shared_pois admin delete" on public.shared_pois
  for delete to authenticated using (public.is_admin());

-- gamification: lettura per tutti, scrittura solo admin
alter table public.gamification_levels enable row level security;
drop policy if exists "Enable read access for all users" on public.gamification_levels;
create policy "gamification_levels read" on public.gamification_levels for select using (true);
drop policy if exists "Enable all access for authenticated" on public.gamification_levels;
drop policy if exists "gamification_levels admin write" on public.gamification_levels;
create policy "gamification_levels admin write" on public.gamification_levels
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.gamification_challenges enable row level security;
drop policy if exists "gamification_challenges read" on public.gamification_challenges;
create policy "gamification_challenges read" on public.gamification_challenges for select using (true);
drop policy if exists "gamification_challenges admin write" on public.gamification_challenges;
create policy "gamification_challenges admin write" on public.gamification_challenges
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- poi_reports: l'utente segnala (insert) e vede le proprie; moderazione solo admin
alter table public.poi_reports enable row level security;
drop policy if exists "poi_reports insert own" on public.poi_reports;
create policy "poi_reports insert own" on public.poi_reports
  for insert to authenticated with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "poi_reports read" on public.poi_reports;
create policy "poi_reports read" on public.poi_reports
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "poi_reports admin write" on public.poi_reports;
create policy "poi_reports admin write" on public.poi_reports
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "poi_reports admin delete" on public.poi_reports;
create policy "poi_reports admin delete" on public.poi_reports
  for delete to authenticated using (public.is_admin());

-- system_errors: il client può loggare (insert), ma solo gli admin leggono/svuotano
alter table public.system_errors enable row level security;
drop policy if exists "system_errors insert" on public.system_errors;
create policy "system_errors insert" on public.system_errors
  for insert to authenticated with check (true);
drop policy if exists "system_errors admin read" on public.system_errors;
create policy "system_errors admin read" on public.system_errors
  for select to authenticated using (public.is_admin());
drop policy if exists "system_errors admin delete" on public.system_errors;
create policy "system_errors admin delete" on public.system_errors
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Rimborso crediti atomico (usato da pricing.ts al posto del
--    read-modify-write client-side). Solo sul proprio profilo.
-- ---------------------------------------------------------------------------
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
  return found;
end;
$$;
