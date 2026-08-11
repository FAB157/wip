-- Crediti di benvenuto SOLO a email confermata.
--
-- PROBLEMA: earned_credits nasceva a DEFAULT 100 alla creazione del profilo.
-- Con la conferma email disattivata (o via chiamate dirette alle API auth)
-- chiunque poteva registrare email INVENTATE e inesistenti e farmare 100
-- crediti a ogni account, all'infinito.
--
-- SOLUZIONE (tre pezzi, questo è il pezzo DB):
--   1. Dashboard Supabase: Authentication → Sign In / Providers → Email →
--      attivare "Confirm email" (le email inventate non accedono proprio).
--   2. Questa migration: il profilo nasce a 0 crediti.
--   3. Server: /api/welcome-bonus/claim eroga i 100 crediti UNA volta sola,
--      quando l'email risulta confermata (idempotente su user_rewards_claimed,
--      solo account creati dopo il 2026-08-12 — i precedenti hanno già avuto
--      il default storico).
--
-- DA APPLICARE A MANO nell'SQL editor, come le altre migration.

ALTER TABLE public.user_profiles ALTER COLUMN earned_credits SET DEFAULT 0;

-- AUDIT (facoltativo): account MAI confermati che hanno già crediti — i
-- sospetti farm. Da valutare a mano prima di eventuali azzeramenti.
-- SELECT u.email, u.created_at, p.earned_credits, p.purchased_credits
--   FROM auth.users u
--   JOIN public.user_profiles p ON p.id = u.id
--  WHERE u.email_confirmed_at IS NULL
--    AND coalesce(p.earned_credits, 0) > 0
--  ORDER BY u.created_at DESC;
