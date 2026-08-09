-- ---------------------------------------------------------------------------
-- FIX SICUREZZA: furto crediti via coupon
--
-- La policy introdotta in 20260731120000_security_hardening.sql:
--
--     create policy "coupons read" on public.coupons
--       for select to authenticated using (true);
--
-- lasciava leggere TUTTI i coupon a QUALSIASI utente loggato. Chiunque poteva
-- quindi enumerare i codici voucher (che regalano crediti) e riscattarli =
-- furto di crediti.
--
-- La lettura diretta della tabella `coupons` viene ora ristretta ai SOLI
-- admin. Il pannello B2B non legge più la tabella dal client: passa dalla
-- route server autenticata POST /api/coupon/list-for-structure, che usa la
-- service key (bypassa la RLS) e ritorna solo i coupon di UNA struttura.
-- Il riscatto continua ad avvenire via la RPC atomica public.redeem_coupon
-- (security definer), non toccata qui.
--
-- DA APPLICARE A MANO sul progetto Supabase (SQL editor) — non c'è pipeline
-- di migration automatica in questo repo.
-- ---------------------------------------------------------------------------

alter table public.coupons enable row level security;

-- Sostituisce la vecchia policy permissiva con lettura SOLO admin.
drop policy if exists "coupons read" on public.coupons;
create policy "coupons read" on public.coupons
  for select to authenticated using (public.is_admin());

-- (la policy "coupons admin write" definita in 20260731120000 resta valida)
