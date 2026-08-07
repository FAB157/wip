-- =====================================================================
-- ITAINTA · POI DB-FIRST ARCHITECTURE
-- Tabelle: pois · poi_details · poi_audioguides · indexed_areas · user_poi_settings
-- + funzione get_nearby_pois() + trigger + RLS
-- Eseguire nel SQL Editor di Supabase (progetto qfxxhzkkrkvbuekfknhh).
-- Idempotente: rieseguibile senza errori.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------
-- 1. pois  (database privato dei punti di interesse)
--    geofence_radius = TRIGGER 2 (audioguida)
--    alert_radius    = TRIGGER 1 (avviso di avvicinamento)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pois (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    osm_id          VARCHAR UNIQUE,
    name            VARCHAR NOT NULL,
    lat             DOUBLE PRECISION NOT NULL,
    lon             DOUBLE PRECISION NOT NULL,
    location        GEOMETRY(Point, 4326),
    category        VARCHAR CHECK (category IN
                      ('museum','monument','viewpoint','church','castle',
                       'ruins','archaeological_site','artwork','attraction')),
    city            VARCHAR,
    region          VARCHAR,
    country         VARCHAR DEFAULT 'Italy',
    description     TEXT,
    alert_radius    INT     DEFAULT 150,
    geofence_radius INT     DEFAULT 80,
    premium         BOOLEAN DEFAULT false,
    source          VARCHAR DEFAULT 'csv'      CHECK (source IN ('csv','overpass_auto')),
    status          VARCHAR DEFAULT 'approved' CHECK (status IN ('approved','auto','deleted')),
    deleted_at      TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Auto-popola location da lat/lon e aggiorna updated_at su ogni write
CREATE OR REPLACE FUNCTION public.pois_sync_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.lon IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_MakePoint(NEW.lon, NEW.lat), 4326);
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pois_sync_location ON public.pois;
CREATE TRIGGER trg_pois_sync_location
    BEFORE INSERT OR UPDATE ON public.pois
    FOR EACH ROW EXECUTE FUNCTION public.pois_sync_location();

