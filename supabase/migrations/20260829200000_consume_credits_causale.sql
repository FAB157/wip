-- ═══════════════════════════════════════════════════════════════════════════
-- COSA HA ADDEBITATO QUEI CREDITI? (29/08/2026)
--
-- Collaudo sul telefono: il libro mastro (`credit_transactions`) registra ogni
-- consumo con importo e ora, ma `description` è NULL su TUTTE le righe di tipo
-- 'consume' — solo le rettifiche admin hanno una causale. Verificato sul
-- database reale: 33 consumi, tutti senza descrizione.
--
-- Conseguenza pratica: se un utente contesta un addebito («mi avete tolto 200
-- crediti e non so perché»), nel pannello admin si legge solo «consume -200 ·
-- rpc». Non si può rispondere, né distinguere un Day Pass da un'audioguida
-- più un podcast. È esattamente il caso in cui il libro mastro serve.
--
-- Causa: `consume_credits(p_user_id, p_amount)` non ha mai avuto un parametro
-- per la causale, e il server (`consumeCreditsServer` in server.ts) può solo
-- passare utente e importo.
--
-- Questa migration aggiunge un SECONDO consume_credits a TRE argomenti, con la
-- causale. Non tocca quello a due: le build già installate continuano a
-- chiamarlo e a funzionare (scrivono description NULL, come oggi). Il server
-- nuovo chiama la versione a tre e, se il database non è ancora aggiornato,
-- ripiega da solo su quella a due.
--
-- IDEMPOTENTE: si può applicare più volte.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.consume_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_description TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_earned INTEGER;
    v_purchased INTEGER;
    v_remaining_cost INTEGER;
BEGIN
    -- Stessa logica della versione a due argomenti (earned-first, riga
    -- bloccata con FOR UPDATE per le corse): cambia SOLO la causale scritta
    -- nel libro mastro.
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

    INSERT INTO public.credit_transactions (user_id, amount, type, source, description)
    VALUES (
        p_user_id,
        -p_amount,
        'consume',
        'rpc',
        -- Causale tagliata a 200 caratteri: è un'etichetta, non un log.
        NULLIF(left(coalesce(p_description, ''), 200), '')
    );

    RETURN TRUE;
END;
$$;

-- Stessi permessi della versione a due argomenti: la chiama il SERVER con la
-- chiave di servizio. Il client non deve poter addebitare da solo (il trigger
-- anti-escalation su user_profiles blocca comunque le scritture dirette).
REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, INTEGER, TEXT) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.consume_credits(UUID, INTEGER, TEXT) IS
  'Addebito atomico earned-first con causale nel libro mastro (29/08/2026). La versione a due argomenti resta per le build vecchie.';

-- ───────────────────────────────────────────────────────────────────────────
-- Il Day Pass e` l'addebito piu` grosso (200 crediti) e passa da una RPC sua,
-- non da chargeOrReject: senza questa riaggiunta resterebbe l'unico consumo
-- senza causale — proprio quello che l'utente nota e contesta.
-- Si ridefinisce SOLO la chiamata a consume_credits; il resto e` identico a
-- 20260809100000_security_hardening_economy.sql.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.user_passes') IS NULL THEN
    RAISE NOTICE 'user_passes assente: salto activate_day_pass';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.activate_day_pass()
    RETURNS public.user_passes
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $body$
    DECLARE
        v_uid uuid := auth.uid();
        v_existing int;
        v_charged boolean;
        v_row public.user_passes;
    BEGIN
        IF v_uid IS NULL THEN
            RAISE EXCEPTION 'login_required';
        END IF;

        SELECT count(*) INTO v_existing
        FROM public.user_passes
        WHERE user_id = v_uid AND expires_at > now();
        IF v_existing > 0 THEN
            RAISE EXCEPTION 'pass_already_active';
        END IF;

        -- Addebito atomico (200 = PRICING_LIST.day_pass), ORA CON CAUSALE.
        v_charged := public.consume_credits(v_uid, 200, 'day_pass 24h');
        IF NOT v_charged THEN
            RAISE EXCEPTION 'insufficient_credits';
        END IF;

        INSERT INTO public.user_passes
            (user_id, pass_type, expires_at, guides_used, guides_cap)
        VALUES
            (v_uid, 'day', now() + interval '24 hours', 0, 40)
        RETURNING * INTO v_row;

        RETURN v_row;
    END;
    $body$;
  $fn$;

  EXECUTE 'GRANT EXECUTE ON FUNCTION public.activate_day_pass() TO authenticated';
END $$;
