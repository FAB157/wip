-- ═══════════════════════════════════════════════════════════════════════════
-- FIX CRITICI RED-TEAM 2026-08-11 — DA APPLICARE A MANO (Supabase SQL editor)
--
-- Copre i punti critici del red-team che vivono nel DB:
--   C3 — auto-promozione a is_admin + crediti dal browser (trigger profilo)
--   C5 — refund_credits() self-service (revoke)
--   C6 — dump di tutti i coupon con la anon key (drop policy)
--   C7 — shared_pois/audio_cache/pending_edits/utility_pois/api_cache aperti
--
-- Versione ROBUSTA: ogni blocco è protetto da un controllo di esistenza della
-- tabella (to_regclass), così una tabella assente (es. api_cache non presente
-- su questo progetto) NON interrompe la migration. È idempotente: rieseguibile.
--
-- PREREQUISITO (applicare PRIMA, se non già fatto): le migration economia
--   20260809100000_security_hardening_economy.sql  (consume_credits, refund_credits)
--   20260809100500_credit_purchase_idempotent.sql   (credit_purchase, refund_credits_service)
--
-- Prima di applicare, fotografa lo stato con:
--   select tablename, rowsecurity from pg_tables where schemaname='public';
--   select tablename, policyname, cmd, roles, qual from pg_policies where schemaname='public';
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- Helper anti-ricorsione (idempotente). Definito PRIMA di ogni policy che lo usa.
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT coalesce((SELECT is_admin FROM public.user_profiles WHERE id = auth.uid()), false)
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- C6 — Coupon dump. Via ogni policy e lascia solo l'accesso admin (il server
-- valida/riscatta con la service key, che bypassa la RLS).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.coupons') IS NULL THEN
    RAISE NOTICE 'coupons: assente, salto'; RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY';
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='coupons'
  LOOP EXECUTE format('DROP POLICY %I ON public.coupons', pol.policyname); END LOOP;
  EXECUTE 'CREATE POLICY "coupons_admin_all" ON public.coupons
             FOR ALL TO authenticated
             USING (public.is_admin_user()) WITH CHECK (public.is_admin_user())';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- C5 — refund_credits() self-service: revoca l'accesso diretto del client.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='refund_credits') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.refund_credits(integer) FROM public, anon, authenticated';
  ELSE
    RAISE NOTICE 'refund_credits: assente (applica prima le migration economia), salto';
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- C3 — Trigger anti-escalation su user_profiles (INSERT + UPDATE).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_cols()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin_user() THEN
    RETURN new;
  END IF;

  IF TG_OP = 'INSERT' THEN
    new.is_admin := false;
    new.is_forever_premium := false;
    new.purchased_credits := 0;
    new.earned_credits := least(coalesce(new.earned_credits, 0), 100);
    IF coalesce(new.subscription_tier, 'free') <> 'free' THEN new.subscription_tier := 'free'; END IF;
    new.subscription_tier := coalesce(new.subscription_tier, 'free');
    new.subscription_status := coalesce(new.subscription_status, 'inactive');
    new.premium_until := NULL;
    RETURN new;
  END IF;

  -- UPDATE: vietato cambiare una colonna sensibile.
  IF new.is_admin IS DISTINCT FROM old.is_admin
     OR new.purchased_credits IS DISTINCT FROM old.purchased_credits
     OR new.earned_credits IS DISTINCT FROM old.earned_credits
     OR new.subscription_tier IS DISTINCT FROM old.subscription_tier
     OR new.subscription_status IS DISTINCT FROM old.subscription_status
     OR new.is_forever_premium IS DISTINCT FROM old.is_forever_premium
     OR new.premium_until IS DISTINCT FROM old.premium_until
     OR new.custom_limit_itinerary IS DISTINCT FROM old.custom_limit_itinerary
     OR new.custom_limit_audio_guide IS DISTINCT FROM old.custom_limit_audio_guide THEN
    RAISE EXCEPTION 'Campo riservato: modifica non consentita';
  END IF;
  RETURN new;
END $$;

DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    RAISE NOTICE 'user_profiles: assente, salto'; RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP TRIGGER IF EXISTS trg_protect_profile_cols ON public.user_profiles';
  EXECUTE 'CREATE TRIGGER trg_protect_profile_cols
             BEFORE INSERT OR UPDATE ON public.user_profiles
             FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_cols()';
  -- Via il trigger legacy in conflitto (GUC morto request.jwt.claim.role).
  EXECUTE 'DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.user_profiles';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- C7 — shared_pois: login per scrivere (chiude l'attacco anonimo), DELETE solo
-- admin (chiude il wipe del catalogo). Lettura pubblica. Le scritture curate
-- del server passano dalla service key. NON si estende protect_poi_review_columns
-- a INSERT/DELETE (romperebbe gli INSERT): il trigger UPDATE esistente resta.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.shared_pois') IS NULL THEN
    RAISE NOTICE 'shared_pois: assente, salto'; RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.shared_pois ENABLE ROW LEVEL SECURITY';
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='shared_pois'
  LOOP EXECUTE format('DROP POLICY %I ON public.shared_pois', pol.policyname); END LOOP;
  EXECUTE 'CREATE POLICY "shared_pois_public_read"  ON public.shared_pois FOR SELECT USING (true)';
  EXECUTE 'CREATE POLICY "shared_pois_auth_insert"  ON public.shared_pois FOR INSERT TO authenticated WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "shared_pois_auth_update"  ON public.shared_pois FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  EXECUTE 'CREATE POLICY "shared_pois_admin_delete" ON public.shared_pois FOR DELETE TO authenticated USING (public.is_admin_user())';
END $$;

-- shared_poi_audio_cache — lettura pubblica, scritture solo service_role.
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.shared_poi_audio_cache') IS NULL THEN
    RAISE NOTICE 'shared_poi_audio_cache: assente, salto'; RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.shared_poi_audio_cache ENABLE ROW LEVEL SECURITY';
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='shared_poi_audio_cache'
  LOOP EXECUTE format('DROP POLICY %I ON public.shared_poi_audio_cache', pol.policyname); END LOOP;
  EXECUTE 'CREATE POLICY "audio_cache_public_read" ON public.shared_poi_audio_cache FOR SELECT USING (true)';
END $$;

-- pending_edits — solo service_role (nessuna policy = nessun accesso client).
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.pending_edits') IS NULL THEN
    RAISE NOTICE 'pending_edits: assente, salto'; RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.pending_edits ENABLE ROW LEVEL SECURITY';
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='pending_edits'
  LOOP EXECUTE format('DROP POLICY %I ON public.pending_edits', pol.policyname); END LOOP;
END $$;

-- utility_pois — lettura pubblica, scritture solo service_role.
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.utility_pois') IS NULL THEN
    RAISE NOTICE 'utility_pois: assente, salto'; RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.utility_pois ENABLE ROW LEVEL SECURITY';
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='utility_pois'
  LOOP EXECUTE format('DROP POLICY %I ON public.utility_pois', pol.policyname); END LOOP;
  EXECUTE 'CREATE POLICY "utility_pois_public_read" ON public.utility_pois FOR SELECT USING (true)';
END $$;

-- api_cache — su alcuni progetti NON esiste (cache server via altra tabella):
-- se assente non c'è nulla da proteggere. Se esiste: lettura pubblica, scritture
-- solo service_role.
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.api_cache') IS NULL THEN
    RAISE NOTICE 'api_cache: assente su questo progetto, salto'; RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY';
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='api_cache'
  LOOP EXECUTE format('DROP POLICY %I ON public.api_cache', pol.policyname); END LOOP;
  EXECUTE 'CREATE POLICY "api_cache_public_read" ON public.api_cache FOR SELECT USING (true)';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE
--   select tablename, rowsecurity from pg_tables where schemaname='public'
--     and tablename in ('coupons','user_profiles','shared_pois','shared_poi_audio_cache','pending_edits','utility_pois');
--   -- tutte le presenti devono avere rowsecurity = true
--   select tgname from pg_trigger where tgrelid='public.user_profiles'::regclass;
--     -- deve comparire trg_protect_profile_cols, NON trg_protect_profile_columns
-- ═══════════════════════════════════════════════════════════════════════════
