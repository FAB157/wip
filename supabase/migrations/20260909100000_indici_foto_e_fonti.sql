-- INDICI SULLE COLONNE DI FILTRO DI shared_pois E beni_culturali (09/09/2026).
--
-- Nella notte 07-09/09 gli script di riparazione foto/descrizioni sono andati
-- decine di volte in statement timeout (57014, 8 s) filtrando shared_pois
-- (1,78 M righe) su colonne SENZA indice: image_source, enrichment_source,
-- wikidata/wikipedia_url, "foto assente". La verifica delle foto "agnes" ha
-- dovuto leggere 1.551.649 righe per categoria e filtrare lato client per
-- trovarne 3.441. Stesso muro per il pannello admin e per qualunque funzione
-- futura "trovami i POI senza foto / con foto da fonte X".
--
-- Tutti parziali dove ha senso: costano pochi MB e coprono esattamente le
-- query che si fanno (keyset su id dentro una categoria).
--
-- NOTA ESECUZIONE: CREATE INDEX (senza CONCURRENTLY) prende un lock breve in
-- scrittura sulla tabella — su 1,78 M righe decine di secondi per indice.
-- Da lanciare in un momento tranquillo. Nel SQL editor di Supabase
-- CONCURRENTLY non e' ammesso (transazione implicita); da psql/CLI si puo'
-- sostituire con CREATE INDEX CONCURRENTLY per evitare il lock.

-- 1. POI senza foto vera, per categoria, in ordine di id (paginazione keyset
--    degli script ripara-foto-*.mjs e delle viste admin "senza foto").
CREATE INDEX IF NOT EXISTS idx_shared_pois_senza_foto
  ON public.shared_pois (category, id)
  WHERE image_url IS NULL AND photo_url IS NULL;

-- 2. Fonte dell'arricchimento (verifica-foto-agnes.mjs: "quali POI ha
--    arricchito agnes_free_wiki_json").
CREATE INDEX IF NOT EXISTS idx_shared_pois_enrichment_source
  ON public.shared_pois (enrichment_source, category, id)
  WHERE enrichment_source IS NOT NULL;

-- 3. Provenienza della foto (annulla-sito-ufficiale-loghi.mjs e simili:
--    "rimuovi tutte le foto scritte da X").
CREATE INDEX IF NOT EXISTS idx_shared_pois_image_source
  ON public.shared_pois (image_source, category, id)
  WHERE image_source IS NOT NULL;

-- 4. Collegamenti diretti (ripara-foto-collegate.mjs: POI con Q-ID Wikidata
--    o URL Wikipedia).
CREATE INDEX IF NOT EXISTS idx_shared_pois_wikidata
  ON public.shared_pois (category, id)
  WHERE wikidata IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shared_pois_wikipedia_url
  ON public.shared_pois (category, id)
  WHERE wikipedia_url IS NOT NULL;

-- 5. Riferimento Mérimée dentro technical_data (patrimonio francese).
CREATE INDEX IF NOT EXISTS idx_shared_pois_merimee
  ON public.shared_pois (id)
  WHERE (technical_data ->> 'reference_merimee') IS NOT NULL;

-- beni_culturali (1,8 M righe): gli script di aggancio e di copia
-- foto/descrizioni paginano per paese e per collegamento.
CREATE INDEX IF NOT EXISTS idx_beni_culturali_da_agganciare
  ON public.beni_culturali (country, id)
  WHERE promoted_poi_id IS NULL AND matched_poi_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_beni_culturali_promoted
  ON public.beni_culturali (id)
  WHERE promoted_poi_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beni_culturali_matched
  ON public.beni_culturali (id)
  WHERE matched_poi_id IS NOT NULL;

-- Annullamenti per nome (annulla-agganci-gb.mjs): country + name.
CREATE INDEX IF NOT EXISTS idx_beni_culturali_country_name
  ON public.beni_culturali (country, name);
