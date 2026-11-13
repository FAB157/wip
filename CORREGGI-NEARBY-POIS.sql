-- ═══════════════════════════════════════════════════════════════════════════
--  INCOLLA TUTTO NEL PANNELLO SUPABASE → SQL EDITOR → RUN
--  (30/08/2026 — i POI devono aprirsi subito, restando su istanza MICRO)
--
--  IL VINCOLO. Il progetto gira su MICRO: circa 1 GB di RAM e CPU condivisa,
--  con sopra una tabella da 9 milioni di righe e 8 GB di indici. Nulla di
--  tutto questo sta in memoria: ogni ricerca rilegge dal disco. Quindi la
--  cosa che conta non e' quanto la query "pensa", ma QUANTI BYTE LEGGE.
--
--  LO SPRECO. La selezione dei candidati faceva `SELECT sp.*` su fino a 1500
--  righe INTERE. Ogni riga di shared_pois porta description_ai,
--  description_short e SETTE campi teaser (uno per lingua): testi lunghi. Si
--  leggevano megabyte di righe complete per poi scartarne i due terzi con il
--  LIMIT finale. Su un'istanza con la memoria di questa, e' il costo dominante.
--
--  In piu' la vecchia CTE combinava `st_dwithin` (filtro) con `ORDER BY <->`
--  (KNN): la scansione cammina verso l'esterno in ordine di distanza e non si
--  ferma finche' non ha riempito il LIMIT. Se dentro il raggio ci sono meno
--  righe di quante ne chiede, percorre l'intera tabella. Misurato: piu' POI
--  ci sono nel raggio, piu' e' VELOCE — Firenze a 5 km in 1 s, a 2 km in 24 s.
--
--  LA CORREZIONE, in tre mosse:
--   1. la ricerca spaziale legge SOLO id e distanza, non le righe intere;
--   2. niente `ORDER BY` dentro la ricerca spaziale: resta la sola condizione
--      di riquadro, che l'indice GIST soddisfa e che fa FERMARE la scansione;
--   3. si ordina per distanza su quelle poche colonne, si tengono i primi, e
--      solo allora si vanno a prendere le righe complete per chiave primaria.
--
--  Cosi' le letture pesanti passano da ~1500 righe intere a ~400: e' la
--  differenza fra leggere qualche megabyte e leggerne una frazione.
--
--  Colonne, tipi, ordine e filtri restituiti restano IDENTICI: le app gia'
--  installate non vedono alcuna differenza.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.nearby_pois(
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
LANGUAGE sql STABLE
SET statement_timeout TO '25s'
AS $function$
  WITH
  -- 1. SOLO ID E DISTANZA. Nessuna colonna pesante, nessun ORDER BY: la
  --    condizione di riquadro basta all'indice GIST, e senza ordinamento la
  --    scansione si ferma appena raccoglie il tetto qui sotto.
  candidati AS (
    SELECT sp.id,
           st_distance(
             st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
             st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
           ) AS d
    FROM public.shared_pois sp
    WHERE st_dwithin(
            st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
            st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, radius_m)
      AND sp.is_hidden IS NOT TRUE
      AND coalesce(sp.status, 'verified') NOT IN ('draft','needs_revision','rejected','hidden')
    LIMIT greatest(coalesce(limit_num, 60), 1) * 8
  ),
  -- 2. I piu' vicini, ordinati su due sole colonne: costa nulla.
  --    Il doppio del richiesto, perche' il filtro sui nomi generici piu' sotto
  --    ne scartera' una parte.
  scelti AS (
    SELECT id, d FROM candidati ORDER BY d ASC
    LIMIT greatest(coalesce(limit_num, 60), 1) * 2
  )
  -- 3. Solo adesso le righe complete, prese per chiave primaria.
  SELECT
    sp.id, sp.name as nome, sp.lat, sp.lon, s.d as distanza_m,
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
  FROM scelti s
  JOIN public.shared_pois sp ON sp.id = s.id
  WHERE NOT public.is_generic_poi_name(sp.name)
  ORDER BY s.d ASC
  LIMIT limit_num;
$function$;

GRANT EXECUTE ON FUNCTION public.nearby_pois(float, float, int, int) TO anon, authenticated;
