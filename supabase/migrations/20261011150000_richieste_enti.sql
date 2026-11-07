-- RICHIESTE DI ENTI E TERRITORI (11/10/2026, committente: «creiamo una pagina per la registrazione gratis e le
-- corrispondenze, con già i dettagli e se vogliono essere ricontattati — in tutte le lingue»).
--
-- La pagina pubblica è /comuni (public/comuni/index.html); il modulo arriva a POST /api/enti/richiesta, che
-- scrive qui con la service role. Nessuno legge o scrive questa tabella dal client: RLS accesa, nessuna policy.
-- `stato` segue la pratica a mano: nuova → in_lavorazione → fatta | rifiutata. `corrispondenza` è il diario
-- delle risposte (chi, quando, cosa), tenuto da noi.
-- Ritorno indietro: drop table public.richieste_enti; la rotta risponde 503 e la pagina mostra l'errore.

create table if not exists public.richieste_enti (
  id uuid primary key default gen_random_uuid(),
  creata_il timestamptz not null default now(),
  tipo text not null default 'altro',          -- comune | pro_loco | ufficio_turistico | museo | chiesa | parco | associazione | hotel | altro
  camere integer,                              -- solo hotel (pagina /hotel): per dimensionare il coupon di prova
  ente text not null,
  localita text not null,
  paese text,
  sito text,
  referente text,
  ruolo text,
  email text not null,
  telefono text,
  servizi text[] not null default '{}',        -- luoghi | audioguida | guida_museo | coupon_prova (hotel)
  luoghi text,                                 -- i luoghi che chiedono di inserire (testo libero)
  materiale text,                              -- link al materiale da usare come fonte
  note text,
  lingua text not null default 'IT',
  ricontatto text not null default 'email',    -- email | telefono | no
  stato text not null default 'nuova',
  corrispondenza jsonb not null default '[]'::jsonb,
  aggiornata_il timestamptz
);
comment on table public.richieste_enti is
  'Registrazioni gratuite di comuni, pro loco, uffici turistici, musei: luoghi da inserire e audioguide richieste. Scritta solo da /api/enti/richiesta (service role).';

create index if not exists idx_richieste_enti_creata on public.richieste_enti (creata_il desc);
create index if not exists idx_richieste_enti_email on public.richieste_enti (email);

alter table public.richieste_enti enable row level security;
