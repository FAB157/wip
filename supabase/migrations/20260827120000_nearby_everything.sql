-- ═══════════════════════════════════════════════════════════════════════════
-- nearby_everything(lat, lon, raggio_m) — "cosa c'è qui intorno, tutto" (27/08/2026).
--
-- PERCHÉ SERVE. "Trova Vicino" filtra solo i POI già caricati per le chip
-- attive, a 1 km fisso. L'utente ha chiesto una lista raggruppata per
-- categoria/sottocategoria, a raggio variabile (10/15/50 km), che mostri
-- DAVVERO tutto — terme, spiagge, neve, ciclovie, POI dei film ecc. — non
-- solo quello che è già acceso sulla mappa.
--
-- PERCHÉ UNA RPC E NON N CHIAMATE DAL CLIENT. Il conteggio per gruppo (il
-- badge "12" sull'accordion) e il tetto per gruppo (una categoria enorme non
-- deve far sparire le altre) vanno fatti nel database: scaricare tutto e
-- raggruppare in JS a 50 km su enogastronomia/natura significherebbe
-- trasferire migliaia di righe per poi buttarne via la maggior parte.
--
-- QUATTRO FONTI, QUATTRO STRATEGIE DI FILTRO — non tutte hanno un indice
-- spaziale, e usare ST_DWithin dove non c'è vuol dire il seq scan e lo
-- statement timeout già visto su fix_poi_photos.ts (26-27/08/2026):
--   - shared_pois:      KNN (`ORDER BY <-> LIMIT` sull'indice GIST
--                        idx_shared_pois_geog, geography, verificato in
--                        20260813120000), raggio vero applicato DOPO come
--                        filtro. Non WHERE ST_DWithin: a 50km su Firenze
--                        andava in statement timeout (57014, 8,4s) perché
--                        deve materializzare tutte le righe nel cerchio
--                        prima di poterle ordinare — il KNN cammina
--                        dall'indice verso l'esterno e si ferma da solo.
--   - utility_pois:     stesso KNN, indice utility_pois_geog_idx (GIST,
--                        stessa migration).
--   - beni_culturali:   NESSUN indice spaziale (solo idx_beni_culturali_latlon,
--                        un btree su lat,lon) → prefiltro a RIQUADRO su
--                        quell'indice, poi ST_Distance solo sul risultato
--                        già ristretto per ordinare/tagliare per davvero.
--   - route_geometries: NON ha una colonna geometria (la linea è una
--                        polyline testo, vedi 20260821000000): il confronto
--                        è sempre e solo a RIQUADRO (route_geometries_bbox_idx).
--                        È un'approssimazione dichiarata: un percorso il cui
--                        riquadro tocca il cerchio di ricerca compare anche
--                        se il punto più vicino della linea vera è più
--                        lontano del raggio. Il nome/categoria vengono da
--                        shared_pois via poi_id (stesso id, per costruzione).
--
-- group_key: usato per raggruppare in UI (accordion). Per shared_pois e
-- utility_pois è la category; per beni_culturali è fisso; per i percorsi è
-- 'percorsi_<kind>' (cai/osm/gusto/pdipr).
-- ═══════════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';

