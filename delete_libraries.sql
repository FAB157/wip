-- SQL Script per rimuovere tutte le biblioteche dal database
-- Esegui questo script nel SQL Editor di Supabase

-- 1. Eliminiamo i punti che hanno 'library' o 'biblioteca' come categoria o tipo
DELETE FROM shared_pois
WHERE category = 'library'
   OR poi_type = 'library'
   OR category = 'biblioteca'
   OR sub_category = 'Biblioteca'
   OR name ILIKE '%biblioteca%'
   OR name ILIKE '%library%';

-- 2. Visualizziamo il nuovo conteggio per conferma
SELECT count(*) as rimanenti FROM shared_pois;
