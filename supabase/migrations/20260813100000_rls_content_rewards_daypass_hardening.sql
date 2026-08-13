-- ═══════════════════════════════════════════════════════════════════════════
-- BLINDATURA RLS CONTENUTI + PREMI + DAY PASS — WIP (2026-08-13)
-- DA APPLICARE A MANO (Supabase SQL editor). Idempotente: rieseguibile.
--
-- Copre tre falle dell'audit:
--   [BLOCCANTE] poi_details / poi_audioguides: l'unica RLS del repo era
--     "public rw ..." FOR ALL TO public USING(true) WITH CHECK(true)
--     (pois_schema.sql:248-249) → chiunque con la anon key poteva
--     INSERT/UPDATE/DELETE i testi delle schede e delle audioguide.
--     Nuovo stato: RLS on, SELECT aperto a anon+authenticated, NESSUNA
--     policy di scrittura per anon/authenticated (le scritture curate
--     passano SOLO dal server con la service key, che bypassa la RLS).
--     NB DI COORDINAMENTO: oggi il client scrive questi testi con la anon key
--     (poiRepository.ts upsertPoiDetails/upsertAudioguide). Un client-agent sta
--     spostando quelle scritture lato server: questa migration è lo stato
--     finale voluto e va deployata INSIEME a quel cambio client, altrimenti le
--     upsert client falliscono (le LETTURE restano aperte, nessun crash lato UI).
--
--   [GRAVE] user_rewards_claimed: nessuna RLS sul DB live (il file ad-hoc di
--     repo update_user_quotas_and_rewards.sql aveva SELECT-own + INSERT-own, ma
--     non risulta applicato). Senza RLS un utente poteva inserire righe di
--     riscatto arbitrarie → forgiare Pass Museo e rigiocare il welcome-bonus.
--     Nuovo stato: RLS on, SELECT solo delle proprie righe, NESSUNA scrittura
--     client (i riscatti passano dal server: /api/gamification/claim,
--     /api/welcome-bonus/claim, Pass Museo — tutti con service key).
--     Verificato: il client legge soltanto (ProfileScreen.tsx:922-925), non
--     inserisce mai user_rewards_claimed con la anon key.
--
--   [GRAVE dependency] Day Pass gratis se l'hardening economia non è applicato:
--     ri-applica il pezzo Day Pass di 20260809100000_security_hardening_economy
--     .sql:148-190 (via la policy "user_passes insert own", garantisce la RPC
--     atomica activate_day_pass che addebita 200 crediti). Sicuro anche se già
--     applicato. NON tocca consume_credits/refund_credits (già blindate lì).
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 1 — poi_details: lettura pubblica, scritture solo service_role.
-- Via TUTTE le policy esistenti (nomi ignoti compresi), poi solo SELECT.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.poi_details') IS NULL THEN
    RAISE NOTICE 'poi_details: assente, salto'; RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.poi_details ENABLE ROW LEVEL SECURITY';
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='poi_details'
  LOOP EXECUTE format('DROP POLICY %I ON public.poi_details', pol.policyname); END LOOP;
  EXECUTE 'CREATE POLICY "poi_details_public_read" ON public.poi_details
             FOR SELECT TO anon, authenticated USING (true)';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 1 — poi_audioguides: idem. Il LEFT JOIN in area_bundle_pois gira come
-- service_role (rotta server /api/area/bundle) → la RLS non lo tocca.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.poi_audioguides') IS NULL THEN
    RAISE NOTICE 'poi_audioguides: assente, salto'; RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.poi_audioguides ENABLE ROW LEVEL SECURITY';
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='poi_audioguides'
  LOOP EXECUTE format('DROP POLICY %I ON public.poi_audioguides', pol.policyname); END LOOP;
  EXECUTE 'CREATE POLICY "poi_audioguides_public_read" ON public.poi_audioguides
             FOR SELECT TO anon, authenticated USING (true)';
END $$;

