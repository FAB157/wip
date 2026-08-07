-- Script per correggere le farmacie nel database shared_pois

-- 1. Reimposta la categoria su "utilita" per tutti i POI che sono farmacie
UPDATE shared_pois
SET 
    category = 'utilita',
    sub_category = 'farmacia',
    is_gem = false
WHERE 
    category != 'utilita' AND
    (
        LOWER(name) LIKE '%farmacia%' 
        OR LOWER(tags::text) LIKE '%"amenity":"pharmacy"%'
    );
