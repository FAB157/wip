-- clean_cache.sql
-- One-time clean-up script for shared_poi_audio_cache on Supabase

-- 1. Delete POIs with empty or invalid names/categories
DELETE FROM public.shared_poi_audio_cache
WHERE name IS NULL 
   OR TRIM(name) = '' 
   OR category IS NULL 
   OR TRIM(category) = '';

-- 2. Delete POIs with unapproved category names
DELETE FROM public.shared_poi_audio_cache
WHERE LOWER(category) NOT IN ('gemme', 'monumenti', 'chiese', 'musei', 'panorami', 'locali', 'utilita', 'famiglie', 'eventi');

-- 3. Delete mis-categorized commercial and utility POIs under "monumenti"
DELETE FROM public.shared_poi_audio_cache
WHERE LOWER(category) = 'monumenti'
  AND (
     LOWER(name) LIKE '%parking%'
     OR LOWER(name) LIKE '%parcheggio%'
     OR LOWER(name) LIKE '%parcheggi%'
     OR LOWER(name) LIKE '%pizzeria%'
     OR LOWER(name) LIKE '%restaurant%'
     OR LOWER(name) LIKE '%ristorante%'
     OR LOWER(name) LIKE '%trattoria%'
     OR LOWER(name) LIKE '%bar %'
     OR LOWER(name) LIKE '%caffè%'
     OR LOWER(name) LIKE '%caffe%'
  );

-- 4. Delete POIs with classic omonymy hallucinations (e.g. Belfast Titanic, Pistoia PalaCarrara, Colosseo in Carrara/Massa)
DELETE FROM public.shared_poi_audio_cache
WHERE wiki_extract ILIKE '%Belfast%'
   OR wiki_extract ILIKE '%Pistoia%'
   OR wiki_extract ILIKE '%Colosseo%'
   OR generated_text ILIKE '%Belfast%'
   OR generated_text ILIKE '%Pistoia%'
   OR generated_text ILIKE '%Colosseo%';

-- 5. Count final valid cache rows
SELECT COUNT(*), category FROM public.shared_poi_audio_cache GROUP BY category;
