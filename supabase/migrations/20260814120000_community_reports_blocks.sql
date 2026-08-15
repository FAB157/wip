-- ═══════════════════════════════════════════════════════════════════════════
-- UGC WIP Community: segnalazione contenuti + blocco autori — DA APPLICARE A
-- MANO (Supabase SQL editor), come le altre migration del progetto.
--
-- Richiesto da App Store Review Guideline 1.2 (user-generated content):
-- (a) meccanismo di segnalazione dei contenuti offensivi,
-- (b) meccanismo di blocco degli utenti abusivi.
-- Le rotte /api/community/report | /api/community/block |
-- /api/community/blocked-pois (server.ts) scrivono/leggono SOLO con la
-- service key: RLS attiva SENZA policy = nessun accesso client diretto,
-- l'anonimato reciproco (chi segnala/chi è bloccato) resta garantito.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

create table if not exists public.community_content_reports (
  id uuid primary key default gen_random_uuid(),
  poi_id text not null,
  reporter_user_id uuid not null,
  reason text not null check (reason in ('offensive','inappropriate','spam','copyright','other')),
  details text,
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  -- Un utente conta UNA volta per POI (idempotenza della soglia auto-hide).
  unique (poi_id, reporter_user_id)
);

create table if not exists public.community_user_blocks (
  blocker_user_id uuid not null,
  blocked_user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id)
);

-- RLS attiva, NESSUNA policy: accesso esclusivo via service key (server).
alter table public.community_content_reports enable row level security;
alter table public.community_user_blocks enable row level security;

create index if not exists idx_ccr_poi on public.community_content_reports (poi_id);
create index if not exists idx_cub_blocker on public.community_user_blocks (blocker_user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE:
--   select tablename, rowsecurity from pg_tables
--   where tablename in ('community_content_reports','community_user_blocks');
--   → entrambe rowsecurity = true
--   select count(*) from pg_policies
--   where tablename in ('community_content_reports','community_user_blocks');
--   → 0 (nessuna policy: solo service key)
-- ═══════════════════════════════════════════════════════════════════════════
