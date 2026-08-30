-- ═══════════════════════════════════════════════════════════════════════════
--  INCOLLA TUTTO NEL PANNELLO SUPABASE → SQL EDITOR → RUN
--  (30/08/2026 — la mappa scarica sei colonne, non trentatre)
--
--  PERCHE'. Per disegnare un pin servono: identificativo, nome, coordinate,
--  categoria, foto, se e' una gemma. Sei cose. La funzione che la mappa usa
--  oggi ne restituisce TRENTATRE per ogni POI, fra cui `description_ai` e
--  `description_short` (testi lunghi) e SETTE campi teaser, uno per lingua.
--
--  Moltiplicato per 500 pin a ogni spostamento della mappa, quel peso si paga
--  tre volte: il database lo legge dal disco (e su MICRO, con 1 GB di RAM,
--  nulla sta in cache), la rete lo trasporta, il telefono lo interpreta. E
--  non serve a niente: quei testi si usano quando si APRE la scheda di un
--  POI, uno per volta, non per disegnare i pallini.
--
--  Questa e' una funzione NUOVA e separata. `nearby_pois` resta intatta:
--  continua a servire le app gia' installate, il radar e il geofencing, che
--  i teaser li usano davvero. Nessuna rottura.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.nearby_pois_map(
  p_lat float, p_lon float, radius_m int, limit_num int default 500
)
RETURNS TABLE (
  id text, nome text, lat float, lon float, distanza_m float,
  category text, sub_category text, image_url text, is_gem boolean, status text,
  -- Solo la descrizione BREVE, che la mappa mostra nell'anteprima del pin.
  -- Fuori restano `description_ai` (il testo lungo) e i sette teaser: quelli
  -- si scaricano quando si APRE la scheda, uno per volta, non per 500 pin.
  description_short text
)
LANGUAGE sql STABLE
SET statement_timeout TO '25s'
AS $function$
  WITH
  -- Solo id e distanza: nessuna colonna pesante, e nessun ORDER BY, cosi' la
  -- scansione si ferma appena raccoglie il tetto invece di camminare verso
  -- l'esterno all'infinito quando nel raggio ci sono poche righe.
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
    LIMIT greatest(coalesce(limit_num, 500), 1) * 4
  ),
  scelti AS (
    SELECT id, d FROM candidati ORDER BY d ASC
    LIMIT greatest(coalesce(limit_num, 500), 1) * 2
  )
  SELECT
    sp.id, sp.name as nome, sp.lat, sp.lon, s.d as distanza_m,
    sp.category, sp.poi_type as sub_category,
    coalesce(sp.image_url, sp.photo_url) as image_url,
    coalesce(sp.is_gem, false) as is_gem,
    coalesce(sp.status, 'verified') as status,
    sp.description_short
  FROM scelti s
  JOIN public.shared_pois sp ON sp.id = s.id
  WHERE NOT public.is_generic_poi_name(sp.name)
  ORDER BY s.d ASC
  LIMIT limit_num;
$function$;

GRANT EXECUTE ON FUNCTION public.nearby_pois_map(float, float, int, int) TO anon, authenticated;
