-- ═══════════════════════════════════════════════════════════════════════════
-- Sicurezza per celiaci: una riga per locale, tabella a parte (come
-- poi_entrances) per non toccare shared_pois.
--
-- REGOLA: "100%" e "cucina dedicata" non si scrivono senza una PROVA. La colonna
-- `evidence` contiene la frase da cui e' uscito il livello; senza frase il
-- livello resta 'non_verificato'. Per un celiaco un falso "100%" e' peggio di
-- un locale mancante.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.poi_gluten_safety (
  poi_id text PRIMARY KEY REFERENCES public.shared_pois(id) ON DELETE CASCADE,

  -- solo         = tutto o quasi tutto senza glutine (OSM diet:gluten_free=only)
  -- opzioni      = buona scelta di piatti senza glutine (OSM yes)
  -- limitato     = pochissime opzioni (OSM limited): si mostra con avviso
  -- non_verificato = nessuna evidenza: NON si mostra come senza glutine
  level text NOT NULL DEFAULT 'non_verificato'
    CHECK (level IN ('solo', 'opzioni', 'limitato', 'non_verificato')),

  -- NULL = sconosciuto. Mai false per "non lo so".
  dedicated_kitchen boolean,
  dedicated_fryer boolean,

  -- Certificazione con LINK alla fonte (nessun dato copiato dalle associazioni).
  certification text,            -- 'AIC' | 'Coeliac UK' | 'GFFS' | testo libero
  certification_url text,

  -- La prova: frase citata + dove e' stata letta.
  evidence text,
  evidence_url text,
  source text NOT NULL DEFAULT 'osm'
    CHECK (source IN ('osm', 'sito_locale', 'utenti', 'admin')),

  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poi_gluten_safety_level_idx
  ON public.poi_gluten_safety (level);

ALTER TABLE public.poi_gluten_safety ENABLE ROW LEVEL SECURITY;

-- Lettura pubblica; scrittura solo service role (server / script di import).
DROP POLICY IF EXISTS poi_gluten_safety_read ON public.poi_gluten_safety;
CREATE POLICY poi_gluten_safety_read ON public.poi_gluten_safety
  FOR SELECT USING (true);
