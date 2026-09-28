-- FILM, SERIE, GIOCHI, ANIME E MANGA (26/09/2026): tutte le produzioni di moviescenemap (dati Wikidata CC0),
-- anche quelle registrate solo a livello di paese (senza coordinate) e i film senza luoghi. Serve a ricostruire
-- «tutti i luoghi di un film» (itinerario del film) e a non perdere nulla del dataset: sui luoghi restano le
-- opere in works_json, qui c'è l'anagrafica della produzione. Fonte: https://moviescenemap.com/data/productions.csv
create table if not exists public.cinema_produzioni (
  qid text primary key,
  nome text not null,
  tipo text,                 -- film | tv | game | anime | manga
  anno int,
  anni text,
  relazione text,            -- filmed at | set in
  serie text,
  opera_origine text,        -- libro/opera da cui è tratta (source_work)
  descrizione text,          -- riga di Wikidata (inglese)
  wikipedia text,
  wikidata text,
  pagina_msm text,
  luoghi_qid text[] not null default '{}',        -- luoghi dichiarati su Wikidata (P915/P840)
  luoghi_wiki_qid text[] not null default '{}',   -- luoghi citati solo dalla voce Wikipedia (prova più debole)
  paesi_generici text[] not null default '{}',    -- paesi registrati troppo in grande per avere un luogo
  paesi_wikipedia text[] not null default '{}',
  prova_wikipedia_url text,
  sitelinks int,
  aggiornato_il timestamptz not null default now()
);
create index if not exists idx_cinema_produzioni_nome on public.cinema_produzioni (lower(nome));
create index if not exists idx_cinema_produzioni_luoghi on public.cinema_produzioni using gin (luoghi_qid);
alter table public.cinema_produzioni enable row level security;
drop policy if exists cinema_produzioni_lettura on public.cinema_produzioni;
create policy cinema_produzioni_lettura on public.cinema_produzioni for select using (true);
grant select on public.cinema_produzioni to anon, authenticated;