-- FIX 1b — increment_audioguide_play deve restare eseguibile dopo il lock: con
-- RLS attiva e solo SELECT per anon/authenticated, l'UPDATE via questa funzione
-- (LANGUAGE sql, non definer) filtrerebbe 0 righe e play_count non crescerebbe
-- più. La ricreiamo SECURITY DEFINER così bypassa la RLS (identica altrimenti).
CREATE OR REPLACE FUNCTION public.increment_audioguide_play(target_id BIGINT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  UPDATE public.poi_audioguides SET play_count = play_count + 1 WHERE id = target_id;
$fn$;
GRANT EXECUTE ON FUNCTION public.increment_audioguide_play(BIGINT) TO anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 2 — user_rewards_claimed: RLS on, SELECT-own, nessuna scrittura client.
-- Droppa anche la vecchia "Users can insert own claimed rewards" (se presente)
-- che permetteva la forgiatura dei riscatti.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.user_rewards_claimed') IS NULL THEN
    RAISE NOTICE 'user_rewards_claimed: assente, salto'; RETURN;
  END IF;
  EXECUTE 'ALTER TABLE public.user_rewards_claimed ENABLE ROW LEVEL SECURITY';
  FOR pol IN SELECT policyname FROM pg_policies
             WHERE schemaname='public' AND tablename='user_rewards_claimed'
  LOOP EXECUTE format('DROP POLICY %I ON public.user_rewards_claimed', pol.policyname); END LOOP;
  EXECUTE 'CREATE POLICY "user_rewards_claimed_select_own" ON public.user_rewards_claimed
             FOR SELECT TO authenticated USING (auth.uid() = user_id)';
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 9 — Day Pass: niente più INSERT diretto in user_passes; attivazione solo
-- via la RPC atomica activate_day_pass (addebita 200 crediti, cap=40 / 24h).
-- Base: 20260809100000_security_hardening_economy.sql:148-190 (riprodotta
-- verbatim). Sicuro anche se già applicato.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.user_passes') IS NULL THEN
    RAISE NOTICE 'user_passes: assente, salto drop policy'; RETURN;
  END IF;
  EXECUTE 'DROP POLICY IF EXISTS "user_passes insert own" ON public.user_passes';
END $$;

create or replace function public.activate_day_pass()
returns public.user_passes
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_existing int;
    v_charged boolean;
    v_row public.user_passes;
begin
    if v_uid is null then
        raise exception 'login_required';
    end if;

    -- Un solo pass attivo per volta.
    select count(*) into v_existing
    from public.user_passes
    where user_id = v_uid and expires_at > now();
    if v_existing > 0 then
        raise exception 'pass_already_active';
    end if;

    -- Addebito atomico (200 = PRICING_LIST.day_pass). consume_credits è la
    -- versione blindata di 20260809100000 (guardia identità + service_role).
    v_charged := public.consume_credits(v_uid, 200);
    if not v_charged then
        raise exception 'insufficient_credits';
    end if;

    insert into public.user_passes
        (user_id, pass_type, expires_at, guides_used, guides_cap)
    values
        (v_uid, 'day', now() + interval '24 hours', 0, 40)
    returning * into v_row;

    return v_row;
end;
$$;

grant execute on function public.activate_day_pass() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE (eseguire a mano nell'SQL editor)
--
-- 1) RLS attiva sulle tre tabelle:
--   select tablename, rowsecurity from pg_tables where schemaname='public'
--     and tablename in ('poi_details','poi_audioguides','user_rewards_claimed');
--     -- rowsecurity deve essere true su tutte e tre
--
-- 2) Solo policy di SELECT (nessuna INSERT/UPDATE/DELETE/ALL per anon/auth):
--   select tablename, policyname, cmd, roles from pg_policies
--    where schemaname='public'
--      and tablename in ('poi_details','poi_audioguides','user_rewards_claimed')
--    order by tablename, cmd;
--     -- atteso: poi_details_public_read (SELECT), poi_audioguides_public_read
--     --         (SELECT), user_rewards_claimed_select_own (SELECT) e nient'altro
--
-- 3) Day Pass: la policy di INSERT client deve essere sparita e la RPC esistere:
--   select policyname, cmd from pg_policies
--    where schemaname='public' and tablename='user_passes';
--     -- NON deve comparire "user_passes insert own"
--   select proname from pg_proc where proname='activate_day_pass';
--     -- deve comparire una riga
-- ═══════════════════════════════════════════════════════════════════════════
