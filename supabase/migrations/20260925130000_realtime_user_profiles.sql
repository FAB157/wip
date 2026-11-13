-- SALDO IN DIRETTA (25/09/2026): user_profiles entra nella pubblicazione realtime.
-- Prima c'era solo `itineraries`: i canali `postgres_changes` su user_profiles
-- (WalletWidget da sempre, UserProfileSummary da oggi) non ricevevano nulla e,
-- dopo il primo acquisto reale su iOS, la home mostrava il saldo vecchio fino al
-- riavvio dell'app. La RLS resta quella («read own profile»): ogni utente
-- riceve solo gli aggiornamenti della propria riga.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_profiles') then
    alter publication supabase_realtime add table public.user_profiles;
  end if;
end $$;
