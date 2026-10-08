-- =====================================================================
-- PAGE VIEWS: contatore visite del sito wip.guide (04/09/2026)
-- =====================================================================
-- Richiesta del committente: un pannello admin con le visite al sito e
-- "tutte le informazioni" (pagina, provenienza, dispositivo). Tabella
-- di log append-only, scritta da /api/track/pageview (pubblica, rate
-- limited, mai bloccante) e letta da /api/admin/visits.
--
-- Deliberatamente SOLO per le pagine del sito, non per le view dei POI:
-- con milioni di POI una riga per ogni visualizzazione sfonderebbe le
-- dimensioni della tabella nel giro di pochi giorni (stessa ragione per
-- cui PostHog non è in autocapture, vedi CLAUDE.md). Qui il volume è
-- quello di un sito normale: poche migliaia di righe al mese.
--
-- Nessun dato personale: niente IP salvato, niente cookie, session_id è
-- un id casuale generato lato client e tenuto solo in sessionStorage
-- (si perde chiudendo la scheda) — serve solo a stimare le sessioni
-- uniche in una query, non a identificare la persona.
-- =====================================================================

create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  path text not null,              -- es. "/", "/map", "/plan"
  referrer text,                   -- document.referrer, troncato lato server
  device_type text,                -- 'mobile' | 'tablet' | 'desktop', dedotto da user-agent
  browser text,                    -- 'Chrome' | 'Safari' | 'Firefox' | ... dedotto da user-agent
  country text,                    -- da header geo di Vercel (x-vercel-ip-country), se presente
  session_id text,                 -- id casuale lato client, solo per contare sessioni uniche
  created_at timestamptz not null default now()
);

create index if not exists idx_page_views_created_at on public.page_views (created_at);
create index if not exists idx_page_views_path on public.page_views (path);

alter table public.page_views enable row level security;
-- Nessuna policy: la scrive solo il server (service key) tramite /api/track/pageview,
-- la legge solo l'admin tramite /api/admin/visits.

comment on table public.page_views is 'Log delle visite alle pagine del sito wip.guide (non ai POI), per il pannello admin "Visite". Niente dati personali.';