-- LA GUIDA MICHELIN DENTRO locali_pois.
-- ============================================================
-- Committente (02/10/2026): «ho una lista di ristoranti della guida michelin,
-- devo inserirli nelle chips… mettile ovviamente nella tabella dei locali…
-- stelle, indirizzo e tutto cio' che e' possibile».
--
-- NIENTE TABELLA A PARTE: il ristorante della Guida e' quasi sempre gia' una
-- riga di Overture (stesso nome, stesso telefono, a pochi metri). Una seconda
-- riga darebbe due pin per lo stesso locale — il difetto corretto il 28/09.
-- Quindi: la riga che c'e' riceve le colonne michelin_*; solo chi non ha
-- riscontro diventa una riga nuova (id 'ov-michelin-<slug>', source
-- 'michelin': il prefisso 'ov-' e' quello con cui server e scheda riconoscono
-- un locale di questa tabella).
--
-- LA DISTINZIONE PUO' ESSERE NULL, ED E' VOLUTO. Nel primo file (02/10/2026)
-- lo scraper non ha letto il badge e ha scritto «Piatto / Segnalato» su tutte
-- le 9.579 righe: non e' un dato, e' un ripiego. `michelin_url` valorizzato =
-- «e' nella Guida» (vero); `michelin_distinzione` null = «livello non noto»
-- (mai un tre stelle mostrato come segnalato). Valori ammessi:
-- 3_stelle | 2_stelle | 1_stella | bib_gourmand | selezionato.
--
-- Applicata a passi da scripts/importa-michelin.mjs (indici CONCURRENTLY: la
-- tabella ha ~10M di righe e non va bloccata in scrittura).
alter table public.locali_pois add column if not exists michelin_url text;
alter table public.locali_pois add column if not exists michelin_distinzione text;
alter table public.locali_pois add column if not exists michelin_stella_verde boolean;
alter table public.locali_pois add column if not exists michelin_prezzo smallint;   -- 1-4, la fascia della Guida
alter table public.locali_pois add column if not exists michelin_cucina text;       -- com'e' scritta nella Guida («Toscana», «Creativa»)
alter table public.locali_pois add column if not exists michelin_anno smallint;      -- anno della distinzione
alter table public.locali_pois add column if not exists michelin_orari text;         -- «Lunedì 12:30-15:00; Martedì chiuso…», com'e' nella Guida
alter table public.locali_pois add column if not exists michelin_servizi text[];     -- «Parcheggio», «Terrazza», «Accesso per disabili»…
alter table public.locali_pois add column if not exists michelin_updated_at timestamptz;

-- Parziali: poche migliaia di righe su 10 milioni. Il GIST serve la chip
-- «Michelin» a qualsiasi zoom, il btree il re-import (ritrova la riga dal link).
create index if not exists idx_locali_pois_michelin_geog on public.locali_pois using gist (geog) where michelin_url is not null;
create index if not exists idx_locali_pois_michelin_url on public.locali_pois (michelin_url) where michelin_url is not null;

-- La RPC della mappa: un parametro in piu' (p_michelin) e cinque colonne in
-- piu' in uscita. I client gia' installati chiamano con i sette parametri di
-- prima: il default li tiene validi, e le colonne in piu' le ignorano. La
-- vecchia firma va TOLTA nella stessa transazione, o la chiamata a sette
-- parametri diventa ambigua.
--
-- I ristoranti della Guida entrano SEMPRE nel riquadro (fino a 150), anche
-- con «Tutti»: senza, a zoom di citta' il taglio per confidence li lasciava
-- fuori a caso. Con p_michelin = true (chip «Stellati») tornano solo quelli
-- con 1, 2 o 3 stelle: non Bib Gourmand, non «selezionati».
--
-- VERSIONE PRUDENTE (02/10/2026): senza un accordo con Michelin l'import
-- scrive solo distinzione, Stella Verde, anno e link. Le colonne
-- michelin_prezzo/_cucina/_orari/_servizi restano vuote finche' l'import non
-- viene lanciato con --completo.
--
-- RIQUADRO DA MONDO. Un riquadro largo quanto il pianeta, letto come
-- geografia, prende il lato corto del globo e tornava 0 righe: solo in quel
-- caso (v_ampio) la Guida si filtra con un confronto su lat/lon.
-- ATTENZIONE, incidente del 02/10/2026: scritto come `lp.lat between …` il
-- pianificatore sceglieva locali_pois_lat_idx (una fascia di latitudine su
-- TUTTO il mondo, decine di migliaia di letture dal disco: una chiamata
-- rimasta appesa 100 s) invece dell'indice parziale. Il `+ 0` rende
-- inutilizzabile quell'indice: resta solo il parziale su michelin_url. A
-- zoom normale si usa st_intersects sul GIST parziale, misurato 45-120 ms.
begin;
drop function if exists public.locali_pois_vicini(float8, float8, float8, float8, text[], integer, text[]);
drop function if exists public.locali_pois_vicini(float8, float8, float8, float8, text[], integer, text[], boolean);
create or replace function public.locali_pois_vicini(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_sub_category text[] default null, p_limit integer default 400,
  p_diete text[] default null, p_michelin boolean default false
)
returns table(id text, name text, lat double precision, lon double precision, sub_category text,
              cucina text, brand text, address text, city text, website text, phone text,
              socials jsonb, operating_status text, confidence double precision, osm_diet jsonb,
              michelin_url text, michelin_distinzione text, michelin_stella_verde boolean,
              michelin_prezzo smallint, michelin_cucina text, michelin_orari text, michelin_servizi text[],
              michelin_anno smallint)
