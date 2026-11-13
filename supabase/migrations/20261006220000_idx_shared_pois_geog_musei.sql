-- MOSTRE / COLLEZIONI PERMANENTI: la vista rispondeva 503 «musei_non_leggibili» a Londra, Parigi,
-- Milano e New York (06/10/2026). EXPLAIN su Londra, 3 km: l'indice geografico generale
-- (idx_shared_pois_geog) restituisce 14.266 righe, il filtro sulla categoria ne tiene 1.019,
-- 11.401 blocchi letti dal disco → 6,4 s, oltre il tetto di 8 s delle rotte.
--
-- Un indice geografico PARZIALE sui soli musei (≈ 1/14 delle righe nelle città dense): la stessa
-- funzione musei_vicini lo usa da sola, perché il suo WHERE contiene esattamente il predicato.
-- CONCURRENTLY: non blocca le scritture; eseguito a mano dal pooler il 06/10/2026 sera.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shared_pois_geog_musei
  ON public.shared_pois
  USING gist (((st_setsrid(st_makepoint(lon, lat), 4326))::geography))
  WHERE category IN ('musei', 'museum', 'gallery', 'art_gallery', 'monumenti')
    AND coalesce(is_hidden, false) = false;
