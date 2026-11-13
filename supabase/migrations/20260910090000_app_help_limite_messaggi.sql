-- =====================================================================
-- "AIUTO SULL'APP": tetto di 15 messaggi gratuiti per utente. 10/09/2026.
--
-- La chat /api/app-help (dentro AgentControls, modalità 'aiuto') non passa
-- dal borsellino crediti: risponde solo su come funziona WIP, basandosi sul
-- manuale. Il committente ha chiesto comunque un massimo di 15 messaggi per
-- persona, per non lasciarla senza freno (nessuna ricarica, non è a
-- pagamento: raggiunto il tetto la chat aiuto si ferma e basta).
--
-- Pattern preso da coupon_redemptions (05/09): tabella accessibile SOLO dal
-- server (service key, RLS accesa senza policy) + funzione RPC atomica per
-- l'incremento, cosi' due richieste della stessa persona arrivate insieme
-- non superano il tetto per una corsa fra lettura e scrittura.
-- =====================================================================

create table if not exists public.app_help_usage (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  messages_used integer     not null default 0,
  updated_at    timestamptz not null default now()
);

comment on table public.app_help_usage is
  'Contatore dei messaggi mandati alla chat gratuita "Aiuto sull''app" (/api/app-help). Tetto fisso applicato dalla RPC increment_app_help_usage, non riscattabile con crediti.';

alter table public.app_help_usage enable row level security;

-- Incremento atomico col tetto incorporato nella query: se messages_used
-- e' gia' >= p_max la riga ON CONFLICT non soddisfa la clausola WHERE, non
-- viene toccata e la funzione ritorna NULL (nessun messaggio consumato).
create or replace function public.increment_app_help_usage(p_user_id uuid, p_max integer default 15)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  nuovo integer;
begin
  insert into public.app_help_usage (user_id, messages_used, updated_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update
    set messages_used = app_help_usage.messages_used + 1,
        updated_at = now()
  where app_help_usage.messages_used < p_max
  returning messages_used into nuovo;
  return nuovo;
end;
$$;

comment on function public.increment_app_help_usage(uuid, integer) is
  'Incrementa il contatore messaggi di "Aiuto sull''app" per l''utente, atomicamente, rispettando il tetto p_max (default 15). Ritorna il nuovo totale, o NULL se il tetto era gia'' raggiunto (nessuna scrittura).';