language plpgsql stable
set statement_timeout to '10s'
-- Mai una lettura sequenziale di 10M di righe da questa funzione: la colonna
-- michelin_url e' nuova e senza statistiche il pianificatore la crede piena
-- (riquadro da mondo: 8 s e timeout). Con seqscan spento resta l'indice parziale.
set enable_seqscan to 'off'
as $$
declare
  -- Riquadro «da mondo» (oltre 120° di longitudine o 100° di latitudine).
  v_ampio boolean := (p_east - p_west) > 120 or (p_north - p_south) > 100;
  v_dove_guida text;
begin
  v_dove_guida := case when v_ampio
    then '(lp.lat + 0) between $1 and $3 and (lp.lon + 0) between $2 and $4'
    else 'lp.geog is not null and st_intersects(lp.geog, st_makeenvelope($2,$1,$4,$3,4326)::geography)' end;
  return query execute
    'with guida as (
       select lp.id, lp.name, lp.lat, lp.lon, lp.sub_category, lp.cucina, lp.brand, lp.address,
         lp.city, lp.website, lp.phone, lp.socials, lp.operating_status, lp.confidence, lp.osm_diet,
         lp.michelin_url, lp.michelin_distinzione, lp.michelin_stella_verde, lp.michelin_prezzo, lp.michelin_cucina, lp.michelin_orari, lp.michelin_servizi, lp.michelin_anno
       from public.locali_pois lp
       where lp.michelin_url is not null
         and ' || v_dove_guida || '
         and (not $8 or lp.michelin_distinzione in (''1_stella'',''2_stelle'',''3_stelle''))
         and (lp.operating_status is null or lp.operating_status <> ''closed'')
         and ($8 or $5 is null or lp.sub_category = any($5))
         and ($8 or $7 is null or exists (
               select 1 from unnest($7) d where lp.osm_diet ->> d = ''true''
             ))
       limit case when $8 then greatest($6,1) * 6 else 150 end
     ),
     candidati as (
       select lp.id, lp.name, lp.lat, lp.lon, lp.sub_category, lp.cucina, lp.brand, lp.address,
         lp.city, lp.website, lp.phone, lp.socials, lp.operating_status, lp.confidence, lp.osm_diet,
         lp.michelin_url, lp.michelin_distinzione, lp.michelin_stella_verde, lp.michelin_prezzo, lp.michelin_cucina, lp.michelin_orari, lp.michelin_servizi, lp.michelin_anno
       from public.locali_pois lp
       where not $8
         and lp.michelin_url is null
         and lp.geog is not null
         and st_intersects(lp.geog, st_makeenvelope($2,$1,$4,$3,4326)::geography)
         and (lp.operating_status is null or lp.operating_status <> ''closed'')
         and ($5 is null or lp.sub_category = any($5))
         and ($7 is null or exists (
               select 1 from unnest($7) d where lp.osm_diet ->> d = ''true''
             ))
       limit greatest($6,1) * 6
     ),
     tutti as (select * from guida union all select * from candidati)
     select * from tutti
     order by (michelin_url is not null) desc,
       case michelin_distinzione when ''3_stelle'' then 0 when ''2_stelle'' then 1 when ''1_stella'' then 2 when ''bib_gourmand'' then 3 else 4 end,
       confidence desc nulls last
     limit greatest($6,1)'
  using p_south, p_west, p_north, p_east, p_sub_category, p_limit, p_diete, coalesce(p_michelin, false);
end;
$$;
grant execute on function public.locali_pois_vicini(float8, float8, float8, float8, text[], integer, text[], boolean) to anon, authenticated;
commit;
