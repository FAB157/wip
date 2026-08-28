-- Denominazioni d'origine (DOP / IGP / STG e indicazioni geografiche di
-- paesi terzi riconosciute nell'UE), dal registro eAmbrosia della
-- Commissione europea — riuso CC BY 4.0 (decisione 2011/833/UE).
-- Import: scratch/importa-eambrosia.mjs. 27/08/2026.
--
-- NON sono POI: sono prodotti con un'area di produzione definita per elenchi
-- di comuni, senza poligoni. Si agganciano ai POI di Vino e Gusto per nome e
-- per paese (rotta /api/denominazioni). La colonna `fonte` prevede altri
-- registri nazionali (USA TTB, India, Giappone…) per la copertura mondiale.

create table if not exists public.denominazioni (
  id text primary key,                       -- appUniqueId eAmbrosia (EUGI00000021808)
  nome text not null,                        -- protectedName
  nome_norm text not null,                   -- minuscolo senza accenti, per la ricerca
  tipo text not null,                        -- DOP | IGP | STG | IG | altro
  prodotto text not null,                    -- cibo | vino | spiriti | altro
  categoria text,                            -- productCategory (es. "Formaggi")
  paese text,                                -- ISO2 minuscolo (it, fr, ba…)
  paese_nome text,
  terzo_paese boolean not null default false,
  stato text,                                -- Registrato, Pubblicato, Domanda…
  registrato boolean not null default false,
  data_stato date,
  data_registrazione date,
  dossier text,                              -- fileName (PDO-IT-A0994)
  url text,                                  -- scheda pubblica eAmbrosia
  wikidata text,                             -- QID se noto (P9854 = eAmbrosia ID)
  fonte text not null default 'eambrosia',
  raw jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists denominazioni_paese_idx on public.denominazioni (paese);
create index if not exists denominazioni_prodotto_idx on public.denominazioni (prodotto);
create index if not exists denominazioni_nome_norm_idx on public.denominazioni (nome_norm);

alter table public.denominazioni enable row level security;
drop policy if exists "denominazioni lettura pubblica" on public.denominazioni;
create policy "denominazioni lettura pubblica" on public.denominazioni for select using (true);
