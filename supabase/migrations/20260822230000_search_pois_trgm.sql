-- =====================================================================
-- RICERCA PER NOME SUI POI (22/08/2026)
-- =====================================================================
-- La barra di ricerca della mappa passa solo da Mapbox: "Duomo di Carrara"
-- torna Via Carrara a Sarno, "Cala Goloritzè" una via di Budoni. I 2,3 M POI
-- non si trovano per nome perche' `shared_pois.name` non ha un indice:
-- `name ILIKE '%…%'` va in timeout (500 in 3-4 s, misurato).
--
-- Qui: pg_trgm + indice GIN trigram sul nome, e una RPC che ordina per
-- somiglianza, gemma/fascia e vicinanza al centro della mappa, con un
-- statement_timeout proprio di 800 ms: se il DB e' lento la ricerca torna
-- vuota e Mapbox resta immediato — la regola e' «la ricerca non deve
-- rallentare».
--
-- APPLICARE A MANO (SQL editor). CREATE INDEX CONCURRENTLY non puo' stare
-- in una transazione: lanciare la riga dell'indice DA SOLA. Sull'indice:
-- ~2,3 M righe, qualche minuto, senza bloccare scritture. Vedi la memoria
-- «incidente DB: scansioni sull'atlante» — lock_timeout corto sempre.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. L'indice (DA SOLO, fuori transazione) ─────────────────────────
-- SET lock_timeout = '5s';
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS shared_pois_name_trgm_idx
--   ON public.shared_pois USING gin (name gin_trgm_ops);

-- ── 2. La RPC ────────────────────────────────────────────────────────
-- q: testo (>= 3 caratteri); p_lat/p_lon: centro mappa (o NULL);
-- n: quanti (tetto 20). Torna solo POI visibili (stesse regole del client:
-- niente draft/needs_revision/rejected/hidden, niente is_hidden).
CREATE OR REPLACE FUNCTION public.search_pois(
  q text,
  p_lat double precision DEFAULT NULL,
  p_lon double precision DEFAULT NULL,
  n integer DEFAULT 8
)
RETURNS TABLE (
  id text,
  name text,
  lat double precision,
  lon double precision,
  category text,
  poi_type text,
  city text,
  country text,
  is_gem boolean,
  image_url text,
  somiglianza real,
  distanza_km double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '800ms'
AS $$
DECLARE
  qq text := trim(q);
BEGIN
  IF qq IS NULL OR length(qq) < 3 THEN RETURN; END IF;
  RETURN QUERY
  WITH cand AS (
    SELECT
      p.id::text AS id,
      p.name::text AS name,
      p.lat::double precision AS lat,
      p.lon::double precision AS lon,
      p.category::text AS category,
      p.poi_type::text AS poi_type,
      p.city::text AS city,
      p.country::text AS country,
      COALESCE(p.is_gem, false) AS is_gem,
      p.image_url::text AS image_url,
      similarity(p.name, qq) AS somiglianza,
      CASE WHEN p_lat IS NULL OR p_lon IS NULL THEN NULL
           ELSE 111.32 * sqrt(power(p.lat - p_lat, 2) + power((p.lon - p_lon) * cos(radians(p_lat)), 2))
      END AS distanza_km,
      -- PESO DELLA CATEGORIA (23/08/2026). Per "milano" vincevano le stazioni
      -- ("Milano Dateo", "Milano Romolo": category attraction, poi_type
      -- isolated, con foto) e il Duomo di Milano — che gemma non e' — stava
      -- fuori dai primi cinque. Un nome che contiene una citta' e' quasi
      -- sempre una stazione o un ufficio: i luoghi da visitare vanno prima.
      CASE
        WHEN COALESCE(p.is_gem, false) OR p.category IN ('gemme') THEN 0
        WHEN p.category IN ('cathedral','basilica','church','chapel','monastery','abbey','sanctuary','mosque','synagogue','temple',
                            'castle','fort','fortress','palace','villa','tower','monument','memorial','archaeological_site','ruins',
                            'museum','gallery','theatre','opera','amphitheatre','bridge','aqueduct','lighthouse','square','fountain',
                            'beach','island','peak','volcano','glacier','waterfall','lake','spring','hot_spring','cave','gorge',
                            'national_park','nature_reserve','park','garden','botanical_garden','viewpoint',
                            'terme','cinema','cieli','street_art','mercati','fioriture','memoria','lento') THEN 1
        WHEN p.category = 'attraction' AND COALESCE(p.poi_type, '') IN ('isolated', 'station', 'railway_station', 'halt', 'bus_station') THEN 3
        ELSE 2
      END AS peso_cat
    FROM public.shared_pois p
    WHERE p.name ILIKE '%' || qq || '%'
      AND p.lat IS NOT NULL AND p.lon IS NOT NULL
      AND COALESCE(p.is_hidden, false) = false
      AND COALESCE(p.status, 'verified') NOT IN ('draft', 'needs_revision', 'rejected', 'hidden')
    ORDER BY
      (p.name ILIKE '%' || qq || '%') DESC,
      COALESCE(p.is_gem, false) DESC,
      similarity(p.name, qq) DESC
    LIMIT 200
  ), dedup AS (
    -- Lo stesso nome importato tre volte (Duomo di Milano: church, cathedral,
    -- gemme) e' UNA voce: resta la migliore per peso, poi quella con la foto.
    SELECT c.*, row_number() OVER (PARTITION BY lower(c.name) ORDER BY c.peso_cat, (c.image_url IS NOT NULL) DESC) AS rn
    FROM cand c
  )
  SELECT d.id, d.name, d.lat, d.lon, d.category, d.poi_type, d.city, d.country, d.is_gem, d.image_url, d.somiglianza, d.distanza_km
  FROM dedup d
  WHERE d.rn = 1
  ORDER BY
    -- 1. categoria da visitare prima, stazioni e uffici in fondo
    d.peso_cat ASC,
    -- 2. il nome che COMINCIA con la query ("Duomo di Milano" per "duomo")
    (d.name ILIKE qq || '%') DESC,
    -- 3. VICINO al centro della mappa: per "milano" guardando Milano il Duomo
    --    (0,4 km) deve battere Porta Milano (29 km) anche se quella e' marcata
    --    gemma — il flag is_gem e' rumoroso, la distanza no (23/08/2026).
    COALESCE(d.distanza_km, 99999) ASC,
    -- 4. gemme e luoghi con foto (curati)
    d.is_gem DESC,
    (d.image_url IS NOT NULL) DESC,
    -- 5. somiglianza del nome
    d.somiglianza DESC
  LIMIT LEAST(GREATEST(COALESCE(n, 8), 1), 20);
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_pois(text, double precision, double precision, integer) TO anon, authenticated, service_role;

-- Prova (dopo l'indice):
--   SELECT name, city, somiglianza, distanza_km FROM search_pois('duomo di carrara', 44.08, 10.1, 5);
--   SELECT name, city FROM search_pois('goloritz', NULL, NULL, 5);
--   EXPLAIN ANALYZE SELECT * FROM search_pois('cammino di santiago', 44, 10, 8);  -- deve usare shared_pois_name_trgm_idx
