-- =====================================================================
-- MIGRAZIONE DATI: da punti_interesse a shared_pois
-- Esegui questo script nel SQL Editor di Supabase.
-- =====================================================================

-- 1. Aggiungo le colonne geografiche e di configurazione mancanti a shared_pois
ALTER TABLE public.shared_pois 
  ADD COLUMN IF NOT EXISTS alert_radius INT DEFAULT 150,
  ADD COLUMN IF NOT EXISTS geofence_radius INT DEFAULT 80,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Italy',
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'csv';

-- 2. Trasferimento dati da punti_interesse a shared_pois
-- Eseguito all'interno di un blocco sicuro per gestire l'assenza della tabella
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'punti_interesse'
  ) THEN
    -- Mappiamo id: se esiste un osm_id usiamo quello (osm-XYZ), altrimenti le coordinate
    INSERT INTO public.shared_pois (
        id, 
        lat, 
        lon, 
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
        -- Costruzione dell'ID (TEXT) compatibile con shared_pois
        COALESCE(
            CASE WHEN osm_id IS NOT NULL AND osm_id != '' THEN 'osm-' || osm_id ELSE NULL END, 
            lat::text || ',' || lon::text
        ) AS new_id,
        lat,
        lon,
        name,
        COALESCE(category, 'monumenti'),
        descrizione_ai, -- In punti_interesse la colonna potrebbe chiamarsi "descrizione" o "descrizione_ai" (mappala di conseguenza)
        -- assumiamo che se hai photo_url o image_url usi quelli. Metto NULL per sicurezza se la colonna non esiste o devi estrarla da JSON
        NULL AS image_url, 
        COALESCE(is_gem, false),
        COALESCE(status, 'verified'),
        COALESCE(alert_radius, 150),
        COALESCE(geofence_radius, 80),
        city,
        region,
        country,
        source
    FROM public.punti_interesse
    ON CONFLICT (lat, lon) DO NOTHING; -- Se un POI con le stesse coordinate esiste già in shared_pois, ignoralo per evitare duplicati
    
    RAISE NOTICE 'Migrazione completata con successo.';
  ELSE
    RAISE NOTICE 'La tabella punti_interesse non esiste. Migrazione ignorata.';
  END IF;
END$$;

-- ATTENZIONE: 
-- In public.punti_interesse, il testo AI potrebbe trovarsi in `description` o in `descrizione_ai`.
-- Ho ipotizzato "descrizione_ai". Se la tua colonna testuale principale si chiama "description", 
-- cambia `descrizione_ai` in `description` all'interno della clausola SELECT.

-- 3. Pulizia Finale: Eliminazione della vecchia tabella
DROP TABLE IF EXISTS public.punti_interesse;

