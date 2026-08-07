-- Migrazione per transizione all'economia a crediti (ItaInta Coins)

-- 1. Aggiungiamo le colonne del portafoglio crediti alla tabella user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS purchased_credits INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS earned_credits INTEGER DEFAULT 100;

-- 2. Eliminiamo i campi legacy dei bonus giornalieri / abbonamenti se vogliamo, ma per 
-- retrocompatibilità con vecchie build possiamo semplicemente smettere di usarli.
-- Non droppiamo subito le colonne legacy per evitare crash di client non aggiornati.

-- 3. Creiamo una stored procedure per consumare crediti in modo transazionale e concorrenziale.
-- Prova a consumare 'p_amount' crediti. Prima consuma da earned, poi da purchased.
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
    -- Seleziona e blocca la riga per evitare race conditions (FOR UPDATE)
    SELECT earned_credits, purchased_credits 
    INTO v_earned, v_purchased
    FROM public.user_profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Controlla se il saldo totale è sufficiente
    IF (v_earned + v_purchased) < p_amount THEN
        RETURN FALSE;
    END IF;

    v_remaining_cost := p_amount;

    -- 1. Preleva dai crediti guadagnati (earned)
    IF v_earned >= v_remaining_cost THEN
        v_earned := v_earned - v_remaining_cost;
        v_remaining_cost := 0;
    ELSE
        v_remaining_cost := v_remaining_cost - v_earned;
        v_earned := 0;
    END IF;

    -- 2. Se c'è ancora costo residuo, preleva dai crediti acquistati (purchased)
    IF v_remaining_cost > 0 THEN
        v_purchased := v_purchased - v_remaining_cost;
    END IF;

    -- Salva i nuovi saldi
    UPDATE public.user_profiles
    SET earned_credits = v_earned,
        purchased_credits = v_purchased
    WHERE id = p_user_id;

    RETURN TRUE;
END;
$$;
