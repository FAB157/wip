-- ═══════════════════════════════════════════════════════════════════════════
-- INDICI SPAZIALI: correzione + deduplicazione — WIP (2026-08-13)
-- DA APPLICARE A MANO (Supabase SQL editor). Idempotente: rieseguibile.
--
--   [MEDIO] utility_pois: l'unico indice GIST (utility_pois_geo_idx,
--     20260803000000_utility_pois.sql:21-22) è sull'espressione GEOMETRY
--     st_setsrid(st_makepoint(lon,lat),4326), ma get_utility_pois filtra in
--     ::geography (riga 53). L'indice non è quindi usabile → seq scan su
--     utility_pois a ogni query "utilità". Si crea l'indice GEOGRAPHY che
--     combacia con il WHERE, come fatto per shared_pois in
--     20260804190000_nearby_pois_fast.sql:19-21.
--
--   [MINORE] shared_pois: due indici GIST IDENTICI sulla stessa espressione
--     ::geography — idx_shared_pois_geom (20260716000001:2-4) e
--     idx_shared_pois_geog (20260804190000:19-21). (NB: nonostante il nome
--     "geom", il primo è già ::geography: sono duplicati veri, non geom-vs-geog.)
--     Tutte le RPC (nearby_pois, area_bundle_pois, area_bundle_removed,
--     get_pois_within_radius, get_geofence_pois) filtrano in ::geography → un
--     solo indice basta. Si tiene idx_shared_pois_geog (creato dalla migration
--     "fast" canonica) e si elimina il gemello idx_shared_pois_geom: meno
--     manutenzione su INSERT/UPDATE, stesso piano di query.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 6 — utility_pois: indice GIST GEOGRAPHY che combacia col WHERE della RPC.
--   Espressione identica a get_utility_pois: (st_makepoint(lon,lat)::geography).
--   NB: su tabelle grandi la creazione può richiedere qualche minuto e blocca
--   le SCRITTURE su utility_pois (le letture proseguono).
-- ───────────────────────────────────────────────────────────────────────────
create index if not exists utility_pois_geog_idx
  on public.utility_pois
  using gist ((st_setsrid(st_makepoint(lon, lat), 4326)::geography));

-- Il vecchio indice GEOMETRY (utility_pois_geo_idx) è inutile per le query
-- ::geography. Lasciato in piedi per prudenza: si può eliminare a mano una
-- volta confermato che nessun'altra query lo usa (EXPLAIN su get_utility_pois).
--   drop index if exists public.utility_pois_geo_idx;

-- ───────────────────────────────────────────────────────────────────────────
-- FIX 8 — shared_pois: elimina il GIST duplicato. idx_shared_pois_geom e
--   idx_shared_pois_geog hanno la STESSA espressione ::geography (verificato).
--   Si tiene idx_shared_pois_geog; si droppa idx_shared_pois_geom.
--   Reversibile: la CREATE è in fondo, commentata.
-- ───────────────────────────────────────────────────────────────────────────
drop index if exists public.idx_shared_pois_geom;

-- ROLLBACK (ricreare il gemello, se mai servisse):
--   create index if not exists idx_shared_pois_geom
--     on public.shared_pois
--     using gist ((st_setsrid(st_makepoint(lon, lat), 4326)::geography));

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE (eseguire a mano nell'SQL editor)
--
-- 1) Il nuovo indice geography su utility_pois esiste:
--   select indexname, indexdef from pg_indexes
--    where schemaname='public' and tablename='utility_pois'
--    order by indexname;
--     -- deve comparire utility_pois_geog_idx con "::geography" nella indexdef
--
-- 2) Il duplicato su shared_pois è sparito, il canonico resta:
--   select indexname from pg_indexes
--    where schemaname='public' and tablename='shared_pois'
--      and indexname in ('idx_shared_pois_geom','idx_shared_pois_geog');
--     -- atteso: SOLO idx_shared_pois_geog
--
-- 3) Il planner usa davvero l'indice geography su utility_pois:
--   explain analyze
--     select * from get_utility_pois(43.87, 10.24, 3000);
--     -- deve mostrare un Index/Bitmap Scan su utility_pois_geog_idx, non Seq Scan
-- ═══════════════════════════════════════════════════════════════════════════
