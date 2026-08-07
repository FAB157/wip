-- Nome visibile dell'utente su user_profiles: finora il nome viveva solo in
-- localStorage + user_metadata (con un mismatch display_name/full_name che ne
-- impediva la lettura). La colonna serve anche al pannello admin per mostrare
-- gli utenti per nome e non solo per email.
-- Non è una colonna sensibile: il trigger protect_profile_columns continua a
-- proteggere crediti/is_admin, e la RLS resta "solo la propria riga".

alter table public.user_profiles
  add column if not exists display_name text;
