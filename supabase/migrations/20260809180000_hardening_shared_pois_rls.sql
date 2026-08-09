-- ─────────────────────────────────────────────────────────────────────────
-- HARDENING shared_pois — la falla a raggio più ampio dell'audit 2026-08-09.
-- DA APPLICARE A MANO su Supabase (SQL editor).
--
-- Problema: la policy storica "Allow authenticated upsert on shared_pois"
-- (FOR ALL TO public USING(true) WITH CHECK(true)) NON è stata droppata per
-- nome dalle hardening precedenti. Se è ancora viva, un anon può
-- INSERT/UPDATE/DELETE qualsiasi POI: la DELETE fa scattare il trigger
-- tombstone e propaga la cancellazione a OGNI pacchetto offline su OGNI
-- dispositivo al primo sync. Le scritture legittime passano dal server
-- (service_role, che bypassa la RLS).
-- ─────────────────────────────────────────────────────────────────────────
set lock_timeout = '5s';

ALTER TABLE public.shared_pois ENABLE ROW LEVEL SECURITY;

-- 1) Via TUTTE le policy esistenti su shared_pois (nomi ignoti compresi):
--    non ci fidiamo di droppare per nome, la storia dice che ne resta sempre una.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shared_pois'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.shared_pois', pol.policyname);
  END LOOP;
END $$;

-- 2) Lettura pubblica.
CREATE POLICY "shared_pois_public_read" ON public.shared_pois
  FOR SELECT USING (true);

-- 3) Crowdsourcing: un utente autenticato può INSERIRE solo POI grezzi
--    (status='auto', non gemma, non nascosti). NIENTE 'verified', NIENTE
--    is_gem: quelli spettano alla revisione/admin. È l'intento della
--    hardening del 31/07 mai applicato, ora esplicito.
CREATE POLICY "shared_pois_auth_insert_auto" ON public.shared_pois
  FOR INSERT TO authenticated
  WITH CHECK (
    coalesce(status, 'auto') = 'auto'
    AND coalesce(is_gem, false) = false
    AND coalesce(is_hidden, false) = false
  );

-- 4) UPDATE e DELETE: SOLO admin. Chiude la DELETE anonima che, via trigger
--    tombstone, propagava la cancellazione a ogni dispositivo offline.
--    Ogni altra scrittura curata passa dal server (service_role, bypassa RLS).
CREATE POLICY "shared_pois_admin_update" ON public.shared_pois
  FOR UPDATE TO authenticated
  USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY "shared_pois_admin_delete" ON public.shared_pois
  FOR DELETE TO authenticated
  USING (public.is_admin_user());

-- 4) Estendi la guardia colonne di review a INSERT/DELETE, non solo UPDATE:
--    così nessun client può nascere già 'verified' o cancellare una riga.
--    (Se il trigger/funzione non esiste in questo ambiente, ignora questo blocco.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'protect_poi_review_columns') THEN
    DROP TRIGGER IF EXISTS trg_protect_poi_review_columns ON public.shared_pois;
    CREATE TRIGGER trg_protect_poi_review_columns
      BEFORE INSERT OR UPDATE OR DELETE ON public.shared_pois
      FOR EACH ROW EXECUTE FUNCTION public.protect_poi_review_columns();
  END IF;
END $$;
