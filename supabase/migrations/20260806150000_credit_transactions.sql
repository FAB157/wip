-- STORICO CREDITI + BLINDATURA CHAT
--
-- 1) credit_transactions: ogni movimento di crediti lascia una riga. Finora
--    esisteva solo il SALDO (purchased/earned su user_profiles): impossibile
--    sapere quanto un utente ha acquistato o consumato nel tempo. Scrivono:
--    - le RPC consume_credits / refund_credits (aggiornate qui sotto);
--    - i webhook Stripe/RevenueCat via server (service role) per gli acquisti.
-- 2) user_chat_sessions: contatore server-side dei messaggi chat "general"
--    (le chat degli itinerari usano itineraries.metadata). Il client non può
--    più regalarsi messaggi svuotando il localStorage.

-- ---------------------------------------------------------------------------
-- 1. Tabella transazioni
-- ---------------------------------------------------------------------------
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount int not null,          -- positivo = accredito, negativo = consumo
  type text not null,           -- purchase | consume | refund | bonus
  source text,                  -- stripe | revenuecat | rpc | admin | coupon
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_transactions_user
  on public.credit_transactions (user_id, created_at desc);

alter table public.credit_transactions enable row level security;

-- Lettura: il proprietario e gli admin. NESSUNA policy di insert/update per
-- authenticated: scrivono solo le funzioni security definer e il service role.
drop policy if exists "credit_transactions select own or admin" on public.credit_transactions;
create policy "credit_transactions select own or admin" on public.credit_transactions
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin_user());

-- ---------------------------------------------------------------------------
-- 2. consume_credits: identica alla versione precedente + riga di log
-- ---------------------------------------------------------------------------
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

    -- Storico: ogni consumo lascia traccia
    INSERT INTO public.credit_transactions (user_id, amount, type, source)
    VALUES (p_user_id, -p_amount, 'consume', 'rpc');

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. refund_credits: identica + riga di log
-- ---------------------------------------------------------------------------
create or replace function public.refund_credits(p_amount int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 or p_amount > 1000 then
    return false;
  end if;
  update public.user_profiles
     set purchased_credits = coalesce(purchased_credits, 0) + p_amount
   where id = auth.uid();
  if not found then
    return false;
  end if;
  insert into public.credit_transactions (user_id, amount, type, source)
  values (auth.uid(), p_amount, 'refund', 'rpc');
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Contatore chat "general" lato server (le chat itinerario usano
--    itineraries.metadata.chat_messages_left, gestito dal server)
-- ---------------------------------------------------------------------------
create table if not exists public.user_chat_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages_left int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_chat_sessions enable row level security;

drop policy if exists "chat_sessions select own" on public.user_chat_sessions;
create policy "chat_sessions select own" on public.user_chat_sessions
  for select to authenticated using (auth.uid() = user_id);
-- Scritture: solo il server (service role).
