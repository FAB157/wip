-- =====================================================================
-- ACCREDITI ATOMICI E IDEMPOTENTI — WIP (2026-08-09)
--
-- I webhook Stripe/RevenueCat accreditavano con GET purchased_credits +
-- PATCH (current + amount): due difetti dall'audit:
--   - non atomico → lost update contro i consumi concorrenti;
--   - idempotenza check-then-set su api_cache col marker scritto PRIMA
--     dell'accredito → o doppio accredito (race) o, se l'accredito falliva
--     dopo il marker, retry rifiutato per sempre = pagato e mai accreditato.
--
-- Questa RPC fa insert-transazione + update saldo in UNA transazione, con
-- unique index su (source, event_id) come idempotenza reale: il secondo
-- arrivo dello stesso evento viola l'unique e NON riaccredita, ma nemmeno
-- perde il primo. Chiamata solo dal server (service_role).
--
-- DA APPLICARE A MANO su Supabase.
-- =====================================================================

set lock_timeout = '5s';

-- Traccia dell'evento di pagamento sulla riga di transazione.
alter table public.credit_transactions
  add column if not exists event_id text;

-- Idempotenza: un evento (source, event_id) accredita una volta sola.
create unique index if not exists uq_credit_tx_source_event
  on public.credit_transactions (source, event_id)
  where event_id is not null;

create or replace function public.credit_purchase(
  p_user_id uuid,
  p_amount integer,
  p_source text,
  p_event_id text,
  p_description text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    return false;
  end if;

  -- Idempotenza: se l'evento è già stato accreditato, esci senza riaccreditare.
  if p_event_id is not null and exists (
    select 1 from public.credit_transactions
    where source = p_source and event_id = p_event_id
  ) then
    return true; -- già fatto: il retry del gateway deve vedere "ok"
  end if;

  -- Transazione + saldo nella stessa transazione (niente lost update).
  insert into public.credit_transactions (user_id, amount, type, source, event_id, description)
  values (p_user_id, p_amount, 'purchase', p_source, p_event_id, p_description);

  update public.user_profiles
  set purchased_credits = coalesce(purchased_credits, 0) + p_amount
  where id = p_user_id;

  return true;
exception
  when unique_violation then
    -- Due consegne concorrenti dello stesso evento: la seconda perde la
    -- corsa sull'unique index e non accredita. Idempotenza garantita.
    return true;
end;
$$;

-- Solo il server (service_role) accredita. Mai il client.
revoke all on function public.credit_purchase(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.credit_purchase(uuid, integer, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Rimborso SERVER-SIDE per un utente specifico. Serve al gate crediti delle
-- rotte costose (chargeOrReject): il server addebita PRIMA di generare e
-- rimborsa se la generazione fallisce. refund_credits (client) opera su
-- auth.uid(), che dal server è null → serve questa variante service_role.
-- ---------------------------------------------------------------------------
create or replace function public.refund_credits_service(p_user_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount is null or p_amount <= 0 then
    return false;
  end if;
  update public.user_profiles
  set purchased_credits = coalesce(purchased_credits, 0) + p_amount
  where id = p_user_id;
  if not found then
    return false;
  end if;
  insert into public.credit_transactions (user_id, amount, type, source)
  values (p_user_id, p_amount, 'refund', 'server');
  return true;
end;
$$;

revoke all on function public.refund_credits_service(uuid, integer) from public, anon, authenticated;
grant execute on function public.refund_credits_service(uuid, integer) to service_role;
