-- SQL Migration - "Italia in Tasca" Automation Motor (ORACLE Stage 2)
-- Target Table: public.shared_pois

-- 1. Add flag_review column to shared_pois
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS flag_review BOOLEAN DEFAULT false;

-- 2. Create index on status and flag_review for ultra-fast queue processing
CREATE INDEX IF NOT EXISTS idx_shared_pois_status_review ON public.shared_pois(status, flag_review);
