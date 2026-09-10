-- LIBRERIA DELLE VISITE GUIDATE NEI MUSEI (10/09/2026)
--
-- Le guide interne dei musei (percorso di sale e opere) vivevano solo in
-- api_cache, che è una cache generica: non si può elencare, non si può
-- cercare per vicinanza, non si sa quali musei sono già pronti. Questa
-- tabella è la LIBRERIA: una riga per (museo, lingua), consultabile.
--
-- Regola del progetto: nasce mondiale. La chiave del luogo è il poi_id
-- quando il museo è nel nostro archivio, altrimenti lo slug del nome della
-- voce Wikipedia, così vale per qualunque museo del pianeta.

CREATE TABLE IF NOT EXISTS public.museum_guides (
  id               bigserial PRIMARY KEY,
  -- "poi_<id>" oppure "nome_<slug>": stessa chiave usata da api_cache.
  venue_key        text        NOT NULL,
  venue_name       text        NOT NULL,
  poi_id           text,
  language         text        NOT NULL,
  -- 'museo' | 'chiesa' | 'sito'
  venue_type       text        NOT NULL DEFAULT 'museo',
  city             text,
  country_code     text,
  lat              double precision,
  lon              double precision,
  -- { tipo, intro, consiglio, tappe:[{nome,autore,anno,dove,perche}], language }
  guide            jsonb       NOT NULL,
  -- { lang, title, url } della voce Wikipedia + eventuale sito ufficiale
  source           jsonb,
  official_site    text,
  stops_count      integer     NOT NULL DEFAULT 0,
  -- quante tappe portano l'indicazione della sala: misura la qualità
  stops_with_room  integer     NOT NULL DEFAULT 0,
  -- 'auto' (generata su richiesta di un utente) | 'seeded' (semina) | 'curated'
  origin           text        NOT NULL DEFAULT 'auto',
  hits             integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT museum_guides_key_lang_uniq UNIQUE (venue_key, language)
);

CREATE INDEX IF NOT EXISTS museum_guides_lang_idx    ON public.museum_guides (language);
CREATE INDEX IF NOT EXISTS museum_guides_poi_idx     ON public.museum_guides (poi_id) WHERE poi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS museum_guides_geo_idx     ON public.museum_guides (lat, lon);
CREATE INDEX IF NOT EXISTS museum_guides_country_idx ON public.museum_guides (country_code);

COMMENT ON TABLE public.museum_guides IS
  'Libreria delle visite guidate nei musei/chiese: una riga per (venue_key, language). Generata da /api/vision/venue-guide e dallo script di semina scratch/semina-guide-musei.mjs.';

-- Lettura pubblica (le guide non contengono nulla di personale), scrittura
-- solo dal server con la service key: stessa impostazione dei POI condivisi.
ALTER TABLE public.museum_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS museum_guides_read ON public.museum_guides;
CREATE POLICY museum_guides_read ON public.museum_guides
  FOR SELECT USING (true);

-- Contatore d'uso: quali guide della libreria servono davvero. Una funzione
-- invece di una UPDATE dal server perché deve essere atomica e non deve mai
-- far fallire la richiesta dell'utente.
CREATE OR REPLACE FUNCTION public.increment_museum_guide_hits(p_venue_key text, p_language text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.museum_guides
     SET hits = hits + 1
   WHERE venue_key = p_venue_key AND language = p_language;
$$;