CREATE INDEX IF NOT EXISTS idx_pois_location ON public.pois USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_pois_status   ON public.pois (status);
-- (l'indice su osm_id e' gia' creato dal vincolo UNIQUE)

-- ---------------------------------------------------------------------
-- 2. poi_details : SCHEDA POI cache-first
--    (Wikipedia / Wikidata / Wikimedia Commons / Foursquare)
--    chiave: poi_id + language -> si genera una volta, poi si riusa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.poi_details (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    poi_id       BIGINT NOT NULL REFERENCES public.pois(id) ON DELETE CASCADE,
    language     VARCHAR NOT NULL DEFAULT 'it',
    summary      TEXT,
    wiki_extract TEXT,
    wikidata     JSONB,
    images       JSONB,
    foursquare   JSONB,
    sources      JSONB,
    enriched     BOOLEAN DEFAULT false,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_poi_details UNIQUE (poi_id, language)
);
CREATE INDEX IF NOT EXISTS idx_poi_details_poi ON public.poi_details (poi_id);

-- ---------------------------------------------------------------------
-- 3. poi_audioguides : testo audioguida cache-first
--    chiave: poi_id + language + guide_character
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.poi_audioguides (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    poi_id          BIGINT NOT NULL REFERENCES public.pois(id) ON DELETE CASCADE,
    language        VARCHAR NOT NULL,
    guide_character VARCHAR NOT NULL CHECK (guide_character IN ('nicky','dante')),
    audio_text      TEXT,
    generated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    play_count      INT DEFAULT 1,
    CONSTRAINT uq_audioguide UNIQUE (poi_id, language, guide_character)
);
CREATE INDEX IF NOT EXISTS idx_audioguides_poi ON public.poi_audioguides (poi_id);

-- Incremento atomico play_count (replay da cache)
CREATE OR REPLACE FUNCTION public.increment_audioguide_play(target_id BIGINT)
RETURNS VOID AS $$
    UPDATE public.poi_audioguides SET play_count = play_count + 1 WHERE id = target_id;
$$ LANGUAGE sql;

-- ---------------------------------------------------------------------
-- 4. indexed_areas : aree gia' interrogate su Overpass
--    (se un'area e' indicizzata e ha pochi POI, e' una scelta: non riproporre)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.indexed_areas (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    center_lat    DOUBLE PRECISION NOT NULL,
    center_lon    DOUBLE PRECISION NOT NULL,
    center        GEOMETRY(Point, 4326),
    radius_meters INT DEFAULT 500,
    indexed_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    poi_count     INT DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.indexed_areas_sync_center()
RETURNS TRIGGER AS $$
BEGIN
    NEW.center := ST_SetSRID(ST_MakePoint(NEW.center_lon, NEW.center_lat), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_indexed_areas_sync_center ON public.indexed_areas;
CREATE TRIGGER trg_indexed_areas_sync_center
    BEFORE INSERT OR UPDATE ON public.indexed_areas
    FOR EACH ROW EXECUTE FUNCTION public.indexed_areas_sync_center();

CREATE INDEX IF NOT EXISTS idx_indexed_areas_center ON public.indexed_areas USING GIST (center);

-- ---------------------------------------------------------------------
-- 5. user_poi_settings : override PER-UTENTE PER-POI dei due trigger
--    (i default stanno su pois.alert_radius / pois.geofence_radius)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_poi_settings (
    user_id        UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    poi_id         BIGINT NOT NULL REFERENCES public.pois(id) ON DELETE CASCADE,
    alert_radius   INT,
    trigger_radius INT,
    alert_enabled  BOOLEAN DEFAULT true,
    audio_enabled  BOOLEAN DEFAULT true,
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, poi_id)
);

-- ---------------------------------------------------------------------
-- 6. get_nearby_pois(user_lat, user_lon, radius_meters)
--    -> status IN ('approved','auto'), ordinati per distanza crescente
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_nearby_pois(
    user_lat       DOUBLE PRECISION,
    user_lon       DOUBLE PRECISION,
    radius_meters  INTEGER DEFAULT 500
)
RETURNS TABLE (
    id BIGINT, osm_id VARCHAR, name VARCHAR, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    category VARCHAR, city VARCHAR, region VARCHAR, country VARCHAR, description TEXT,
    alert_radius INT, geofence_radius INT, premium BOOLEAN, source VARCHAR, status VARCHAR,
    distance_meters DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
    SELECT p.id, p.osm_id, p.name, p.lat, p.lon, p.category, p.city, p.region,
           p.country, p.description, p.alert_radius, p.geofence_radius, p.premium,
           p.source, p.status,
           ST_Distance(
               p.location::geography,
               ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography
           ) AS distance_meters
    FROM public.pois p
    WHERE p.status IN ('approved','auto')
      AND p.location IS NOT NULL
      AND ST_DWithin(
            p.location::geography,
            ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
            radius_meters
          )
    ORDER BY distance_meters ASC;
$$;

-- ---------------------------------------------------------------------
-- 6b. get_geofence_pois(user_lat, user_lon, p_user_id, radius_meters)
--     Geofencing INTEGRATO NEL DB: ritorna i POI vicini con i raggi
--     EFFETTIVI gia' risolti (override utente da user_poi_settings che
--     vince sul default del POI) + flag alert/audio abilitati.
--     p_user_id puo' essere NULL (utente anonimo) -> usa i default del POI.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_geofence_pois(
    user_lat       DOUBLE PRECISION,
    user_lon       DOUBLE PRECISION,
    p_user_id      UUID DEFAULT NULL,
    radius_meters  INTEGER DEFAULT 500
)
RETURNS TABLE (
    id BIGINT, osm_id VARCHAR, name VARCHAR, lat DOUBLE PRECISION, lon DOUBLE PRECISION,
    category VARCHAR, city VARCHAR, premium BOOLEAN, source VARCHAR, status VARCHAR,
    eff_alert_radius INT, eff_geofence_radius INT,
    alert_enabled BOOLEAN, audio_enabled BOOLEAN,
    distance_meters DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
    SELECT p.id, p.osm_id, p.name, p.lat, p.lon, p.category, p.city, p.premium,
           p.source, p.status,
           COALESCE(s.alert_radius,   p.alert_radius)    AS eff_alert_radius,
           COALESCE(s.trigger_radius, p.geofence_radius) AS eff_geofence_radius,
           COALESCE(s.alert_enabled,  true)              AS alert_enabled,
           COALESCE(s.audio_enabled,  true)              AS audio_enabled,
           ST_Distance(
               p.location::geography,
               ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography
           ) AS distance_meters
    FROM public.pois p
    LEFT JOIN public.user_poi_settings s
           ON s.poi_id = p.id AND s.user_id = p_user_id
    WHERE p.status IN ('approved','auto')
      AND p.location IS NOT NULL
      AND ST_DWithin(
            p.location::geography,
            ST_SetSRID(ST_MakePoint(user_lon, user_lat), 4326)::geography,
            radius_meters
          )
    ORDER BY distance_meters ASC;
$$;

-- ---------------------------------------------------------------------
-- 7. RLS
--    Stile coerente col resto del progetto: il client anon legge i POI
--    e scrive solo i POI 'auto' del fallback Overpass; i POI curati (csv)
--    si caricano con la service_role key (bypassa RLS).
-- ---------------------------------------------------------------------
ALTER TABLE public.pois              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poi_details       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poi_audioguides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexed_areas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_poi_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read pois"        ON public.pois;
DROP POLICY IF EXISTS "public insert pois auto" ON public.pois;
DROP POLICY IF EXISTS "public rw poi_details"   ON public.poi_details;
DROP POLICY IF EXISTS "public rw audioguides"   ON public.poi_audioguides;
DROP POLICY IF EXISTS "public rw indexed_areas" ON public.indexed_areas;
DROP POLICY IF EXISTS "user owns poi_settings"  ON public.user_poi_settings;

CREATE POLICY "public read pois"        ON public.pois            FOR SELECT TO public USING (status IN ('approved','auto'));
CREATE POLICY "public insert pois auto" ON public.pois            FOR INSERT TO public WITH CHECK (source = 'overpass_auto' AND status = 'auto');
CREATE POLICY "public rw poi_details"   ON public.poi_details     FOR ALL    TO public USING (true) WITH CHECK (true);
CREATE POLICY "public rw audioguides"   ON public.poi_audioguides FOR ALL    TO public USING (true) WITH CHECK (true);
CREATE POLICY "public rw indexed_areas" ON public.indexed_areas   FOR ALL    TO public USING (true) WITH CHECK (true);
CREATE POLICY "user owns poi_settings"  ON public.user_poi_settings
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT EXECUTE ON FUNCTION public.get_nearby_pois(DOUBLE PRECISION, DOUBLE PRECISION, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_geofence_pois(DOUBLE PRECISION, DOUBLE PRECISION, UUID, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_audioguide_play(BIGINT) TO anon, authenticated;
