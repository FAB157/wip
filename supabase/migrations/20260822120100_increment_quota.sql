-- Incremento ATOMICO del contatore giornaliero anti-abuso (user_quotas).
-- server.ts::incrementQuotaCount faceva GET-then-PATCH: due richieste
-- parallele dello stesso utente leggevano lo stesso valore e una delle due
-- perdeva l'incremento. Qui una sola UPDATE, con reset se quota_date è di
-- un giorno passato e creazione della riga se manca.
-- Chiamata con la service role (server.ts); negata ad anon/authenticated.

CREATE OR REPLACE FUNCTION public.increment_quota(
  p_user_id uuid,
  p_feature text,
  p_delta integer DEFAULT 1
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new integer;
BEGIN
  IF p_feature NOT IN ('itinerari', 'audioguide', 'vision', 'premium_guide') THEN
    RAISE EXCEPTION 'increment_quota: feature sconosciuta %', p_feature;
  END IF;

  INSERT INTO public.user_quotas (user_id, plan_type, quota_date)
  VALUES (p_user_id, 'unified', CURRENT_DATE)
  ON CONFLICT (user_id) DO NOTHING;

  -- Reset giornaliero nella stessa transazione
  UPDATE public.user_quotas
     SET itinerari_used = 0, audioguide_used = 0, vision_used = 0, premium_guide_used = 0,
         quota_date = CURRENT_DATE
   WHERE user_id = p_user_id AND quota_date < CURRENT_DATE;

  EXECUTE format(
    'UPDATE public.user_quotas SET %I = COALESCE(%I, 0) + $1, updated_at = now() WHERE user_id = $2 RETURNING %I',
    p_feature || '_used', p_feature || '_used', p_feature || '_used'
  ) INTO v_new USING GREATEST(p_delta, 0), p_user_id;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_quota(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_quota(uuid, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_quota(uuid, text, integer) TO service_role;
