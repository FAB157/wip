-- SQL Migration - Architettura "ORACLE" & Protocollo Antigravity
-- Objective: Upgrade shared_pois table with places mapping, short/long storytelling fields, locks, and audio-caching columns.
-- Target Table: public.shared_pois

-- 1. Add ORACLE Architecture fields to shared_pois
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS place_id TEXT DEFAULT NULL;
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS description_short TEXT DEFAULT NULL;
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS description_long TEXT DEFAULT NULL;
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS audio_url_short TEXT DEFAULT NULL;
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS audio_url_long TEXT DEFAULT NULL;
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- 2. Add Unique Constraint on place_id to ensure zero duplicate records
ALTER TABLE public.shared_pois ADD CONSTRAINT unique_place_id UNIQUE (place_id);

-- 3. Create Index on place_id for ultra-fast Read-Through Cache queries
CREATE INDEX IF NOT EXISTS idx_shared_pois_place_id ON public.shared_pois(place_id);
