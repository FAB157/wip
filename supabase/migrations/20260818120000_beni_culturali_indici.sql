-- ═══════════════════════════════════════════════════════════════════════════
-- INDICI PER L'ATLANTE BENI CULTURALI — DA APPLICARE A MANO (SQL editor).
--
-- Misurato il 18/08/2026 sul DB live: `beni_culturali` contiene 1.806.024
-- righe (Italia MiC + registri esteri). Con quella mole:
--   • `order by name` senza filtri selettivi  → statement timeout (9s)
--   • `Prefer: count=exact`                   → statement timeout
--   • ordinamento sulla PK, count stimato, ilike senza order → < 300 ms
-- Le rotte /api/admin/beni-culturali sono già state scritte per stare dentro
-- questi limiti (ordine per id salvo filtro fonte, count=planned). Questi
-- indici servono a togliere il vincolo, non a farle funzionare.
--
-- ATTENZIONE: eseguire UNA ISTRUZIONE ALLA VOLTA. `CREATE INDEX CONCURRENTLY`
-- non può stare in una transazione, e senza CONCURRENTLY si blocca in
-- scrittura una tabella da cui la mappa legge in continuazione.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Ricerca testuale per nome e comune (il pannello usa ilike *testo*).
--    Senza trigrammi l'ilike è una scansione sequenziale su 1,8 M di righe:
--    oggi regge solo perché si ferma al primo blocco di risultati.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_beni_culturali_name_trgm
  ON public.beni_culturali USING gin (name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_beni_culturali_comune_trgm
  ON public.beni_culturali USING gin (comune gin_trgm_ops);

-- 2) Elenco filtrato per fonte e ordinato per nome (il caso normale del
--    pannello: "mostrami i beni FAI in ordine alfabetico").
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_beni_culturali_source_name
  ON public.beni_culturali (source, name);

-- 3) Filtri per paese e fascia.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_beni_culturali_country_tier
  ON public.beni_culturali (country, tier);

-- 4) "Solo NON promossi": è la coda di lavoro del curatore, e senza indice
--    parziale costa una scansione completa.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_beni_culturali_da_promuovere
  ON public.beni_culturali (source, name)
  WHERE promoted_poi_id IS NULL AND matched_poi_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE:
--   select indexname from pg_indexes where tablename = 'beni_culturali';
--   → devono comparire i cinque indici qui sopra oltre a idx_beni_culturali_latlon
--
--   explain analyze
--   select * from beni_culturali where name ilike '%villa%' order by name limit 50;
--   → deve usare l'indice trigram, non un Seq Scan
-- ═══════════════════════════════════════════════════════════════════════════
