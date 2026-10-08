-- I LOCALI SENZA GLUTINE, CON IL LIVELLO.
-- ============================================================
-- Committente (03/10/2026): file «gluten_free_italia_completo.csv» (8.518
-- locali italiani da Find Me Gluten Free), «pin descrittivo tipo michelin:
-- tipo di locale, spiga a sinistra e 100% a destra».
--
-- UNA TABELLINA A PARTE, NON COLONNE SU locali_pois. Il 02/10 due indici
-- parziali su locali_pois (10M di righe) hanno portato il sito in 503: ogni
-- indice nuovo li' e' una lettura intera della tabella. Qui le righe sono
-- ~5.600: nessun indice oltre la chiave, una lettura completa costa un
-- millisecondo, e la chip regge qualsiasi zoom. `id` = id della riga di
-- locali_pois (il locale che c'era gia', oppure 'ov-gf-<n>' per i nuovi).
--
-- LIVELLO: dedicato (tutto il locale e' senza glutine) | menu (ha un menu
-- senza glutine) | opzioni (segnalato dagli utenti, senza menu dedicato: solo
-- con almeno 3 recensioni e voto >= 4). TIPO: pizzeria | gelateria | forno |
-- ristorante | bar | negozio.
-- Versione prudente, come per la Guida: della fonte restano il livello e il
-- link alla scheda. Niente voti, recensioni o frasi degli utenti.
create table if not exists public.locali_gf (
  id text primary key,
  lat double precision not null,
  lon double precision not null,
  livello text not null check (livello in ('dedicato', 'menu', 'opzioni')),
  tipo text not null default 'ristorante',
  url text,
  updated_at timestamptz not null default now()
);
-- (03/10/2026 sera, committente: «metti tutte le info: telefono, sito ecc e
-- piu' info possibili») I dati della scheda sulla fonte, letti dal fumetto
-- quando si apre (non passano dalla RPC della mappa): telefono, sito,
-- indirizzo, piatti senza glutine, fascia di prezzo, voto e numero di
-- recensioni. Non le frasi degli utenti.
alter table public.locali_gf add column if not exists telefono text;
alter table public.locali_gf add column if not exists sito text;
alter table public.locali_gf add column if not exists indirizzo text;
alter table public.locali_gf add column if not exists piatti text;
alter table public.locali_gf add column if not exists prezzo smallint;
alter table public.locali_gf add column if not exists voto numeric(2,1);
alter table public.locali_gf add column if not exists recensioni integer;
alter table public.locali_gf add column if not exists categoria text;
alter table public.locali_gf enable row level security;
drop policy if exists locali_gf_lettura on public.locali_gf;
create policy locali_gf_lettura on public.locali_gf for select using (true);
comment on table public.locali_gf is
  'Livello «senza glutine» dei locali (dedicato | menu | opzioni) e tipo. id = locali_pois.id. Letta dalla RPC locali_pois_vicini.';

-- LA RPC DELLA MAPPA: due parametri in piu' (p_gf = livelli, p_gf_tipo =
-- tipi) e tre colonne in piu' in uscita. I client gia' in giro chiamano con
-- sette o otto parametri: i default li tengono validi.
-- La funzione si crea col nome passato da scripts/applica-locali-gf.mjs:
-- PRIMA come «locali_pois_vicini_prova», provata col ruolo anon e un tetto di
-- 8 s su tutti i casi (lezione del 02/10: due versioni andate in produzione
-- senza prova hanno scelto piani sbagliati), POI al posto di quella vera.
--
-- - I locali senza glutine del riquadro entrano sempre (fino a 150), come gli
--   stellati; con la chip Gluten-Free (p_diete contiene gluten_free) fino al
--   tetto pieno, insieme a quelli che OpenStreetMap marca senza glutine.
-- - Con p_gf o p_gf_tipo tornano SOLO quelli della tabellina, filtrati.
-- - Riquadro su lat/lon della tabellina: regge anche il mondo intero.
--@FUNZIONE
create or replace function public.__NOME__(
  p_south float8, p_west float8, p_north float8, p_east float8,
  p_sub_category text[] default null, p_limit integer default 400,
  p_diete text[] default null, p_michelin boolean default false,
  p_gf text[] default null, p_gf_tipo text[] default null
)
returns table(id text, name text, lat double precision, lon double precision, sub_category text,
              cucina text, brand text, address text, city text, website text, phone text,
              socials jsonb, operating_status text, confidence double precision, osm_diet jsonb,
              michelin_url text, michelin_distinzione text, michelin_stella_verde boolean,
              michelin_prezzo smallint, michelin_cucina text, michelin_orari text, michelin_servizi text[],
              michelin_anno smallint, gf_livello text, gf_url text, gf_tipo text)
