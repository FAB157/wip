-- I DOPPIONI NASCOSTI DICONO DI CHI SONO IL DOPPIO.
-- ==================================================
-- Committente (30/08/2026, 01:20): «nascondi con is_hidden sapendo che e'
-- doppio». Un POI nascosto perche' duplicato di un altro non deve essere
-- indistinguibile da uno nascosto per altri motivi (spazzatura, richiesta
-- dell'admin): si scrive il motivo e l'id del POI tenuto. Cosi' e'
-- reversibile (UPDATE ... WHERE hidden_reason = 'doppione') e verificabile
-- (JOIN su duplicate_of).
alter table public.shared_pois
  add column if not exists hidden_reason text,
  add column if not exists duplicate_of text;

comment on column public.shared_pois.hidden_reason is
  'Perche'' e'' nascosto: doppione | spazzatura | admin | ... NULL se visibile o nascosto senza motivo registrato.';
comment on column public.shared_pois.duplicate_of is
  'Se hidden_reason = doppione: id del POI tenuto al suo posto (scratch/dedup-vicini.mjs).';

-- Parziale: solo le righe che hanno un doppione, per ritrovare i doppi di un POI.
create index if not exists shared_pois_duplicate_of_idx
  on public.shared_pois (duplicate_of) where duplicate_of is not null;

notify pgrst, 'reload schema';
