-- ═══════════════════════════════════════════════════════════════════════════
-- INDICI PER L'ATLANTE BENI CULTURALI (1.806.024 righe al 18/08/2026)
--
-- Senza questi indici `order by name`, `ilike` e `count=exact` sull'intera
-- tabella sono scansioni sequenziali che esauriscono il budget di Disk IO
-- dell'istanza: il 18/08 hanno messo giù il database di produzione per ~40
-- minuti. Le rotte /api/admin/beni-culturali hanno una guardia che rifiuta
-- quelle query finché gli indici non ci sono.
--
-- ─── ESECUZIONE ────────────────────────────────────────────────────────────
-- Un blocco solo, da incollare nell'editor SQL di Supabase.
--
-- NIENTE `CONCURRENTLY`: l'editor esegue tutto dentro una transazione e
-- CONCURRENTLY lì dentro è vietato (errore 25001). La conseguenza è buona —
-- se la connessione cade a metà ("Connection terminated due to connection
-- timeout") il rollback annulla tutto e NON restano indici invalidi: si
-- riprova senza pulire niente.
--
-- CREATE INDEX senza CONCURRENTLY blocca le SCRITTURE su beni_culturali per
-- la durata; le letture della mappa continuano, e a scrivere qui sono solo
-- gli importatori batch.
--
-- Se l'editor non arriva in fondo (i due indici GIN in coda sono i lenti):
--   $env:WIP_PG_PASSWORD = "<password del database>"
--   node scratch/applica-indici-beni.mjs --write
-- che apre una connessione diretta senza limite di tempo e costruisce un
-- indice alla volta, saltando quelli già presenti.
-- ═══════════════════════════════════════════════════════════════════════════

-- Più memoria di lavoro: accorcia molto la costruzione. Vale per questa
-- transazione, quindi deve stare nello stesso blocco degli indici.
SET maintenance_work_mem = '256MB';

-- 1) Elenco filtrato per fonte e ordinato per nome: il caso normale del
--    pannello ("i beni FAI in ordine alfabetico"). Btree, veloce.
CREATE INDEX IF NOT EXISTS idx_beni_culturali_source_name
  ON public.beni_culturali (source, name);

-- 2) Filtri per paese e fascia.
CREATE INDEX IF NOT EXISTS idx_beni_culturali_country_tier
  ON public.beni_culturali (country, tier);

-- 3) Coda del curatore: i beni non ancora collegati a un POI. Indice
--    parziale, quindi piccolo anche su 1,8 milioni di righe.
CREATE INDEX IF NOT EXISTS idx_beni_culturali_da_promuovere
  ON public.beni_culturali (source, name)
  WHERE promoted_poi_id IS NULL AND matched_poi_id IS NULL;

-- 4) Ricerca testuale (ilike *testo*): le due più lente da costruire, per
--    questo stanno in fondo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_beni_culturali_name_trgm
  ON public.beni_culturali USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_beni_culturali_comune_trgm
  ON public.beni_culturali USING gin (comune gin_trgm_ops);

-- Verifica: l'editor mostra il risultato dell'ultima istruzione. Devono
-- comparire i cinque indici qui sopra più idx_beni_culturali_latlon e
-- idx_beni_culturali_matched, tutti con valido = true.
select indexrelid::regclass as indice, indisvalid as valido,
       pg_size_pretty(pg_relation_size(indexrelid)) as dimensione
from pg_index
where indrelid = 'public.beni_culturali'::regclass
order by 1;

-- FATTO QUESTO: togliere la guardia in server.ts (/api/admin/beni-culturali
-- rifiuta ricerca e filtro "solo già POI" senza filtro per fonte) e
-- riabilitare i due controlli in AdminBeniCulturali.tsx.
