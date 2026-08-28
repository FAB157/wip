-- =====================================================================
-- POSSESSO PERMANENTE DELLE AUDIOGUIDE (29/08/2026). DA APPLICARE A MANO.
--
-- REGOLA DI PRODOTTO (committente): «quando l'utente acquista un'audioguida,
-- non la paga mai piu', e' sua».
--
-- Fino a ieri il diritto al testo integrale durava 24 ORE: la prova era una
-- chiave `audiocharge_<user>_<poi>_<lang>` in `api_cache`, e il giorno dopo
-- lo stesso POI si ripagava. Due difetti in uno:
--   1. la finestra di 24 h contraddiceva la regola;
--   2. `api_cache` e' una CACHE — si puo' svuotare per manutenzione, e con
--      lei sparirebbero gli acquisti. Il possesso e' un dato contabile, non
--      un residuo di calcolo: vuole una tabella sua.
--
-- PERCHE' NON `user_listening_history`: e' scrivibile dal client (policy di
-- INSERT per il proprietario), quindi come prova d'acquisto e' falsificabile
-- — lo dichiara gia' la migration 20260809100000_security_hardening_economy
-- ("Finche' la registrazione dell'ascolto e' scrivibile dal client, resta
-- falsificabile... La chiusura piena richiede di legare l'autorizzazione a un
-- movimento reale"). Qui si chiude: SELECT al proprietario, scrittura SOLO
-- service_role, cioe' solo il server dopo un addebito riuscito.
--
-- COSA COMPRENDE: il POI, in TUTTE le lingue e con tutti i personaggi. La
-- chiave e' (user_id, poi_id), senza lingua: e' lo stesso luogo e lo stesso
-- acquisto percepito, e il costo marginale per noi resta basso perche' i
-- testi generati sono in cache per (poi, lingua, personaggio) e riusati da
-- tutti gli utenti.
-- =====================================================================

set lock_timeout = '5s';

create table if not exists public.user_poi_purchases (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  poi_id      text        not null,
  acquired_at timestamptz not null default now(),
  -- 'crediti' (addebito vero), 'storico'/'audiocharge' (backfill), 'omaggio'.
  source      text        not null default 'crediti',
  cost        integer     not null default 0,
  primary key (user_id, poi_id)
);

create index if not exists idx_user_poi_purchases_user
  on public.user_poi_purchases (user_id);

alter table public.user_poi_purchases enable row level security;

-- Il proprietario LEGGE (il client mostra «gia' tua» senza passare dal
-- server). Nessuna policy di INSERT/UPDATE/DELETE: scrive solo service_role,
-- che le RLS non attraversa. E' la differenza sostanziale con
-- user_listening_history, ed e' il punto di tutta la migration.
drop policy if exists "poi_purchases_select_own" on public.user_poi_purchases;
create policy "poi_purchases_select_own"
  on public.user_poi_purchases for select
  using (auth.uid() = user_id);

revoke insert, update, delete on table public.user_poi_purchases from anon, authenticated;

-- ---------------------------------------------------------------------------
-- BACKFILL GENEROSO. Chi ha gia' ascoltato in passato NON deve ritrovarsi a
-- ripagare per colpa di un nostro cambio di impianto: meglio regalare qualche
-- accesso che far pagare due volte un cliente. Le due fonti storiche valgono
-- come prova d'acquisto solo QUI, una volta sola, in questa migration.
-- ---------------------------------------------------------------------------
insert into public.user_poi_purchases (user_id, poi_id, acquired_at, source, cost)
select h.user_id, h.poi_id::text, min(h.listened_at), 'storico', 0
  from public.user_listening_history h
 where h.user_id is not null and h.poi_id is not null
 group by h.user_id, h.poi_id::text
on conflict (user_id, poi_id) do nothing;

-- Chiavi audiocharge_<user>_<poi>_<lang> gia' in api_cache: l'user_id e' un
-- uuid (36 caratteri con i trattini), il resto fino all'ultimo '_' e' il POI.
insert into public.user_poi_purchases (user_id, poi_id, acquired_at, source, cost)
select distinct on (u.user_id, u.poi_id)
       u.user_id, u.poi_id, u.quando, 'audiocharge', 0
  from (
    select substring(c.cache_key from 13 for 36)::uuid                       as user_id,
           regexp_replace(substring(c.cache_key from 50), '_[^_]*$', '')      as poi_id,
           coalesce(c.created_at, now())                                      as quando
      from public.api_cache c
     where c.cache_key like 'audiocharge\_%'
       and substring(c.cache_key from 13 for 36) ~
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) u
 where u.poi_id <> ''
   and exists (select 1 from auth.users a where a.id = u.user_id)
on conflict (user_id, poi_id) do nothing;

-- Verifica rapida (SQL editor, come service_role):
--   select source, count(*) from public.user_poi_purchases group by source;
--
-- ROLLBACK:
--   drop table if exists public.user_poi_purchases;
