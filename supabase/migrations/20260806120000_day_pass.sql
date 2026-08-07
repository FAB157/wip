-- WIP DAY PASS — 24 ore hands-free, max 40 audioguide, prezzo in crediti
-- (PRICING_LIST.day_pass). L'acquisto avviene client-side via consume_credits;
-- questa tabella è la fonte di verità per validità e contatore, riconciliato
-- dal client (il contatore offline vive nelle prefs native e viene sincronizzato
-- al ritorno della rete con guides_used = greatest(server, locale)).

create table if not exists public.user_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pass_type text not null default 'day',
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  guides_used int not null default 0,
  guides_cap int not null default 40,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_passes_user_expires
  on public.user_passes (user_id, expires_at desc);

alter table public.user_passes enable row level security;

drop policy if exists "user_passes select own" on public.user_passes;
create policy "user_passes select own" on public.user_passes
  for select using (auth.uid() = user_id);

drop policy if exists "user_passes insert own" on public.user_passes;
create policy "user_passes insert own" on public.user_passes
  for insert with check (auth.uid() = user_id);

-- L'update è limitato al contatore: expires_at/cap non sono modificabili
-- dal client (il WITH CHECK impedisce di riassegnare la riga ad altri;
-- il trigger sotto blocca le manomissioni di scadenza e cap).
drop policy if exists "user_passes update own" on public.user_passes;
create policy "user_passes update own" on public.user_passes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.tg_user_passes_guard()
returns trigger
language plpgsql as $$
begin
  -- Solo guides_used può cambiare, e mai a scendere (anti-rollback)
  new.expires_at := old.expires_at;
  new.activated_at := old.activated_at;
  new.guides_cap := old.guides_cap;
  new.pass_type := old.pass_type;
  new.user_id := old.user_id;
  if new.guides_used < old.guides_used then
    new.guides_used := old.guides_used;
  end if;
  return new;
end $$;

drop trigger if exists trg_user_passes_guard on public.user_passes;
create trigger trg_user_passes_guard
  before update on public.user_passes
  for each row execute function public.tg_user_passes_guard();
