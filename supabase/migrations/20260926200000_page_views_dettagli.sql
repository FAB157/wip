-- =====================================================================
-- VISITE PIÙ DETTAGLIATE (26/09/2026, committente: «statistiche delle visite più dettagliate con città, servizio
-- d'entrata, sito d'entrata (link), servizio d'uscita» → «tutto ciò che non serve autorizzazioni esterne»).
-- Sempre ANONIMO: niente IP, niente id persistente (session_id resta in sessionStorage e muore con la scheda),
-- niente utente. Città/regione dall'header geo di Vercel. Stessa tabella per le pagine (kind='pagina') e per gli
-- eventi dei servizi (kind='evento': pin aperto, audioguida, itinerario generato…), così un solo pannello legge tutto.
-- Da lanciare UNA volta nella console SQL di Supabase. Idempotente.
-- =====================================================================
alter table public.page_views
  add column if not exists kind text not null default 'pagina',   -- 'pagina' | 'evento'
  add column if not exists evento text,                           -- nome dell'evento (lista chiusa lato server)
  add column if not exists dettaglio text,                        -- es. categoria del pin, città dell'itinerario
  add column if not exists city text,                             -- da x-vercel-ip-city
  add column if not exists region text,                           -- da x-vercel-ip-country-region
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists landing_url text,                      -- prima pagina della sessione, link completo
  add column if not exists platform text,                         -- 'web' | 'android' | 'ios'
  add column if not exists app_version text,
  add column if not exists lang text,                             -- lingua dell'app
  add column if not exists logged boolean,                        -- registrato sì/no (mai chi)
  add column if not exists load_ms integer;                       -- tempo di caricamento della pagina

create index if not exists idx_page_views_kind_created on public.page_views (kind, created_at);
create index if not exists idx_page_views_session on public.page_views (session_id, created_at);

comment on table public.page_views is 'Visite (kind=pagina) ed eventi dei servizi (kind=evento) di wip.guide e delle app, anonimi: niente IP, niente id persistente, niente utente.';
