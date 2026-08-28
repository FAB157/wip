-- ═══════════════════════════════════════════════════════════════════════════
-- get_geofence_pois: L'INGRESSO E L'INDIRIZZO ARRIVANO AL TRIGGER WEB.
-- DA APPLICARE A MANO (Supabase SQL editor).
--
-- PERCHE'. I candidati del trigger sulla PWA vengono da questa RPC
-- (poiRepository.ts::getGeofencePois → foregroundTriggers.ts). La sua
-- RETURNS TABLE, ferma alla versione canonica del 20260813110000, non ha mai
-- avuto entrance_lat/entrance_lon. Conseguenze misurate il 23/08/2026:
--
--   1) `puntoArrivo(poi)` (foregroundTriggers.ts:303) non trovava mai un
--      ingresso e restituiva SEMPRE il centroide: i 277.363 ingressi promossi
--      il 21/08 non sono mai arrivati al trigger web. Su un edificio grande
--      il cerchio sta al centro del palazzo, non sul portone.
--   2) `hasEntrance` (guideSettings.ts:117) era sempre false → l'intero ramo
--      dei raggi calibrati per-POI era codice morto.
--   3) `address`/`city` mancavano: `puntoArrivoSuStrada` doveva fare una
--      SELECT in piu' su shared_pois per ogni POI, e i nativi non li vedono.
--
-- E' lo stesso inciampo dei teaser (20260822100000) e degli indirizzi su
-- nearby_pois (20260823090000): colonne scritte sul DB e invisibili all'app
-- finche' la funzione SQL non viene riscritta.
--
-- COSA CAMBIA, esattamente:
--   • `city` NON e' piu' `NULL::varchar`: ora e' `sp.city`. La colonna c'era
--     gia' nella firma (mappata a NULL perche' nel 2026-08-13 si credeva che
--     shared_pois non l'avesse) — quindi NON si puo' aggiungere in coda, si
--     riempie. Nessun client si rompe: prima leggeva null, ora legge un valore.
--   • IN CODA, quattro colonne nuove: entrance_lat, entrance_lon, address,
--     address_source. In coda = le app gia' installate leggono per nome,
--     ignorano le nuove e non si accorgono di nulla.
--   • IN CODA, i RAGGI GREZZI: alert_radius e geofence_radius, senza
--     coalesce, quindi NULL quando il POI non e' mai stato calibrato.
--
-- PERCHE' I GREZZI IN CODA E NON AL POSTO DI eff_*.
-- Il mandato era togliere il `coalesce(sp.geofence_radius, 50)` da eff_*, che
-- e' il pavimento per cui il raggio a piedi non scende mai sotto 50 m e lo
-- slider utente (min 15 m) e' inerte verso il basso. Verificati tutti i
-- consumatori (grep get_geofence_pois / eff_geofence_radius su src/, server.ts,
-- android/app/src/, ios/):
--   – src/services/poiRepository.ts — unico chiamante della RPC;
--   – src/types/poi.ts::GeofencePoi dichiara `eff_alert_radius: number` e
--     `eff_geofence_radius: number`, NON nullable: rendere NULL quei campi
--     rompe il contratto di tipo per chiunque li legga oggi;
--   – server.ts:8896 (canarino notturno) legge eff_geofence_radius su POI che
--     gli arrivano nel payload, non dalla RPC: regge il NULL ma non c'entra;
--   – Android e iOS NON usano questa RPC (leggono nearby_pois): nessun impatto.
-- Quindi: eff_* restano com'erano (compatibilita' delle build gia' installate
-- e del tipo), e la VERITA' viaggia nelle due colonne grezze nuove. Il
-- pavimento dei 50 m si toglie lato client, dove va tolto: guideSettings.ts
-- (radiiForTransport) e foregroundTriggers.ts (triggerRadiusFor), che ora
-- distinguono "raggio calibrato dal DB" da "default indistinguibile".
--
-- Tutto il resto — sorgente, filtri (is_hidden, status, is_generic_poi_name),
-- ordinamento per distanza, firma degli argomenti — e' ricopiato IDENTICO da
-- 20260813110000_poi_visibility_offline_canonical.sql:119-164.
--
-- Il tipo di ritorno cambia → serve DROP + CREATE (un CREATE OR REPLACE con
-- RETURNS diverso fallisce). Fra il DROP e il CREATE c'e' un istante in cui la
-- RPC non esiste: il client cade su Dexie e riprova al giro dopo.
-- lock_timeout corto: se qualcuno tiene un lock si fallisce subito e si
-- riprova, non si blocca la produzione (lezione del 18/08).
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.get_geofence_pois(double precision, double precision, uuid, integer);
CREATE FUNCTION public.get_geofence_pois(
    user_lat       DOUBLE PRECISION,
    user_lon       DOUBLE PRECISION,
    p_user_id      UUID DEFAULT NULL,
    radius_meters  INTEGER DEFAULT 500
)
RETURNS TABLE (
    id TEXT, osm_id VARCHAR, name VARCHAR, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    category VARCHAR, city VARCHAR, premium BOOLEAN, source VARCHAR, status VARCHAR,
    eff_alert_radius INT, eff_geofence_radius INT,
    alert_enabled BOOLEAN, audio_enabled BOOLEAN,
    distance_meters DOUBLE PRECISION,
    -- ── NUOVE, IN CODA ──────────────────────────────────────────────────
    entrance_lat DOUBLE PRECISION, entrance_lon DOUBLE PRECISION,
    address TEXT, address_source TEXT,
    alert_radius INT, geofence_radius INT
)
LANGUAGE sql STABLE AS $$
    SELECT
        sp.id,
        NULL::varchar                             AS osm_id,
        sp.name::varchar                          AS name,
        sp.lat, sp.lon,
        sp.category::varchar                      AS category,
        -- Era NULL::varchar: shared_pois la citta' ce l'ha (nearby_pois la
        -- restituisce dal 20260823090000).
        sp.city::varchar                          AS city,
        coalesce(sp.is_gem, false)                AS premium,
        coalesce(sp.enrichment_source, 'official')::varchar AS source,
        coalesce(sp.status, 'verified')::varchar  AS status,
        -- eff_*: INVARIATI, col coalesce. Sono il contratto delle build gia'
        -- installate (GeofencePoi li dichiara non-nullable). Il raggio vero
        -- sta nelle due colonne grezze in fondo.
        coalesce(sp.alert_radius, 150)            AS eff_alert_radius,
        coalesce(sp.geofence_radius, 50)          AS eff_geofence_radius,
        true                                      AS alert_enabled,
        true                                      AS audio_enabled,
        ST_Distance(
            st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
            st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography
        )                                         AS distance_meters,
        -- L'INGRESSO: il punto su cui misurare la distanza e a cui portare la
        -- navigazione. NULL quando il POI non e' stato processato col
        -- footprint: il client (puntoArrivo) ricade sul centroide.
        sp.entrance_lat, sp.entrance_lon,
        -- L'indirizzo, con la sua PROVENIENZA: address_source e' obbligatorio
        -- quanto address, perche' `address_source='strada_vicina'` NON e'
        -- l'indirizzo del luogo ma la strada con nome piu' vicina, e
        -- puntoArrivoSuStrada deve rifiutarsi di geocodificarla. Senza questa
        -- colonna, dare `address` al client sarebbe un peggioramento.
        sp.address, sp.address_source,
        -- I RAGGI GREZZI, senza coalesce: NULL = "mai calibrato", e il client
        -- e' libero di usare la preferenza dell'utente (anche sotto i 50 m).
        sp.alert_radius, sp.geofence_radius
    FROM public.shared_pois sp
    WHERE st_dwithin(
            st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
            st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography,
            radius_meters
          )
      AND sp.is_hidden IS NOT TRUE
      AND coalesce(sp.status, 'verified') NOT IN ('draft','needs_revision','rejected','hidden')
      AND NOT public.is_generic_poi_name(sp.name)
    ORDER BY distance_meters ASC;
