-- =====================================================================
-- REGISTRO DEGLI EVENTI DEGLI STORE — WIP (2026-09-25)
--
-- Il webhook RevenueCat (acquisti Apple App Store e Google Play) salvava
-- solo l'accredito in credit_transactions: crediti, prodotto, utente. Prezzo,
-- valuta, paese, store, commissione, ambiente (produzione/sandbox), id della
-- transazione e annullamenti andavano persi. Questa tabella tiene OGNI evento
-- ricevuto, anche quelli ignorati (sandbox, tipo non gestito, prodotto non
-- mappato), con il payload intero: è la fonte della scheda admin
-- «Transazioni». Stripe non passa di qui: la scheda lo legge dal vivo.
--
-- Solo il server (service_role) legge e scrive: RLS attiva, nessuna policy.
-- =====================================================================

set lock_timeout = '5s';

create table if not exists public.transazioni_store (
  id bigserial primary key,
  ricevuto_il timestamptz not null default now(),
  fonte text not null default 'revenuecat',
  event_id text not null,
  tipo_evento text,
  store text,
  ambiente text,
  user_id text,
  product_id text,
  transaction_id text,
  original_transaction_id text,
  acquistato_il timestamptz,
  paese text,
  valuta text,
  prezzo_valuta numeric,
  prezzo_usd numeric,
  tasse_pct numeric,
  commissione_pct numeric,
  netto_pct numeric,
  crediti integer,
  esito text,
  motivo_annullo text,
  payload jsonb not null
);

-- Un evento si registra una volta: i ritentativi di RevenueCat aggiornano la riga.
create unique index if not exists uq_transazioni_store_evento
  on public.transazioni_store (fonte, event_id);

create index if not exists ix_transazioni_store_acquistato
  on public.transazioni_store (acquistato_il desc);

create index if not exists ix_transazioni_store_utente
  on public.transazioni_store (user_id);

alter table public.transazioni_store enable row level security;
revoke all on table public.transazioni_store from anon, authenticated;
