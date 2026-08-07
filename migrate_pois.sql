-- Migrazione Dati: Sposta categorie non storiche da shared_pois a utility_pois

-- 1. Copia i dati in utility_pois
INSERT INTO public.utility_pois (id, name, lat, lon, category, photo_url, image_url, status, created_at)
SELECT id, name, lat, lon, category, photo_url, image_url, status, created_at
FROM public.shared_pois
WHERE category IN (
  'locali', 'utilita', 'famiglie', 'esperienze_locali', 'eventi',
  'restaurant', 'cafe', 'bar', 'fast_food', 'pub', 'ice_cream', 'pizzeria', 
  'pesce', 'carne', 'vegetariano', 'sushi', 'gelateria', 'ristorante', 'glutenfree',
  'servizi'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Rimuovi i dati spostati da shared_pois
DELETE FROM public.shared_pois
WHERE category IN (
  'locali', 'utilita', 'famiglie', 'esperienze_locali', 'eventi',
  'restaurant', 'cafe', 'bar', 'fast_food', 'pub', 'ice_cream', 'pizzeria', 
  'pesce', 'carne', 'vegetariano', 'sushi', 'gelateria', 'ristorante', 'glutenfree',
  'servizi'
);