$$;
GRANT EXECUTE ON FUNCTION public.get_geofence_pois(double precision, double precision, uuid, integer)
  TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE (eseguire a mano nell'SQL editor).
--
-- 1) Tre righe con INGRESSO e INDIRIZZO valorizzati (Roma, 41.8902/12.4922,
--    1 km). Deve tornare almeno una riga: se torna vuoto, l'ingresso non e'
--    ancora stato promosso in quel raggio, allargare a 3000.
--   select id, name, city, entrance_lat, entrance_lon, address, address_source,
--          geofence_radius, eff_geofence_radius, round(distance_meters) as m
--     from public.get_geofence_pois(41.8902, 12.4922, null, 1000)
--    where entrance_lat is not null and address is not null
--    limit 3;
--
-- 2) Quanti candidati hanno davvero l'ingresso (stessa area). Se
--    `con_ingresso` e' 0 ovunque, il trigger web continuera' a lavorare sul
--    centroide: e' un problema di dati, non della RPC.
--   select count(*)                                          as totale,
--          count(*) filter (where entrance_lat is not null)  as con_ingresso,
--          count(*) filter (where address      is not null)  as con_indirizzo,
--          count(*) filter (where geofence_radius is not null) as con_raggio_calibrato
--     from public.get_geofence_pois(41.8902, 12.4922, null, 1000);
--
-- 3) La firma e' quella attesa (21 colonne di ritorno):
--   select pg_get_function_result(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'get_geofence_pois';
-- ═══════════════════════════════════════════════════════════════════════════
