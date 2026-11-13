-- PAGAMENTI — correttivi dalla verifica del 20/09/2026.

-- 1. credit_purchase: se il profilo non esiste l'UPDATE non toccava nessuna riga e la funzione tornava comunque true:
--    PAGATO, scritto a registro, MAI accreditato — e non più recuperabile, perché il retry del gateway trova l'evento
--    già registrato. Ora l'accredito è un upsert (come add_credits): il profilo nasce coi crediti dentro.
CREATE OR REPLACE FUNCTION public.credit_purchase(p_user_id uuid, p_amount integer, p_source text, p_event_id text, p_description text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_amount is null or p_amount <= 0 or p_user_id is null then
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

  insert into public.user_profiles (id, purchased_credits)
  values (p_user_id, p_amount)
  on conflict (id) do update
    set purchased_credits = coalesce(public.user_profiles.purchased_credits, 0) + p_amount;

  return true;
exception
  when unique_violation then
    -- Due consegne concorrenti dello stesso evento: la seconda perde la
    -- corsa sull'unique index e non accredita. Idempotenza garantita.
    return true;
end;
$function$;

-- 2. Rimborso chiesto dal CLIENT (/api/credits/refund). Prima rimborsava QUALUNQUE consumo delle ultime 2 ore, senza
--    legarlo a un guasto: Day Pass (200) attivato e poi ripreso tenendo il pass; e le due letture + la scrittura non
--    erano atomiche, quindi dieci richieste parallele coniavano crediti. Ora:
--      · si rimborsano SOLO i consumi che il client ha fatto da sé con /api/credits/consume (causale 'client:…':
--        pacchetti di audioguide e spesa offline). I servizi addebitati dal server (Day Pass, Visita museo,
--        audioguida col possesso, itinerari, guide…) li rimborsa il server quando falliscono, mai il client;
--      · la riga del profilo è bloccata FOR UPDATE: le richieste dello stesso utente vanno in fila.
CREATE OR REPLACE FUNCTION public.refund_client_consume(p_user_id uuid, p_amount integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_consumed integer;
  v_refunded integer;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 2000 or p_user_id is null then
    return false;
  end if;

  perform 1 from public.user_profiles where id = p_user_id for update;
  if not found then
    return false;
  end if;

  select coalesce(sum(-amount), 0) into v_consumed
  from public.credit_transactions
  where user_id = p_user_id and type = 'consume' and description like 'client:%'
    and created_at > now() - interval '2 hours';

  select coalesce(sum(amount), 0) into v_refunded
  from public.credit_transactions
  where user_id = p_user_id and type = 'refund' and source = 'client'
    and created_at > now() - interval '2 hours';

  if v_refunded + p_amount > v_consumed then
    return false;
  end if;

  update public.user_profiles
  set purchased_credits = coalesce(purchased_credits, 0) + p_amount
  where id = p_user_id;

  insert into public.credit_transactions (user_id, amount, type, source, description)
  values (p_user_id, p_amount, 'refund', 'client', 'rimborso chiesto dal client');

  return true;
end;
$function$;
REVOKE ALL ON FUNCTION public.refund_client_consume(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_client_consume(uuid, integer) TO service_role;

-- 3. Vecchia redeem_coupon(p_code): eseguibile da chiunque, senza limite per persona, regalava giorni di premium e
--    consumava gli usi del coupon (AUT15: 2 usi dichiarati, 1 riscatto vero). Il riscatto passa da /api/coupon/redeem;
--    nessun client la chiama più.
REVOKE ALL ON FUNCTION public.redeem_coupon(text) FROM PUBLIC, anon, authenticated;
