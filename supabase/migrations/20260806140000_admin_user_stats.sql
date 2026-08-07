-- Pannello admin "Utenti": statistiche per utente (Day Pass, audioguide
-- ascoltate). Il pannello legge client-side con anon key + RLS, come tutto il
-- resto dell'admin: servono le clausole admin sulle tabelle per-utente.
--
-- user_passes: la policy esistente è solo "auth.uid() = user_id" — un admin
-- vedrebbe solo i propri pass. user_listening_history non ha DDL nel repo
-- (creata a mano): la policy va aggiunta solo se la tabella esiste.
-- is_admin_user() è la security definer già usata dalle altre policy admin.

create policy "user_passes admin select" on public.user_passes
  for select to authenticated using (public.is_admin_user());

do $$
begin
  if exists (
    select from pg_tables
    where schemaname = 'public' and tablename = 'user_listening_history'
  ) then
    execute 'alter table public.user_listening_history enable row level security';
    if not exists (
      select from pg_policies
      where schemaname = 'public' and tablename = 'user_listening_history'
        and policyname = 'listening_history own'
    ) then
      execute 'create policy "listening_history own" on public.user_listening_history
                 for all to authenticated
                 using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    end if;
    if not exists (
      select from pg_policies
      where schemaname = 'public' and tablename = 'user_listening_history'
        and policyname = 'listening_history admin select'
    ) then
      execute 'create policy "listening_history admin select" on public.user_listening_history
                 for select to authenticated using (public.is_admin_user())';
    end if;
  end if;
end $$;
