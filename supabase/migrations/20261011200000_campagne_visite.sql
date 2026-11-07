-- MISURA DELLE CAMPAGNE VERSO ENTI E HOTEL (11/10/2026, committente: «abbiamo nell'admin un controllo di quanti
-- vedono, aprono ecc.? — se non c'è creiamolo»).
--
-- Le aperture delle email non si misurano (testo semplice, niente pixel: è anche ciò che le tiene fuori dallo
-- spam). Si misura ciò che conta dopo: chi ARRIVA sulle pagine /comuni, /hotel, /riscatta e da quale campagna
-- (il link nell'email porta ?c=enti-it, ?c=hotel-fr…), e chi poi compila il modulo. Nessun dato personale: una
-- riga per visita con pagina, campagna, lingua e un identificativo casuale di sessione (non l'IP, non un cookie).
-- Scritta solo dal server (POST /api/enti/visita); letta dal pannello (GET /api/admin/enti/statistiche).
-- Ritorno indietro: drop table public.campagne_visite; alter table public.richieste_enti drop column campagna.

create table if not exists public.campagne_visite (
  id bigint generated always as identity primary key,
  creata_il timestamptz not null default now(),
  pagina text not null,            -- comuni | hotel | riscatta
  campagna text,                   -- il valore di ?c= nel link (null = arrivo diretto)
  lingua text,
  sessione text                    -- casuale, generata dalla pagina: serve solo a non contare due volte chi ricarica
);
create index if not exists idx_campagne_visite_creata on public.campagne_visite (creata_il desc);
alter table public.campagne_visite enable row level security;

alter table public.richieste_enti add column if not exists campagna text;

-- Il registro degli INVII: le email partono dal terminale del committente (script scratch/campagna-*-invia.py,
-- via Armada) e lo script ne lascia qui una riga ciascuna (POST /api/campagne/registro, x-script-secret), così il
-- pannello «Campagne» mostra inviate, visite, richieste e coupon nella stessa tabella. Il server NON spedisce.
create table if not exists public.campagne_invii (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  lista text not null,             -- enti | hotel | blog
  campagna text,                   -- lo stesso valore messo in ?c= nel link (es. enti-it)
  email text not null,
  ente text,
  paese text,
  lingua text,
  oggetto text,
  esito text not null default 'ok',
  dettaglio text,
  unique (lista, email)
);
create index if not exists idx_campagne_invii_quando on public.campagne_invii (quando desc);
alter table public.campagne_invii enable row level security;
