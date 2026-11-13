-- 29/10/2026 — get_geofence_pois non restituisce più città, entità amministrative e metropolitane.
-- Stessa regola di `rigaNonParla` (src/lib/geofencing/nomiAnnunciabili.ts), `eEntitaAmministrativa` (server.ts),
-- NomiAnnunciabili.kt e PoiModels.swift (collaudo 7 città, 23/10/2026: a Bruxelles parlava wd-Q239 «Bruxelles»).
-- Le app le scartavano già una per una; toglierle qui accorcia la risposta (303.292 stazioni «metropolitana» visibili,
-- che nelle città grandi riempivano il tetto di 1.000 righe) e copre le build installate prima della regola.
-- Misurato il 29/10 sulle righe visibili: categoria amministrativa/metro 303.292 (tutte «metropolitana», 1 gemma),
-- nome amministrativo («comune di…», «metropolitana di…») 2.527, nome = città (non gemme) 16.529.
-- Funzione SQL, firma e colonne identiche: si applica con CREATE OR REPLACE, nessuna riga del database cambia.
-- Tornare indietro: rilanciare la definizione di 20260905130000_poi_arrival_point.sql (stessa firma).
CREATE OR REPLACE FUNCTION public.get_geofence_pois(user_lat double precision, user_lon double precision, p_user_id uuid DEFAULT NULL::uuid, radius_meters integer DEFAULT 500)
 RETURNS TABLE(id text, osm_id character varying, name character varying, lat double precision, lon double precision, category character varying, city character varying, premium boolean, source character varying, status character varying, eff_alert_radius integer, eff_geofence_radius integer, alert_enabled boolean, audio_enabled boolean, distance_meters double precision, entrance_lat double precision, entrance_lon double precision, address text, address_source text, alert_radius integer, geofence_radius integer, address_point_lat double precision, address_point_lon double precision, address_point_source text, arrival_lat double precision, arrival_lon double precision, arrival_method text)
 LANGUAGE sql
 STABLE
AS $function$
    SELECT
        sp.id,
        NULL::varchar                             AS osm_id,
        sp.name::varchar                          AS name,
        sp.lat, sp.lon,
        sp.category::varchar                      AS category,
        sp.city::varchar                          AS city,
        coalesce(sp.is_gem, false)                AS premium,
        coalesce(sp.enrichment_source, 'official')::varchar AS source,
        coalesce(sp.status, 'verified')::varchar  AS status,
        coalesce(sp.alert_radius, 150)            AS eff_alert_radius,
        coalesce(sp.geofence_radius, 50)          AS eff_geofence_radius,
        true                                      AS alert_enabled,
        true                                      AS audio_enabled,
        ST_Distance(
            st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
            st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography
        )                                         AS distance_meters,
        sp.entrance_lat, sp.entrance_lon,
        sp.address, sp.address_source,
        sp.alert_radius, sp.geofence_radius,
        sp.address_point_lat, sp.address_point_lon, sp.address_point_source,
        sp.arrival_lat, sp.arrival_lon, sp.arrival_method
    FROM public.shared_pois sp
    WHERE st_dwithin(
            st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography,
            st_setsrid(st_makepoint(user_lon, user_lat), 4326)::geography,
            radius_meters
          )
      AND sp.is_hidden IS NOT TRUE
      AND coalesce(sp.status, 'verified') NOT IN ('draft','needs_revision','rejected','hidden')
      AND NOT public.is_generic_poi_name(sp.name)
      -- città, entità amministrative, metropolitane: mai un luogo da raccontare
      AND lower(coalesce(sp.category, '')) !~ '^(city|town|village|hamlet|municipality|comune|citta|città|administrative|admin|region|regione|province|provincia|state|country|county|district|borough|suburb|quarter|neighbourhood|neighborhood|locality|metropolitan_area|subway|subway_station|metro|metro_station|metropolitana)$'
      AND lower(coalesce(sp.poi_type, '')) !~ '^(city|town|village|hamlet|municipality|comune|citta|città|administrative|admin|region|regione|province|provincia|state|country|county|district|borough|suburb|quarter|neighbourhood|neighborhood|locality|metropolitan_area|subway|subway_station|metro|metro_station|metropolitana)$'
      -- solo all'INIZIO del nome: «Biblioteca … del Comune di Roma» e «Museo civico del Comune di …» restano
      AND coalesce(sp.name, '') !~* '^\s*(area metropolitana|citt[aà] metropolitana|metropolitan (area|city|borough|county)|metropolitana di|provincia di|province of|comune di|municipality of|municipio de|arrondissement|bezirk|landkreis|okrug|oblast|county of)\M'
      -- una riga che si chiama come la sua città È la città (wd-Q239 «Bruxelles»), salvo gemme ed edifici/piazze omonimi
      AND NOT (
            coalesce(sp.is_gem, false) = false
        AND length(trim(coalesce(sp.name, ''))) >= 3
        AND lower(trim(sp.name)) = lower(trim(split_part(coalesce(sp.city, ''), ',', 1)))
        AND (coalesce(sp.category, '') || ' ' || coalesce(sp.poi_type, '')) !~* 'museo|museum|chiesa|church|piazza|square|castell|castle|palazz|palace'
      )
    ORDER BY distance_meters ASC;
$function$;
