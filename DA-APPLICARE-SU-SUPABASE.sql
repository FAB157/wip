-- ═══════════════════════════════════════════════════════════════════════════
--  DA INCOLLARE NEL PANNELLO SUPABASE → SQL EDITOR → RUN
--  (30/08/2026)
--
--  Tre correzioni che NON si possono fare dal codice: servono i permessi di
--  amministratore del database. Le API REST non espongono alcuna funzione per
--  eseguire DDL, quindi qui serve la tua mano una volta sola.
--
--  Si possono eseguire tutte insieme. Sono idempotenti: rilanciarle non fa
--  danni. Dopo l'esecuzione NON serve ridistribuire l'app.
--
--  1. shared_pois: il vincolo rifiuta 'auto' → le tappe non diventano POI
--  2. itinerary_guides: la tabella non esiste → le guide non si archiviano
--  3. consume_credits: la causale non finisce nell'estratto conto crediti
-- ═══════════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';


-- ───────────────────────────────────────────────────────────────────────────
-- 1) LE TAPPE DEGLI ITINERARI DIVENTANO POI
--
-- shared_pois ha un vincolo CHECK (creato a mano dal pannello: non esiste in
-- nessuna migration) che NON ammette status='auto'. Ma 'auto' e' lo stato che
-- TUTTO il codice usa per i POI generati dalla macchina: cron notturno di
-- arricchimento, batch-ensure, discovery Overpass, insertAutoPois, le edge
-- function. Ogni scrittura falliva con 23514 — e in tabella ci sono infatti
-- ZERO righe 'auto' su 7,8 milioni.
--
-- Finche' questo non gira, il server ripiega su 'verified' (funziona, ma
-- 'verified' significa «rivisto da un umano» e scavalca la denylist del
-- radar). Dopo, tutto torna al comportamento previsto e il ripiego non
-- scatta piu' da solo.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_nome text;
  v_def  text;
BEGIN
  IF to_regclass('public.shared_pois') IS NULL THEN
    RAISE NOTICE '[1] shared_pois assente: salto';
    RETURN;
  END IF;

  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO v_nome, v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.shared_pois'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LIMIT 1;

  IF v_nome IS NULL THEN
    RAISE NOTICE '[1] Nessun CHECK su status: niente da fare';
    RETURN;
  END IF;

  RAISE NOTICE '[1] Vincolo trovato: % → %', v_nome, v_def;

  IF v_def ILIKE '%''auto''%' THEN
    RAISE NOTICE '[1] Ammette gia'' auto: niente da fare';
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.shared_pois DROP CONSTRAINT %I', v_nome);

  -- NOT VALID: la tabella ha ~7,8 milioni di righe e una validazione completa
  -- prenderebbe un lock lungo (con lock_timeout=5s fallirebbe). Il vincolo
  -- vale comunque su ogni riga NUOVA o modificata, che e' cio' che serve; le
  -- righe storiche hanno gia' valori legittimi.
  EXECUTE $c$
    ALTER TABLE public.shared_pois
      ADD CONSTRAINT shared_pois_status_check
      CHECK (status IS NULL OR status IN (
        'verified', 'auto', 'approved', 'draft', 'needs_revision', 'rejected', 'hidden'
      )) NOT VALID
  $c$;

  RAISE NOTICE '[1] FATTO: ora shared_pois ammette auto/approved e gli stati di moderazione.';
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2) LE GUIDE PREMIUM SI ARCHIVIANO NELLA TAB ITINERARI
--
-- `itinerary_guides` non esiste sul database (PGRST205). Il codice la usa in
-- nove punti e ogni volta fallisce in silenzio: il salvataggio dopo la
-- generazione, il controllo di cache PRIMA dell'addebito (quindi una guida
-- gia' pagata veniva RIPAGATA), gli strumenti post-acquisto (rigenera giorno,
-- EPUB, traduzione: rispondono «non trovata» a chi l'ha appena comprata) e
-- l'archivio nella tab Itinerari, che resta sempre vuoto.
--
-- Chiave primaria = itinerary_hash: le scritture usano merge-duplicates SENZA
-- on_conflict, e in quel caso PostgREST fonde sulla chiave primaria.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.itinerary_guides (
  itinerary_hash   text PRIMARY KEY,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content_data     jsonb,
  media_manifest   jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_itinerary jsonb,
  stile_guida      text,
  status           text NOT NULL DEFAULT 'completed',
  pdf_url          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS itinerary_guides_user_created_idx
  ON public.itinerary_guides (user_id, created_at DESC);

ALTER TABLE public.itinerary_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guide: lettura del proprietario" ON public.itinerary_guides;
CREATE POLICY "guide: lettura del proprietario"
  ON public.itinerary_guides FOR SELECT
  USING (auth.uid() = user_id);

-- Nessuna policy di scrittura per il client: le guide le scrive SOLO il
-- server con la service role, dopo aver incassato i crediti. Se potesse
-- scriverle il client, chiunque potrebbe inserirsi una guida e farla poi
-- risultare «gia' pagata» al controllo di cache.

COMMENT ON TABLE public.itinerary_guides IS
  'Guide d''autore generate e pagate. Chiave: itinerary_hash. Scrive solo il server (service role); il proprietario legge.';


-- ───────────────────────────────────────────────────────────────────────────
-- 3) LA CAUSALE NELL'ESTRATTO CONTO DEI CREDITI
--
-- consume_credits accetta due argomenti e non registra il MOTIVO: nel
-- movimento resta solo l'importo. Con questa versione a tre argomenti ogni
-- addebito porta la sua causale (audioguida, guida d'autore, itinerario…).
-- Il server prova la forma a 3 e ripiega su quella a 2, quindi funziona sia
-- prima sia dopo.
-- ───────────────────────────────────────────────────────────────────────────
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
        -- Causale tagliata a 200 caratteri: e' un'etichetta, non un log.
        NULLIF(left(coalesce(p_description, ''), 200), '')
    );

    RETURN TRUE;
END;
$$;

-- Stessi permessi della versione a due argomenti: la chiama il SERVER con la
-- chiave di servizio. Il client NON deve poter addebitare da solo.
REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, INTEGER, TEXT) FROM public, anon, authenticated;

COMMENT ON FUNCTION public.consume_credits(UUID, INTEGER, TEXT) IS
  'Addebito atomico earned-first con causale nel libro mastro (29/08/2026). La versione a due argomenti resta per le build vecchie.';

-- Il Day Pass (200 crediti) passa da una RPC sua, non da chargeOrReject:
-- senza questa riaggiunta resterebbe l'unico consumo senza causale — proprio
-- quello che l'utente nota e contesta.
DO $$
BEGIN
  IF to_regclass('public.user_passes') IS NULL THEN
    RAISE NOTICE '[3] user_passes assente: salto activate_day_pass';
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


-- ═══════════════════════════════════════════════════════════════════════════
--  VERIFICA (opzionale): dopo il RUN queste tre righe devono dire di si'.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT pg_get_constraintdef(c.oid) ILIKE '%''auto''%'
     FROM pg_constraint c
    WHERE c.conrelid = 'public.shared_pois'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
    LIMIT 1)                                              AS "1_shared_pois_ammette_auto",
  (to_regclass('public.itinerary_guides') IS NOT NULL)     AS "2_tabella_guide_creata",
  EXISTS (SELECT 1 FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'consume_credits'
            AND p.pronargs = 3)                            AS "3_causale_crediti_attiva";
