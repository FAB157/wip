-- ═══════════════════════════════════════════════════════════════════════════
-- nearby_pois: AGGIUNGE LE SETTE COLONNE teaser_text_*. DA APPLICARE A MANO.
--
-- PERCHE'. Android (SupabaseClient.kt:406-409) e iOS (WipSupabaseClient.swift:
-- 349-352) leggono `teaser_text_<lingua>` dalla risposta di questa RPC — ma
-- nessuna versione della funzione (dal 20260701 al 20260813) le ha mai
-- restituite. Risultato: il teaser arrivato dal radar e' SEMPRE nullo, e
-- all'arrivo il nativo dice «Apri l'app per scoprire i segreti di questo
-- luogo» a meno che il POI non stia in un pacchetto offline (area_bundle_pois
-- le ha) o venga ripescato per id online. Il 21-22/08/2026 sono stati scritti
-- ~462.000 teaser su shared_pois: con queste colonne le app GIA' INSTALLATE
-- li ricevono, senza build, perche' il parse c'e' gia'.
--
-- COME. Identica alla versione canonica 20260813110000 (FIX 7a) piu' le sette
-- colonne in coda. Il tipo di ritorno cambia, quindi serve DROP + CREATE (un
-- CREATE OR REPLACE con RETURNS diverso fallisce). Tra il DROP e il CREATE
-- c'e' un istante in cui la RPC non esiste: i client riprovano al giro dopo.
-- lock_timeout corto: se qualcuno tiene un lock, si fallisce subito e si
-- riprova, non si blocca la produzione (lezione del 18/08).
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
  teaser_text_de text, teaser_text_ru text, teaser_text_zh text
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
    sp.teaser_text_de, sp.teaser_text_ru, sp.teaser_text_zh
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
-- VERIFICA POST-APPLICAZIONE (Roma, 1 km, 3 righe):
--   select id, nome, left(teaser_text_it, 60) from public.nearby_pois(41.8902, 12.4922, 1000, 3);
--   → tre righe; almeno una con teaser_text_it valorizzato (Colosseo/Fori).
-- ═══════════════════════════════════════════════════════════════════════════
