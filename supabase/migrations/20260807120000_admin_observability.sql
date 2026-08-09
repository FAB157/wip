-- ═══════════════════════════════════════════════════════════════════════
-- Osservabilità admin: colonne mancanti di api_usage_logs, tabella
-- system_errors (mai esistita: la tab "Errori di sistema" era rotta),
-- colonna provider per affiliate_clicks.
-- Verificato sul DB live il 2026-08-07: api_usage_logs ha SOLO
-- (id, api_name, feature_context, created_at, tokens_used) — gli insert
-- estesi del server fallivano in silenzio da mesi (zero telemetria).
-- Il codice ha fallback e funziona anche SENZA questa migrazione, ma
-- applicandola si recuperano costo reale, utente e token in/out per log.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. api_usage_logs: colonne estese usate da server.ts e AdminApiStats
alter table public.api_usage_logs add column if not exists cost_estimation decimal(12,6) default 0;
alter table public.api_usage_logs add column if not exists user_id uuid;
alter table public.api_usage_logs add column if not exists prompt_tokens integer default 0;
alter table public.api_usage_logs add column if not exists completion_tokens integer default 0;
alter table public.api_usage_logs add column if not exists success boolean default true;
create index if not exists idx_api_usage_logs_created_at on public.api_usage_logs (created_at desc);

-- 2. system_errors: logging errori con livello, stack e contesto
create table if not exists public.system_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level text not null default 'error',          -- error | warning | critical
  message text not null,
  stack text,
  context jsonb,                                -- { userId, sessione, url, userAgent, ... }
  source text,                                  -- 'client' | 'server'
  resolved boolean not null default false
);
create index if not exists idx_system_errors_created_at on public.system_errors (created_at desc);

alter table public.system_errors enable row level security;
-- Scrittura aperta agli utenti autenticati (log dal client); lettura solo admin.
drop policy if exists "system errors insert" on public.system_errors;
create policy "system errors insert" on public.system_errors
  for insert to authenticated with check (true);
drop policy if exists "system errors select admin" on public.system_errors;
create policy "system errors select admin" on public.system_errors
  for select to authenticated using (
    exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- 3. affiliate_clicks: colonna provider per distinguere GYG / Viator / Ticketmaster
alter table public.affiliate_clicks add column if not exists provider text default 'gyg';
