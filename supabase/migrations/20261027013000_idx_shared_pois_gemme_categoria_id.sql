-- Indice parziale per le letture a pagine delle GEMME per categoria (26/10/2026).
-- foto-gemme (wip-simple-1/2) e gli altri giri sulle gemme chiedono
--   category = $1 AND is_gem = true AND id > $cursore ORDER BY id LIMIT n
-- e con il solo idx_shared_pois_category_id Postgres scorre TUTTE le righe della categoria: misurato su
-- «monumenti», 28.411 righe scartate e 16.171 blocchi letti dal disco per 200 gemme (13 s). Prima voce di
-- pg_stat_statements per numero di chiamate fra le letture pesanti (35.541 chiamate, 104 milioni di blocchi dal
-- 11/10): una parte del Disk IO di cui Supabase ha avvisato.
-- Costruito CONCURRENTLY (non blocca le scritture), di notte, da Oracle (/root/indice-gemme-notte.cjs).
create index concurrently if not exists idx_shared_pois_gemme_categoria_id
  on public.shared_pois (category, id)
  where is_gem = true;
