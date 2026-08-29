-- I LOCALI: UNA TABELLA LORO, CON TUTTO QUELLO CHE OVERTURE SA.
-- ============================================================
-- Committente (29/08/2026): «importare tutti i locali in tabella locali con
-- tutte le info: indirizzo con civico, sito, telefono e profili social,
-- marchio/catena, stato aperto/chiuso, affidabilita', tipo di cucina e
-- tutte le piu' info possibili».
--
-- PERCHE' UNA TABELLA A PARTE E NON shared_pois. Sono ~6,5 milioni di righe:
-- dentro shared_pois raddoppierebbero la tabella che alimenta radar,
-- pacchetti offline e audioguida, e nel centro di una citta' il tetto dei
-- 1.000 risultati di nearby_pois se lo prenderebbero i bar. Qui la chip
-- «Locali» legge per riquadro e cucina, e il resto dell'app non se ne
-- accorge.
--
-- PERCHE' ADESSO. Foursquare, che serviva i locali dal vivo, ha esaurito il
-- credito gratuito e risponde 429 a ogni chiamata: la chip riceveva niente.
-- E anche quando rispondeva dava nome e categoria e basta.
--
-- COSA C'E' DENTRO. Overture Places (CDLA Permissive 2.0, uso commerciale
-- libero): nome, cucina (206 categorie: sushi, pizza, vegano, senza glutine,
-- halal...), categorie alternative, indirizzo con civico, CAP, citta',
-- regione, paese, sito, telefono, email, social, marchio, stato
-- aperto/chiuso, affidabilita'. COSA NON C'E': orari, prezzi, voti, foto.
-- Orari e diete arrivano da OpenStreetMap (colonne osm_*), voto/prezzo/foto
-- da TripAdvisor quando l'utente apre la scheda (colonne ta_*).
create table if not exists public.locali_pois (
  id text primary key,                       -- 'ov-<uuid Overture>'
  name text not null,
  lat double precision not null,
  lon double precision not null,
  cucina text,                               -- categoria principale Overture (es. sushi_restaurant)
  categorie_alt text[],                      -- categorie alternative Overture
  sub_category text,                         -- la nostra sotto-chip: pizzeria, sushi, gelateria, bar, pub...
  brand text,
  brand_wikidata text,
  address text,                              -- indirizzo con civico, com'e' scritto
  city text,
  postcode text,
  region text,
  country text,                              -- ISO-2
  website text,
  phone text,
  email text,
  socials jsonb,                             -- elenco di URL
  operating_status text,                     -- open | closed | ...
  confidence double precision,               -- 0-1, quante fonti confermano il punto
  -- Da OpenStreetMap, quando c'e' un omonimo entro 100 m:
  osm_id text,
  osm_opening_hours text,
  osm_cuisine text,
  osm_wheelchair text,
  osm_diet jsonb,                            -- {"gluten_free":true,"vegan":true,...}
  -- Da TripAdvisor, riempite alla prima apertura della scheda:
  ta_location_id text,
  ta_rating double precision,
  ta_num_reviews integer,
  ta_price_level text,
  ta_updated_at timestamptz,
  source text not null default 'overture',
  updated_at timestamptz not null default now()
);

-- GLI INDICI, PRIMA DELLE RIGHE: costruirli dopo, su 6,5 milioni e col
-- database sotto carico, e' molto piu' lento. Stretti: la chip filtra per
-- riquadro (lat) e sotto-chip (sub_category); il resto si filtra sul residuo.
create index if not exists locali_pois_lat_idx on public.locali_pois (lat);
create index if not exists locali_pois_sub_lat_idx on public.locali_pois (sub_category, lat);
create index if not exists locali_pois_country_idx on public.locali_pois (country);

-- Lettura pubblica (la mappa la interroga con la chiave pubblica), scrittura
-- solo dal server e dagli script con la chiave di servizio.
alter table public.locali_pois enable row level security;
drop policy if exists locali_pois_lettura on public.locali_pois;
create policy locali_pois_lettura on public.locali_pois
  for select using (true);

comment on table public.locali_pois is
  'Ristoranti, bar, caffe'', pub, gelaterie, panetterie… nel mondo, da Overture Places (CDLA Permissive). Tabella separata da shared_pois: niente radar, niente offline, niente audioguida. Orari/diete da OSM (osm_*), voto/prezzo da TripAdvisor alla prima apertura (ta_*).';
