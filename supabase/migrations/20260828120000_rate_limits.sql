-- RATE LIMIT PERSISTENTE (audit pre-release SEC-01, 28/08/2026). DA APPLICARE A MANO.
--
-- Il rateLimiter di server.ts è una Map in memoria: su Vercel si azzera a ogni
-- cold start, quindi è un freno di cortesia, non un controllo. Qui vive il
-- contatore vero: una riga per (chiave, minuto), incrementata in modo ATOMICO
-- dalla RPC rate_limit_hit (upsert + incremento in una sola istruzione, niente
-- leggi-poi-scrivi). La chiave la costruisce il server:
--   rl_u_<user_id>_<minuto>   per utenti autenticati (req.userId da requireAuth)
--   rl_ip_<ip>_<minuto>       per il resto
--
-- api_cache NON va bene per questo: non ha scadenza (le righe per-minuto
-- resterebbero per sempre) e saveToCache è un upsert non atomico.
--
-- Il server è FAIL-OPEN: finché questa migration non è applicata, la RPC
-- risponde 404 e le richieste passano (con un warning nei log, una volta per
-- istanza). Applicarla non richiede riavvii.

create table if not exists public.api_rate_limits (
  rl_key     text primary key,
  hits       integer not null default 0,
  expires_at timestamptz not null
);

create index if not exists idx_api_rate_limits_expires
  on public.api_rate_limits (expires_at);

-- Solo il service role (server) tocca questa tabella: RLS attiva, nessuna
-- policy = anon/authenticated non leggono né scrivono.
alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;

-- Incrementa e ritorna il contatore della chiave. Se la riga è scaduta
-- (finestra chiusa) riparte da 1. La pulizia delle righe vecchie è
-- opportunistica (circa 1 chiamata su 200): niente cron da configurare.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer default 120)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    return 0;
  end if;

  insert into public.api_rate_limits (rl_key, hits, expires_at)
  values (p_key, 1, now() + make_interval(secs => greatest(1, coalesce(p_window_seconds, 120))))
  on conflict (rl_key) do update
    set hits = case
                 when public.api_rate_limits.expires_at < now() then 1
                 else public.api_rate_limits.hits + 1
               end,
        expires_at = case
                 when public.api_rate_limits.expires_at < now()
                   then now() + make_interval(secs => greatest(1, coalesce(p_window_seconds, 120)))
                 else public.api_rate_limits.expires_at
               end
  returning hits into v_hits;

  if random() < 0.005 then
    delete from public.api_rate_limits where expires_at < now() - interval '10 minutes';
  end if;

  return v_hits;
end
$$;

revoke all on function public.rate_limit_hit(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer) to service_role;

-- Verifica rapida (da SQL editor, come service role):
--   select public.rate_limit_hit('rl_test_1', 120);  -- 1
--   select public.rate_limit_hit('rl_test_1', 120);  -- 2
--   delete from public.api_rate_limits where rl_key = 'rl_test_1';
