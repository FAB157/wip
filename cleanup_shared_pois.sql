-- SQL Script per ripulire shared_pois e tentare di sbloccare il Read-Only
-- Esegui questo script nel SQL Editor di Supabase

-- 1. Eliminiamo i punti importati erroneamente o senza descrizione (spesso rumore OSM)
-- Manteniamo i punti verificati o quelli che hanno già un'audioguida/teaser reale.
DELETE FROM shared_pois
WHERE status = 'auto'
  AND description_ai IS NULL
  AND full_description IS NULL
  AND image_url IS NULL;

-- 2. Opzionale: Eliminiamo punti molto vecchi o non prioritari
-- (Decommenta se necessario scendere ulteriormente di peso)
-- DELETE FROM shared_pois WHERE verified = false AND status != 'verified';

-- 3. Visualizziamo il nuovo conteggio
SELECT count(*) as rimanenti FROM shared_pois;
