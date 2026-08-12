-- ═══════════════════════════════════════════════════════════════════════════
-- NASCONDI I POI VUOTI / CON NOME GENERICO dalla mappa (DA APPLICARE A MANO)
--
-- Problema: sulla mappa (soprattutto categoria "utilità") compaiono POI vuoti —
-- "luogo d'interesse", "Parcheggio", "Punto", "Area sosta"… — auto-scoperti da
-- OSM/Foursquare e mai arricchiti. Il filtro anti-vuoti (isGenericUtilityName)
-- esiste nel client ma NON è applicato dalle RPC che alimentano mappa e nativo.
--
-- Scelta utente: nascondere SOLO i vuoti/senza nome; i servizi con nome reale
-- (Farmacia Rossi, Stazione Centrale) restano.
--
-- Fix: una funzione SQL `is_generic_poi_name` (port di isGenericUtilityName di
-- server.ts) usata sia da `nearby_pois` (shared_pois) sia da `get_utility_pois`
-- (utility_pois). Vale su web E nativo, e riduce il payload.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- Nome POI "vuoto o generico" = va nascosto. Port fedele di isGenericUtilityName
-- (server.ts): null/vuoto, parola generica esatta, o prefisso generico seguito
-- solo da descrittori ("Parcheggio Comunale"). Named POI ("Villa Borghese",
-- "Parco Sempione") NON matchano.
CREATE OR REPLACE FUNCTION public.is_generic_poi_name(n text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT
    n IS NULL
    OR length(trim(n)) < 2
    OR lower(trim(n)) IN (
      'parcheggio','parco','giardino','giardinetti','giardinetto','villa','parking',
      'park','garden','playground','posteggio','sosta','stazionamento',
      'luogo d''interesse','luogo d interesse','area camper','area sosta',
      'area di sosta','sito','punto'
    )
    OR lower(trim(n)) ~* '^(parcheggio|posteggio|parking|park)( (pubblic[oi]|comunal[ei]|gratuit[oi]|privat[oi]|riservat[oi]|clienti|coperto|scoperto|cittadin[oi]|auto|camper|moto|disabili|residenti|gratis|free|public|private|custodito|interrato|multipiano|a|di|per|e|pagamento))+$'
$$;

-- ── nearby_pois (shared_pois): stessa firma a 17 colonne (raggi + entrance),
--    filtro visibilità (is_hidden/status) + esclusione nomi vuoti/generici. ──
DROP FUNCTION IF EXISTS public.nearby_pois(float, float, int, int);
CREATE OR REPLACE FUNCTION public.nearby_pois(
  p_lat float, p_lon float, radius_m int, limit_num int default 60
)
RETURNS TABLE (
  id text, nome text, lat float, lon float, distanza_m float, source text,
  category text, sub_category text, description_short text, description_ai text,
  image_url text, is_gem boolean, status text,
  alert_radius int, geofence_radius int, entrance_lat double precision, entrance_lon double precision
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
    sp.alert_radius, sp.geofence_radius, sp.entrance_lat, sp.entrance_lon
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

-- ── get_utility_pois (utility_pois): aggiunge l'esclusione nomi vuoti/generici. ──
CREATE OR REPLACE FUNCTION public.get_utility_pois(
  user_lat float, user_lon float, radius_meters int, limit_num int default 150
)
RETURNS TABLE (
  id text, name text, lat float, lon float, category text, sub_category text,
  photo_url text, image_url text, distance_meters float
)
LANGUAGE sql STABLE AS $$
  SELECT id, name, lat, lon, category, sub_category, photo_url, image_url,
    st_distance(st_setsrid(st_makepoint(lon, lat), 4326)::geography,
                st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography) as distance_meters
  FROM public.utility_pois
  WHERE st_dwithin(st_setsrid(st_makepoint(lon, lat), 4326)::geography,
                   st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography, radius_meters)
    AND status IN ('verified', 'auto')
    AND name IS NOT NULL
    AND NOT public.is_generic_poi_name(name)
  ORDER BY distance_meters ASC
  LIMIT limit_num;
$$;
GRANT EXECUTE ON FUNCTION public.get_utility_pois(float, float, int, int) TO anon, authenticated;

-- VERIFICA: select count(*) from shared_pois where is_generic_poi_name(name); -- quanti spariscono
