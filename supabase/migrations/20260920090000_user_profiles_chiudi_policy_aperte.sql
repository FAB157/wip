-- SICUREZZA (20/09/2026) — user_profiles era leggibile, modificabile e CANCELLABILE da chiunque.
-- Tre policy vecchie avevano condizione `true` e nessun ruolo (= valgono anche per gli anonimi):
--   «Users can view own profile»      SELECT  USING (true)
--   «Users can update own profile»    ALL     USING (true)
--   «Admins have full access on profiles» ALL USING (true)
-- Le policy permissive si sommano in OR: bastava una di queste a vanificare quelle giuste. Misurato con la
-- chiave PUBBLICA dell'app, senza login: 99 profili su 99 letti, con email, crediti, is_admin, stripe_customer_id.
-- Il trigger protect_profile_sensitive_cols protegge le colonne dei crediti, ma NON la cancellazione: un profilo
-- cancellato da un estraneo è un portafoglio perso.
-- Restano le policy corrette, già presenti: «read own profile» e «update own profile» (id = auth.uid() OR
-- is_admin()), «insert own profile», «Admins can update all profiles». Il client legge profili altrui solo dai
-- componenti admin, coperti da is_admin(); il server usa la service role; i client nativi non toccano la tabella.
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Admins have full access on profiles" ON public.user_profiles;

-- Un anonimo non ha nessun motivo di toccare i profili: via anche i privilegi di tabella.
REVOKE ALL ON public.user_profiles FROM anon;
-- Un utente non cancella il proprio profilo dal client (la cancellazione dell'account passa dal server).
REVOKE DELETE ON public.user_profiles FROM authenticated;
