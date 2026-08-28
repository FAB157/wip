-- ═══════════════════════════════════════════════════════════════════════════
-- LA MAPPA PORTA ANCHE IL CREDITO DELLA FOTO. DA APPLICARE A MANO.
--
-- PERCHE'. Il popup di un pin mostra `image_url` SUBITO, appena tocchi il
-- segnaposto, usando i dati che la mappa ha gia' in mano. L'attribuzione pero'
-- arriva solo dopo, con la risposta di /api/poi/details: per un paio di
-- secondi la fotografia sta sullo schermo SENZA il nome di chi l'ha scattata.
-- Su CC BY-SA — la licenza della gran parte delle nostre immagini — quel nome
-- e' la condizione che rende lecito mostrarla, e «per un paio di secondi» non
-- e' una scusa che si possa scrivere in una diffida.
--
-- Basta una colonna in coda: le app gia' installate leggono per nome e
-- ignorano cio' che non conoscono, quindi nessuna versione vecchia si rompe.
--
-- ── PERCHE' NON SI TOCCA area_bundle_pois ────────────────────────────────
-- Il pacchetto offline serve a camminare SENZA rete. Le foto sono URL remoti
-- su upload.wikimedia.org: offline non si caricano affatto, quindi non c'e'
-- nessuna immagine da attribuire e la colonna sarebbe peso morto in un
-- pacchetto che pesa gia' ~3,4 KB per POI. Il giorno in cui i pacchetti
-- porteranno anche le immagini in locale, ALLORA la colonna va aggiunta li' —
-- e va aggiunta PRIMA di scaricarle, non dopo.
--
-- Corpo ricopiato IDENTICO da 20260823170000_rpc_address_point.sql
-- (argomenti, colonne, filtri, ordinamento): cambia SOLO la colonna in coda.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.nearby_pois(float, float, int, int);
CREATE FUNCTION public.nearby_pois(
  p_lat float, p_lon float, radius_m int, limit_num int default 60
)
RETURNS TABLE (
  id text, nome text, lat float, lon float, distanza_m float, source text,
  category text, sub_category text, description_short text, description_ai text,
  image_url text, is_gem boolean, status text,
  alert_radius int, geofence_radius int, entrance_lat double precision, entrance_lon double precision,
  teaser_text_it text, teaser_text_en text, teaser_text_fr text, teaser_text_es text,
  teaser_text_de text, teaser_text_ru text, teaser_text_zh text,
  address text, city text, region text, country text,
  address_source text,
  address_point_lat double precision, address_point_lon double precision, address_point_source text,
  image_attribution text
)
LANGUAGE sql STABLE AS $$
  SELECT
    sp.id, sp.name as nome, sp.lat, sp.lon,
    st_distance(
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
    ) as distanza_m,
    coalesce(sp.enrichment_source, 'official') as source,
    sp.category, sp.poi_type as sub_category, sp.description_short, sp.description_ai,
    coalesce(sp.image_url, sp.photo_url) as image_url,
    coalesce(sp.is_gem, false) as is_gem,
    coalesce(sp.status, 'verified') as status,
    sp.alert_radius, sp.geofence_radius, sp.entrance_lat, sp.entrance_lon,
    sp.teaser_text_it, sp.teaser_text_en, sp.teaser_text_fr, sp.teaser_text_es,
    sp.teaser_text_de, sp.teaser_text_ru, sp.teaser_text_zh,
    sp.address, sp.city, sp.region, sp.country,
    sp.address_source,
    sp.address_point_lat, sp.address_point_lon, sp.address_point_source,
    sp.image_attribution
  FROM public.shared_pois sp
  WHERE st_dwithin(
      st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
      st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, radius_m)
    AND sp.is_hidden IS NOT TRUE
    AND coalesce(sp.status, 'verified') NOT IN ('draft','needs_revision','rejected','hidden')
    AND NOT public.is_generic_poi_name(sp.name)
  ORDER BY distanza_m asc
  LIMIT limit_num;
$$;
GRANT EXECUTE ON FUNCTION public.nearby_pois(float, float, int, int) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA (incollare dopo):
--   select id, nome, image_url is not null as ha_foto, image_attribution
--     from nearby_pois(44.08, 10.10, 3000, 20)
--    where image_url is not null;
--   → dove c'e' la foto ci deve essere anche il credito; dove il credito
--     manca, quella foto e' stata scritta PRIMA del 25/08/2026 e va coperta
--     dalla passata sulle ~416.000 immagini storiche (ancora da fare).
-- ═══════════════════════════════════════════════════════════════════════════
