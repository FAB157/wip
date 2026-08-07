-- =====================================================================
-- MIGRAZIONE TOTALE: da `pois` a `shared_pois`
-- Questo script unifica definitivamente il database e fa puntare 
-- la mappa e il GPS (geofencing) a `shared_pois`.
-- Esegui questo script nel SQL Editor di Supabase.
-- =====================================================================

-- 1. Aggiungiamo le colonne spaziali a shared_pois (per supportare il GPS veloce)
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE public.shared_pois 
  ADD COLUMN IF NOT EXISTS location GEOMETRY(Point, 4326),
  ADD COLUMN IF NOT EXISTS alert_radius INT DEFAULT 150,
  ADD COLUMN IF NOT EXISTS geofence_radius INT DEFAULT 80,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Italy',
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'csv';

-- 2. Creiamo il trigger per auto-aggiornare la location da lat/lon su shared_pois
CREATE OR REPLACE FUNCTION public.shared_pois_sync_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lon IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_shared_pois_sync_location ON public.shared_pois;
CREATE TRIGGER trg_shared_pois_sync_location
    BEFORE INSERT OR UPDATE ON public.shared_pois
    FOR EACH ROW EXECUTE FUNCTION public.shared_pois_sync_location();

-- Aggiorniamo le location per i record già esistenti in shared_pois
UPDATE public.shared_pois SET location = ST_SetSRID(ST_MakePoint(lon, lat), 4326) WHERE location IS NULL;

-- Aggiungiamo l'indice spaziale per query veloci
CREATE INDEX IF NOT EXISTS idx_shared_pois_location ON public.shared_pois USING GIST (location);

-- 3. TRAVASO DATI DA `pois` a `shared_pois`
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'pois'
  ) THEN
    INSERT INTO public.shared_pois (
        id, 
        lat, 
        lon, 
        location,
        name, 
        category, 
        description_ai, 
        image_url, 
        is_gem, 
        status, 
        alert_radius, 
        geofence_radius, 
        city, 
        region, 
        country, 
        source
    )
    SELECT 
        COALESCE(
            CASE WHEN osm_id IS NOT NULL AND osm_id != '' THEN 'osm-' || osm_id ELSE NULL END, 
            lat::text || ',' || lon::text
        ) AS new_id,
        lat,
        lon,
        location,
        name,
        COALESCE(category, 'monumenti'),
        description,
        NULL AS image_url, 
        COALESCE(premium, false) AS is_gem,
        COALESCE(status, 'verified'),
        COALESCE(alert_radius, 150),
        COALESCE(geofence_radius, 80),
        city,
        region,
        country,
        source
    FROM public.pois
    ON CONFLICT (lat, lon) DO NOTHING;
    
    RAISE NOTICE 'Travaso dati completato.';
  END IF;
END$$;


-- =====================================================================
-- 4. RISCRITTURA RPC (Mappa e Geofence punteranno SOLO a shared_pois)
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_nearby_pois(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER);

CREATE OR REPLACE FUNCTION public.get_nearby_pois(
    user_lat       DOUBLE PRECISION,
    user_lon       DOUBLE PRECISION,
    radius_meters  INTEGER DEFAULT 500
)
RETURNS TABLE (
    id TEXT, osm_id TEXT, name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    category TEXT, city TEXT, region TEXT, country TEXT, description TEXT,
    alert_radius INT, geofence_radius INT, premium BOOLEAN, source TEXT, status TEXT,
    image_url TEXT, photo_url TEXT,
    distance_meters DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
    SELECT p.id, 
           -- Eestraiamo l'osm_id fittizio per compatibilità col vecchio frontend
           (CASE WHEN p.id LIKE 'osm-%' THEN substring(p.id from 5) ELSE NULL END) AS osm_id, 
           p.name, p.lat, p.lon, p.category, p.city, p.region,
           p.country, p.description_ai AS description, p.alert_radius, p.geofence_radius, p.is_gem AS premium,
           p.source, p.status, p.image_url, p.photo_url,
           ST_Distance(
               p.location::geography,
               ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography
           ) AS distance_meters
    FROM public.shared_pois p
    WHERE p.status IN ('verified','auto', 'approved')
      AND p.location IS NOT NULL
      AND ST_DWithin(
            p.location::geography,
            ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
            radius_meters
          )
    ORDER BY distance_meters ASC;
$$;


DROP FUNCTION IF EXISTS public.get_geofence_pois(DOUBLE PRECISION, DOUBLE PRECISION, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_geofence_pois(
    user_lat       DOUBLE PRECISION,
    user_lon       DOUBLE PRECISION,
    p_user_id      UUID DEFAULT NULL,
    radius_meters  INTEGER DEFAULT 500
)
RETURNS TABLE (
    id TEXT, osm_id TEXT, name TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    category TEXT, city TEXT, premium BOOLEAN, source TEXT, status TEXT,
    eff_alert_radius INT, eff_geofence_radius INT,
    alert_enabled BOOLEAN, audio_enabled BOOLEAN,
    distance_meters DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
    SELECT p.id, 
           (CASE WHEN p.id LIKE 'osm-%' THEN substring(p.id from 5) ELSE NULL END) AS osm_id, 
           p.name, p.lat, p.lon, p.category, p.city, p.is_gem AS premium,
           p.source, p.status,
           -- Essendo le settings legacy basate su un POI_ID numerico (BIGINT), 
           -- qui assumiamo i default dei radius. (Le customizzazioni utente si possono rifattorizzare in futuro)
           p.alert_radius AS eff_alert_radius,
           p.geofence_radius AS eff_geofence_radius,
           true AS alert_enabled,
           true AS audio_enabled,
           ST_Distance(
               p.location::geography,
               ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography
           ) AS distance_meters
    FROM public.shared_pois p
    WHERE p.status IN ('verified','auto', 'approved')
      AND p.location IS NOT NULL
      AND ST_DWithin(
            p.location::geography,
            ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
            radius_meters
          )
    ORDER BY distance_meters ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_nearby_pois(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_geofence_pois(DOUBLE PRECISION, DOUBLE PRECISION, UUID, INTEGER) TO anon, authenticated;

-- NOTA DI SICUREZZA:
-- Non ho aggiunto `DROP TABLE public.pois CASCADE;` perché ci sono foreign keys
-- attive (`poi_details`, `poi_audioguides`, `user_poi_settings`).
-- Per ora `pois` viene solo "svuotata" o "abbandonata", il traffico è re-indirizzato
-- al 100% su `shared_pois`. Se l'app non crasha dopo qualche giorno,
-- potrai droppare le chiavi esterne e cancellarla manualmente dal pannello Supabase.
