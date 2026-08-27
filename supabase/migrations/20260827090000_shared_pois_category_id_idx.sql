-- ═══════════════════════════════════════════════════════════════════════════
-- INDICE COMPOSTO (category, id) SU shared_pois — 27/08/2026.
--
-- PERCHÉ SERVE. scripts/fix_poi_photos.ts pagina i lotti grandi con un
-- cursore (`WHERE id > cursore ORDER BY id LIMIT N`, vedi la migrazione del
-- 26/08 sulla paginazione dello script) filtrando per `category IN (...)`.
-- Senza un indice che copra ENTRAMBE le colonne insieme, Postgres non ha un
-- percorso efficiente per "filtra per categoria, poi ordina per id": la
-- query va in statement timeout dopo ~8s anche sulla primissima pagina,
-- verificato direttamente in isolamento (category IN (terme,park,parco)
-- ORDER BY id LIMIT 1000 → errore 57014 canceling statement due to
-- statement timeout).
--
-- CONCURRENTLY: shared_pois ha milioni di righe: un CREATE INDEX normale
-- prenderebbe un lock che blocca le scritture in corso (incluso questo
-- stesso script, e la produzione). CONCURRENTLY costruisce l'indice senza
-- lock esclusivo, più lento ma senza fermare nessuno. Non può girare dentro
-- una transazione: se l'editor SQL di Supabase avvolge tutto in BEGIN/COMMIT,
-- va lanciata da sola (non insieme ad altre istruzioni).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shared_pois_category_id
  ON public.shared_pois (category, id);
