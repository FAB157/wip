-- ═══════════════════════════════════════════════════════════════════════════
-- nearby_pois: AGGIUNGE address, city, region, country. DA APPLICARE A MANO.
--
-- Perché serve. La catena Photon ha finito il 23/08/2026 alle 02:33: ~2,17 M
-- POI toccati, di cui ~1,22 M con la VIA in `shared_pois.address` (più città,
-- regione e paese sugli altri). Ma la RPC `nearby_pois` ha una lista di
-- colonne FISSA e l'indirizzo non c'era: il radar e la mappa ricevono i POI
-- senza indirizzo, e la scheda (PoiDetailSheet.tsx:226-244) è costretta a una
-- SECONDA query su shared_pois per ogni POI aperto. I servizi nativi
-- (Android/iOS), che leggono la stessa RPC, l'indirizzo non lo vedono affatto:
-- e senza indirizzo `puntoArrivo` non può trovare la porta e ricade sul
-- centroide — il difetto per cui il percorso "porta dall'altra parte".
--
-- È lo stesso inciampo dei teaser (20260822100000): colonna scritta sul DB e
-- invisibile all'app finché la funzione SQL non viene riscritta.
--
-- Compatibilità: si AGGIUNGONO colonne in coda al RETURNS TABLE. Le app già
-- installate leggono per nome e ignorano le nuove, quindi non si rompe nulla;
-- le prossime build le trovano senza altri interventi.
--
-- lock_timeout corto: se qualcuno tiene un lock si fallisce subito e si
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
  teaser_text_de text, teaser_text_ru text, teaser_text_zh text,
  address text, city text, region text, country text
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
    sp.address, sp.city, sp.region, sp.country
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
-- VERIFICA POST-APPLICAZIONE (Roma, 1 km):
--   select id, nome, address, city from public.nearby_pois(41.8902, 12.4922, 1000, 5);
--   → almeno una riga con `address` valorizzato.
--
-- QUANTI INDIRIZZI CI SONO DAVVERO (dopo la catena Photon del 23/08):
--   select count(*) filter (where address is not null and address <> '') as con_via,
--          count(*) filter (where city    is not null and city    <> '') as con_citta,
--          count(*) filter (where region  is not null and region  <> '') as con_regione,
--          count(*) as totale
--     from public.shared_pois;
--   (su una tabella da ~2,3 M righe il count esatto è lento: se serve solo
--    l'ordine di grandezza usare `explain` e leggere le righe stimate —
--    incidente del 18/08.)
-- ═══════════════════════════════════════════════════════════════════════════
