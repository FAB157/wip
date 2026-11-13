-- =====================================================================
-- GEOAD LOCAL: SPOT SPONSORIZZATI IPER-LOCALI
-- =====================================================================
-- Richiesta del committente (31/08/2026): un ad-server iper-circoscritto
-- per attività locali (bar, ristoranti, negozi) che pagano per un breve
-- spot audio legato a un raggio geografico. Versione SNELLA, confermata:
-- niente asta, niente self-service per gli inserzionisti — le campagne
-- le crea l'admin dopo un pagamento manuale/fattura, e vengono iniettate
-- nella pipeline audio già esistente (dopo la guida di un POI, mai al
-- posto suo).
--
-- Tabella separata da shared_pois e da locali_pois: qui non c'è un
-- luogo da visitare, c'è una campagna a termine con un raggio, un mp3
-- e un tetto di riproduzioni. Su questa scala (decine/centinaia di
-- campagne attive, non milioni di righe) non serve una RPC PostGIS: il
-- filtro per raggio si fa lato server con haversine su un piccolo
-- risultato già filtrato per status.
--
-- Cosa manca (deliberatamente, in questo giro): fatturazione automatica
-- (price_paid_cents/invoice_ref sono solo annotazione), parità nativa
-- Android/iOS (solo web/PWA foreground).
-- =====================================================================

create table if not exists public.geoad_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  lat double precision not null,
  lon double precision not null,
  radius_m integer not null default 150,   -- raggio di attivazione dello spot
  audio_url text,                          -- mp3 caricato (bucket storage geoad_audio)
  script_text text,                        -- trascrizione, solo riferimento editoriale
  status text not null default 'draft'
    check (status in ('draft','active','paused','ended')),
  starts_at timestamptz,
  ends_at timestamptz,
  max_plays_per_day integer,               -- tetto giornaliero, null = illimitato
  plays_count integer not null default 0,  -- contatore totale, aggiornato da /api/geoads/:id/play
  price_paid_cents integer,                -- annotazione manuale, nessun collegamento a Stripe
  invoice_ref text,                        -- riferimento fattura/pagamento manuale
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Query tipica: campagne 'active' filtrate poi per distanza in JS sul
-- server. L'indice su lat basta a questa scala (stesso schema adottato
-- per locali_pois, dove però serve davvero per i milioni di righe).
create index if not exists idx_geoad_campaigns_status on public.geoad_campaigns (status);
create index if not exists idx_geoad_campaigns_lat on public.geoad_campaigns (lat);

create table if not exists public.geoad_plays (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.geoad_campaigns(id) on delete cascade,
  poi_id text,           -- il POI la cui guida ha preceduto lo spot, se noto
  played_at timestamptz not null default now()
);
create index if not exists idx_geoad_plays_campaign_day on public.geoad_plays (campaign_id, played_at);

alter table public.geoad_campaigns enable row level security;
drop policy if exists geoad_campaigns_lettura_pubblica on public.geoad_campaigns;
create policy geoad_campaigns_lettura_pubblica on public.geoad_campaigns
  for select using (status = 'active');
-- Scrittura solo dal server con la chiave di servizio: nessuna policy insert/update/delete.

alter table public.geoad_plays enable row level security;
-- Nessuna policy: la legge e la scrive solo la chiave di servizio (contatore ad uso admin).

comment on table public.geoad_campaigns is 'GeoAd Local: campagne sponsorizzate iper-locali, create dall''admin, riprodotte dopo la guida di un POI vicino.';
comment on table public.geoad_plays is 'Log delle riproduzioni di uno spot GeoAd Local, per il contatore e per il tetto giornaliero.';

-- Bucket per gli mp3 degli spot, pubblico in lettura come audio_cache
-- (stesso pattern di saveAudioToStorageAndCache in server.ts).
insert into storage.buckets (id, name, public)
values ('geoad_audio', 'geoad_audio', true)
on conflict (id) do nothing;
