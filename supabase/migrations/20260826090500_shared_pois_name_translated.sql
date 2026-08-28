-- I POI con nome originale in script non latino (cinese, giapponese, russo...)
-- vengono mostrati così come sono, presi grezzi da OSM/Wikidata: un utente
-- italiano non capisce cosa sia il luogo. Aggiunge un campo opzionale per la
-- traduzione/traslitterazione per lingua, popolato dal curatore AI in
-- /api/poi/enrich quando il nome contiene caratteri non latini. Il nome
-- originale (`name`) NON viene mai toccato: resta l'identificatore per
-- matching OSM/Wikipedia (nomeCombacia) e ricerca.
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS name_translated JSONB;
