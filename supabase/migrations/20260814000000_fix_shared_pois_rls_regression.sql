-- ═══════════════════════════════════════════════════════════════════════════
-- FIX REGRESSIONE RLS shared_pois — DA APPLICARE A MANO (Supabase SQL editor)
--
-- Problema: 20260809180000_hardening_shared_pois_rls.sql aveva già chiuso
-- correttamente shared_pois (INSERT authenticated limitato ai soli POI grezzi
-- status='auto'/non-gemma/non-nascosti, UPDATE e DELETE riservati agli admin).
-- La migration successiva 20260811120000_redteam_critical_fixes.sql (righe
-- ~119-132), applicata DOPO in ordine cronologico, ha ricreato la tabella con
-- policy MOLTO più permissive:
--   "shared_pois_auth_insert" FOR INSERT TO authenticated WITH CHECK (true)
--   "shared_pois_auth_update" FOR UPDATE TO authenticated USING (true) WITH CHECK (true)
-- cioè QUALSIASI utente autenticato può inserire un POI già 'verified'/is_gem
-- o RISCRIVERE (defacement) qualunque riga esistente — la stessa falla che
-- 20260809180000 era nata per chiudere, riaperta senza che nessuno se ne
-- accorgesse (i due file non si "vedono" a vicenda, sono entrambi
-- "idempotenti" ma sull'ultimo applicato vince l'ultimo CREATE POLICY).
--
-- Questa migration ristabilisce lo stato restrittivo di 20260809180000 e va
-- applicata DOPO 20260811120000 (nome/ordine cronologico successivo) così
-- che il suo CREATE POLICY sia l'ultimo a vincere.
--
-- Prima di applicare, fotografa lo stato con la query di verifica in fondo.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

DO $$
DECLARE pol record;
BEGIN
  IF to_regclass('public.shared_pois') IS NULL THEN
    RAISE NOTICE 'shared_pois: assente, salto'; RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.shared_pois ENABLE ROW LEVEL SECURITY';

  -- Via TUTTE le policy esistenti (nomi ignoti compresi): non ci fidiamo di
  -- droppare solo per nome, la storia di questa tabella dice che ne resta
  -- sempre una permissiva da qualche migration precedente.
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shared_pois'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.shared_pois', pol.policyname);
  END LOOP;

  -- 1) Lettura pubblica (mappa, ricerca): invariata.
  EXECUTE 'CREATE POLICY "shared_pois_public_read" ON public.shared_pois
             FOR SELECT USING (true)';

  -- 2) Crowdsourcing: un utente autenticato può INSERIRE solo POI grezzi
  --    (status auto-import, non gemma, non nascosti). Editare l'identità di
  --    una riga ESISTENTE non passa da qui: INSERT crea solo righe nuove.
  --    NIENTE 'verified', NIENTE is_gem dal client: quelli spettano alla
  --    curazione/admin/service key.
  EXECUTE 'CREATE POLICY "shared_pois_auth_insert_auto" ON public.shared_pois
             FOR INSERT TO authenticated
             WITH CHECK (
               coalesce(status, ''auto'') = ''auto''
               AND coalesce(is_gem, false) = false
               AND coalesce(is_hidden, false) = false
             )';

  -- 3) UPDATE e DELETE: SOLO admin. Le scritture curate legittime (arricchimento
  --    AI, traduzioni, moderazione Vision, ecc.) passano tutte dal server con
  --    la service key, che bypassa la RLS — non hanno bisogno di una policy
  --    "authenticated" permissiva.
  EXECUTE 'CREATE POLICY "shared_pois_admin_update" ON public.shared_pois
             FOR UPDATE TO authenticated
             USING (public.is_admin_user()) WITH CHECK (public.is_admin_user())';
  EXECUTE 'CREATE POLICY "shared_pois_admin_delete" ON public.shared_pois
             FOR DELETE TO authenticated
             USING (public.is_admin_user())';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE (eseguire a mano nell'SQL editor)
--
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where tablename = 'shared_pois'
--   order by cmd, policyname;
--
--   Atteso (4 righe, nessun WITH CHECK/USING "true" su INSERT/UPDATE):
--     shared_pois_public_read       | SELECT | true                | (null)
--     shared_pois_auth_insert_auto  | INSERT | (null)               | status='auto' AND is_gem=false AND is_hidden=false
--     shared_pois_admin_update      | UPDATE | is_admin_user()      | is_admin_user()
--     shared_pois_admin_delete      | DELETE | is_admin_user()      | (null)
--
--   Se compare ANCORA "shared_pois_auth_insert"/"shared_pois_auth_update" con
--   USING/WITH CHECK = true, questa migration non è stata applicata (o è
--   stata sovrascritta da una migration successiva non coordinata: verificare
--   l'ordine di applicazione).
-- ═══════════════════════════════════════════════════════════════════════════
