-- =====================================================================
-- BLINDATURA ECONOMIA — WIP (2026-08-09)
--
-- Chiude i bypass emersi dall'audit del 9/8/2026 (paywall client-side):
--   1. consume_credits accettava un p_user_id arbitrario → prosciugamento
--      del wallet altrui conoscendone l'UUID.
--   2. refund_credits accreditava senza verificare un addebito reale →
--      stampante di crediti dalla console del browser.
--   3. user_passes: INSERT diretto consentito → Day Pass gratis con
--      guides_cap arbitrario (il trigger guardia copre solo gli UPDATE).
--   4. i contatori anti-abuso *_used / quota_date erano azzerabili
--      dall'utente (il trigger proteggeva solo *_limit).
--   5. user_listening_history: insert massivo self-service → tutto il
--      catalogo audioguide "già acquistato = gratis".
--
-- DA APPLICARE A MANO sull'SQL editor di Supabase. Nessun indice pesante.
-- Va deployata INSIEME al client aggiornato (che non incrementa più le
-- quote lato browser e attiva il Day Pass via RPC activate_day_pass).
-- =====================================================================

set lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. consume_credits: può operare SOLO sul proprio wallet (o service_role)
--    Firma e logica invariate; aggiunta solo la guardia d'identità in testa.
-- ---------------------------------------------------------------------------
create or replace function public.consume_credits(p_user_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_earned integer;
    v_purchased integer;
    v_remaining_cost integer;
begin
    -- GUARDIA IDENTITÀ: un utente autenticato può spendere solo i propri
    -- crediti. Il server (service_role) resta libero di operare per conto
    -- di chiunque (webhook, riconciliazioni).
    if p_user_id is distinct from auth.uid()
       and coalesce(auth.role(), '') <> 'service_role' then
        return false;
    end if;

    if p_amount is null or p_amount <= 0 then
        return false;
    end if;

    select earned_credits, purchased_credits
    into v_earned, v_purchased
    from public.user_profiles
    where id = p_user_id
    for update;

    if not found then
        return false;
    end if;

    if (v_earned + v_purchased) < p_amount then
        return false;
    end if;

    v_remaining_cost := p_amount;

    if v_earned >= v_remaining_cost then
        v_earned := v_earned - v_remaining_cost;
        v_remaining_cost := 0;
    else
        v_remaining_cost := v_remaining_cost - v_earned;
        v_earned := 0;
    end if;

    if v_remaining_cost > 0 then
        v_purchased := v_purchased - v_remaining_cost;
    end if;

    update public.user_profiles
    set earned_credits = v_earned,
        purchased_credits = v_purchased
    where id = p_user_id;

    insert into public.credit_transactions (user_id, amount, type, source)
    values (p_user_id, -p_amount, 'consume', 'rpc');

    return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. refund_credits: rimborsabile SOLO fino a quanto è stato realmente
--    consumato e non ancora rimborsato nelle ultime 2 ore. Toglie il loop
--    di stampa senza rompere il flusso client (che rimborsa solo DOPO aver
--    consumato: es. generazione guida/podcast fallita).
-- ---------------------------------------------------------------------------
create or replace function public.refund_credits(p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_consumed integer;
    v_refunded integer;
begin
    if p_amount is null or p_amount <= 0 or p_amount > 1000 then
        return false;
    end if;

    -- Copertura: somma dei consumi delle ultime 2h dell'utente...
    select coalesce(sum(-amount), 0) into v_consumed
    from public.credit_transactions
    where user_id = auth.uid()
      and type = 'consume'
      and created_at > now() - interval '2 hours';

    -- ...meno quanto già rimborsato nella stessa finestra.
    select coalesce(sum(amount), 0) into v_refunded
    from public.credit_transactions
    where user_id = auth.uid()
      and type = 'refund'
      and created_at > now() - interval '2 hours';

    if v_refunded + p_amount > v_consumed then
        -- Nessun addebito recente che giustifichi questo rimborso.
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
-- 3. Day Pass: niente più INSERT diretto. L'attivazione passa da una RPC
--    atomica che addebita 200 crediti e fissa cap=40 / 24h lato server.
-- ---------------------------------------------------------------------------
drop policy if exists "user_passes insert own" on public.user_passes;

create or replace function public.activate_day_pass()
returns public.user_passes
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid := auth.uid();
    v_existing int;
    v_charged boolean;
    v_row public.user_passes;
begin
    if v_uid is null then
        raise exception 'login_required';
    end if;

    -- Un solo pass attivo per volta.
    select count(*) into v_existing
    from public.user_passes
    where user_id = v_uid and expires_at > now();
    if v_existing > 0 then
        raise exception 'pass_already_active';
    end if;

    -- Addebito atomico (200 = PRICING_LIST.day_pass).
    v_charged := public.consume_credits(v_uid, 200);
    if not v_charged then
        raise exception 'insufficient_credits';
    end if;

    insert into public.user_passes
        (user_id, pass_type, expires_at, guides_used, guides_cap)
    values
        (v_uid, 'day', now() + interval '24 hours', 0, 40)
    returning * into v_row;

    return v_row;
end;
$$;

grant execute on function public.activate_day_pass() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Contatori anti-abuso non azzerabili dall'utente: estende la protezione
--    a *_used e quota_date (prima solo *_limit / plan_type). Il server e gli
--    admin passano. NB: da deployare col client che NON incrementa più le
--    quote lato browser (il server è l'unica autorità sul contatore).
-- ---------------------------------------------------------------------------
create or replace function public.protect_quota_limit_cols()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or public.is_admin_user() then
    return new;
  end if;
  if new.itinerari_limit is distinct from old.itinerari_limit
     or new.audioguide_limit is distinct from old.audioguide_limit
     or new.vision_limit is distinct from old.vision_limit
     or new.premium_guide_limit is distinct from old.premium_guide_limit
     or new.plan_type is distinct from old.plan_type
     -- Nuovi: i contatori d'uso e la data di reset sono scrivibili solo
     -- dal server. Prima l'utente li azzerava per aggirare il tetto 30/500/20.
     or new.itinerari_used is distinct from old.itinerari_used
     or new.audioguide_used is distinct from old.audioguide_used
     or new.vision_used is distinct from old.vision_used
     or new.premium_guide_used is distinct from old.premium_guide_used
     or new.quota_date is distinct from old.quota_date then
    raise exception 'Campo riservato: modifica non consentita';
  end if;
  return new;
end $$;

-- Il trigger trg_protect_quota_cols esiste già e punta a questa funzione
-- (rls_user_profiles_2026-08-05.sql): il CREATE OR REPLACE basta.

-- ---------------------------------------------------------------------------
-- 5. Storico ascolti: mitigazione anti-sblocco-di-massa.
--    Non si restringe l'INSERT a service_role — i client NATIVI (Android/iOS,
--    già in produzione) registrano gli ascolti via REST con il token utente e
--    si romperebbero. Si mette invece un tetto di frequenza: gli ascolti reali
--    sono pochi al giorno, un insert massivo per sbloccare il catalogo no.
--    La chiusura DEFINITIVA del buco (autorizzazione legata al pagamento, non
--    alla presenza in storico) è una scelta di prodotto: vedi nota in coda.
-- ---------------------------------------------------------------------------
create or replace function public.tg_listening_history_ratelimit()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
    v_recent int;
begin
    if auth.role() = 'service_role' or public.is_admin_user() then
        return new;
    end if;
    select count(*) into v_recent
    from public.user_listening_history
    where user_id = new.user_id
      and listened_at > now() - interval '1 hour';
    -- 40 ascolti/ora = il cap giornaliero del Day Pass: oltre è abuso.
    if v_recent >= 40 then
        raise exception 'listening_rate_limit';
    end if;
    return new;
end $$;

drop trigger if exists trg_listening_history_ratelimit on public.user_listening_history;
create trigger trg_listening_history_ratelimit
  before insert on public.user_listening_history
  for each row execute function public.tg_listening_history_ratelimit();

-- =====================================================================
-- NOTA DI PRODOTTO (non applicata qui, richiede una decisione):
-- La feature "già ascoltato = gratis per sempre" (dayPassService
-- .authorizeGuidePlayback) usa la presenza in user_listening_history come
-- prova d'acquisto. Finché la registrazione dell'ascolto è scrivibile dal
-- client, resta falsificabile (il rate-limit qui sopra la rende lenta, non
-- impossibile). La chiusura piena richiede di legare l'autorizzazione a un
-- movimento reale di credit_transactions o a un pass attivo AL MOMENTO
-- dell'ascolto, e va coordinata con i tre client (web + Android + iOS).
--
-- ROLLBACK:
--   drop trigger if exists trg_listening_history_ratelimit on public.user_listening_history;
--   -- e ripristinare le versioni precedenti di consume_credits/refund_credits
--   -- da 20260806150000_credit_transactions.sql, la policy insert da
--   -- 20260806120000_day_pass.sql, la funzione protect_quota_limit_cols da
--   -- rls_user_profiles_2026-08-05.sql.
-- =====================================================================