create or replace function public.nearby_everything(
  p_lat double precision,
  p_lon double precision,
  p_radius_m integer,
  p_per_group_limit integer default 50
)
returns table(
  id text,
  name text,
  lat double precision,
  lon double precision,
  category text,
  sub_category text,
  image_url text,
  distanza_m double precision,
  fonte text,
  group_key text,
  group_count bigint
)
language sql stable
-- Solo per QUESTA funzione: è un'aggregazione pesante (4 fonti unite),
-- chiamata su richiesta esplicita dell'utente (un tap), non nel percorso
-- caldo come nearby_pois — merita più degli 8s di statement_timeout di
-- default visti andare in timeout durante i test (57014).
set statement_timeout = '20000'
as $$
  with punto as (
    select st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography as g
  ),
  -- Riquadro largo p_radius_m in gradi: usato SOLO come prefiltro su indice
  -- btree (beni_culturali, route_geometries), mai come raggio vero — quello
  -- lo fa sempre ST_Distance/ST_DWithin dopo.
  bbox as (
    select
      p_lat - (p_radius_m / 111000.0) as min_lat,
      p_lat + (p_radius_m / 111000.0) as max_lat,
      p_lon - (p_radius_m / 111000.0 / greatest(cos(radians(p_lat)), 0.2)) as min_lon,
      p_lon + (p_radius_m / 111000.0 / greatest(cos(radians(p_lat)), 0.2)) as max_lon
  ),
  -- Stessi filtri di visibilità della nearby_pois canonica
  -- (20260825140000_nearby_pois_attribuzione.sql): is_hidden, status con
  -- coalesce (senza, un status NULL sparirebbe in silenzio — NULL NOT IN
  -- (...) vale NULL, non true) e i nomi placeholder.
  --
  -- ST_DWithin, non KNN (27/08/2026): un primo tentativo con `ORDER BY <->
  -- LIMIT` è stato PEGGIO, non meglio — con i filtri (is_hidden, status,
  -- nomi generici) il planner perde il vantaggio dell'indice e deve
  -- scandagliare molto più lontano per accumulare righe che passano il
  -- filtro: sono andati in timeout anche i 10km che con ST_DWithin
  -- funzionavano in 5,7s. Si resta su ST_DWithin (usa idx_shared_pois_geog
  -- / utility_pois_geog_idx) e si allarga il tempo massimo della funzione
  -- (in fondo al file) per dare respiro ai raggi più larghi.
  da_shared as (
    select
      sp.id, sp.name, sp.lat, sp.lon,
      sp.category, sp.poi_type as sub_category, coalesce(sp.image_url, sp.photo_url) as image_url,
      st_distance(st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography, punto.g) as distanza_m,
      'shared_pois'::text as fonte,
      sp.category as group_key
    from public.shared_pois sp, punto
    where st_dwithin(st_setsrid(st_makepoint(sp.lon, sp.lat), 4326)::geography, punto.g, p_radius_m)
      and sp.is_hidden is not true
      and coalesce(sp.status, 'verified') not in ('draft', 'needs_revision', 'rejected', 'hidden')
      and not public.is_generic_poi_name(sp.name)
  ),
  da_utility as (
    select
      up.id, up.name, up.lat, up.lon,
      up.category, up.sub_category, null::text as image_url,
      st_distance(st_setsrid(st_makepoint(up.lon, up.lat), 4326)::geography, punto.g) as distanza_m,
      'utility_pois'::text as fonte,
      coalesce(up.category, 'utilita') as group_key
    from public.utility_pois up, punto
    where st_dwithin(st_setsrid(st_makepoint(up.lon, up.lat), 4326)::geography, punto.g, p_radius_m)
  ),
  da_beni as (
    select
      -- bc.id è uuid, non text come nelle altre fonti: UNION ALL richiede
      -- lo stesso tipo su tutte le fonti (errore 42804 verificato).
      bc.id::text as id, bc.name, bc.lat, bc.lon,
      'beni_culturali'::text as category, bc.typology as sub_category, bc.image_url,
      st_distance(st_setsrid(st_makepoint(bc.lon, bc.lat), 4326)::geography, punto.g) as distanza_m,
      'beni_culturali'::text as fonte,
      'beni_culturali'::text as group_key
    from public.beni_culturali bc, punto, bbox
    where bc.lat between bbox.min_lat and bbox.max_lat
      and bc.lon between bbox.min_lon and bbox.max_lon
      and st_dwithin(st_setsrid(st_makepoint(bc.lon, bc.lat), 4326)::geography, punto.g, p_radius_m)
  ),
  da_percorsi as (
    select
      rg.poi_id as id,
      coalesce(sp2.name, rg.poi_id) as name,
      (rg.min_lat + rg.max_lat) / 2 as lat,
      (rg.min_lon + rg.max_lon) / 2 as lon,
      coalesce(sp2.category, rg.kind) as category,
      rg.profile as sub_category,
      sp2.image_url,
      -- Distanza dal CENTRO del riquadro del percorso, non dalla linea vera
      -- (non disponibile come geometria, vedi nota in testa): è un ordine
      -- indicativo, non una misura precisa.
      st_distance(
        st_setsrid(st_makepoint((rg.min_lon + rg.max_lon) / 2, (rg.min_lat + rg.max_lat) / 2), 4326)::geography,
        punto.g
      ) as distanza_m,
      'route_geometries'::text as fonte,
      'percorsi_' || rg.kind as group_key
    from public.route_geometries rg
    left join public.shared_pois sp2 on sp2.id = rg.poi_id
    cross join punto, bbox
    where rg.min_lat <= bbox.max_lat and rg.max_lat >= bbox.min_lat
      and rg.min_lon <= bbox.max_lon and rg.max_lon >= bbox.min_lon
  ),
  tutti as (
    select * from da_shared
    union all select * from da_utility
    union all select * from da_beni
    union all select * from da_percorsi
  ),
  numerati as (
    select
      tutti.*,
      row_number() over (partition by group_key order by distanza_m) as rn,
      count(*) over (partition by group_key) as group_count
    from tutti
  )
  select id, name, lat, lon, category, sub_category, image_url, distanza_m, fonte, group_key, group_count
  from numerati
  where rn <= p_per_group_limit
  order by group_key, distanza_m;
$$;

revoke all on function public.nearby_everything(double precision, double precision, integer, integer) from public;
grant execute on function public.nearby_everything(double precision, double precision, integer, integer) to anon, authenticated, service_role;