language plpgsql stable
set statement_timeout to '10s'
-- Mai una lettura sequenziale di 10M di righe da questa funzione (02/10/2026).
set enable_seqscan to 'off'
as $$
declare
  -- Riquadro «da mondo» (oltre 120° di longitudine o 100° di latitudine).
  v_ampio boolean := (p_east - p_west) > 120 or (p_north - p_south) > 100;
  v_dove_guida text;
  v_solo_gf boolean := p_gf is not null or p_gf_tipo is not null;
  v_chip_gf boolean := p_gf is not null or p_gf_tipo is not null or 'gluten_free' = any(coalesce(p_diete, '{}'));
  v_colonne text := 'lp.id, lp.name, lp.lat, lp.lon, lp.sub_category, lp.cucina, lp.brand, lp.address,
         lp.city, lp.website, lp.phone, lp.socials, lp.operating_status, lp.confidence, lp.osm_diet,
         lp.michelin_url, lp.michelin_distinzione, lp.michelin_stella_verde, lp.michelin_prezzo, lp.michelin_cucina, lp.michelin_orari, lp.michelin_servizi, lp.michelin_anno';
begin
  -- `(lat + 0)`: senza, il pianificatore sceglieva locali_pois_lat_idx (una
  -- fascia di latitudine su tutto il mondo) invece dell'indice parziale.
  v_dove_guida := case when v_ampio
    then '(lp.lat + 0) between $1 and $3 and (lp.lon + 0) between $2 and $4'
    else 'lp.geog is not null and st_intersects(lp.geog, st_makeenvelope($2,$1,$4,$3,4326)::geography)' end;
  return query execute
    'with guida as (
       select ' || v_colonne || '
       from public.locali_pois lp
       where lp.michelin_url is not null
         and not $11
         and ' || v_dove_guida || '
         and (not $8 or lp.michelin_distinzione in (''1_stella'',''2_stelle'',''3_stelle''))
         and (lp.operating_status is null or lp.operating_status <> ''closed'')
         and ($8 or $5 is null or lp.sub_category = any($5))
         and ($8 or $7 is null or exists (
               select 1 from unnest($7) d where lp.osm_diet ->> d = ''true''
             ))
       limit case when $8 then greatest($6,1) * 6 else 150 end
     ),
     senzaglutine as (
       select ' || v_colonne || '
       -- Prima si sceglie nella tabellina (poche migliaia di righe, dedicati
       -- per primi), POI si va a prendere il locale per chiave: al massimo
       -- p_limit letture su locali_pois, non una per ogni riga del riquadro.
       from (
         select g0.id from public.locali_gf g0
         where not $8
           and g0.lat between $1 and $3 and g0.lon between $2 and $4
           and ($9 is null or g0.livello = any($9))
           and ($10 is null or g0.tipo = any($10))
         order by case g0.livello when ''dedicato'' then 0 when ''menu'' then 1 else 2 end
         limit case when $12 then greatest($6,1) else 150 end
       ) g
       join public.locali_pois lp on lp.id = g.id
       where (lp.operating_status is null or lp.operating_status <> ''closed'')
         and ($12 or $5 is null or lp.sub_category = any($5))
     ),
     candidati as (
       select ' || v_colonne || '
       from public.locali_pois lp
       where not $8
         and not $11
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
     tutti as (select * from guida union all select * from senzaglutine union all select * from candidati),
     unici as (select distinct on (t.id) t.* from tutti t order by t.id)
     select u.*, g.livello, g.url, g.tipo
     from unici u
     left join public.locali_gf g on g.id = u.id
     order by (u.michelin_url is not null) desc,
       case u.michelin_distinzione when ''3_stelle'' then 0 when ''2_stelle'' then 1 when ''1_stella'' then 2 when ''bib_gourmand'' then 3 else 4 end,
       case when $12 then case g.livello when ''dedicato'' then 0 when ''menu'' then 1 when ''opzioni'' then 2 else 3 end else 0 end,
       u.confidence desc nulls last
     limit greatest($6,1)'
  using p_south, p_west, p_north, p_east, p_sub_category, p_limit, p_diete, coalesce(p_michelin, false),
        p_gf, p_gf_tipo, v_solo_gf, v_chip_gf;
end;
$$;
grant execute on function public.__NOME__(float8, float8, float8, float8, text[], integer, text[], boolean, text[], text[]) to anon, authenticated;
