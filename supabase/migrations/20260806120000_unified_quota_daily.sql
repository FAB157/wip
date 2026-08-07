-- Limite unico anti-frode con reset giornaliero.
-- Non esistono più tier free/premium per le quote: l'accesso si paga in
-- crediti, il limite serve solo a fermare bot/script/loop.
-- La colonna quota_date abilita il reset giornaliero dei contatori in
-- checkAndIncrementQuota (server.ts): finché non esiste, il codice degrada
-- a un tetto cumulativo alto (5000) senza bloccare nessuno.

ALTER TABLE public.user_quotas
  ADD COLUMN IF NOT EXISTS quota_date date NOT NULL DEFAULT CURRENT_DATE;

-- Allinea i limiti per-riga ai valori unici (usati solo per display admin;
-- il valore effettivo vive in UNIFIED_DAILY_LIMITS in server.ts)
UPDATE public.user_quotas SET
  itinerari_limit = 30,
  audioguide_limit = 500,
  vision_limit = 300,
  premium_guide_limit = 20;
