-- ═══════════════════════════════════════════════════════════════════════════
-- ARCHIVIO PRIVATO DELLE FONTI (12/09/2026, decisione del committente)
--
-- Copia NOSTRA del materiale grezzo da cui si generano guide e audioguide:
-- l'estratto e le sezioni della voce Wikipedia (per lingua), il JSON
-- dell'entità Wikidata, le voci Wikivoyage, le immagini Commons (salvate su
-- Storage, qui solo il riferimento con licenza e autore).
--
-- Perché: le API di Wikipedia/Wikidata hanno limiti e cadute (SPARQL 504 a
-- ripetizione il 12/09), gli URL delle immagini scadono o cambiano, e la
-- generazione ripetibile in 7 lingue vuole LO STESSO materiale sorgente, non
-- una pagina che nel frattempo è cambiata. Una guida deve poter dire da quale
-- revisione della fonte è nata.
--
-- Licenze: Wikipedia/Wikivoyage CC BY-SA 4.0 (attribuzione da conservare),
-- Wikidata CC0, Commons per file (colonna licenza/attribuzione OBBLIGATORIA
-- per le immagini: mai una foto senza chi l'ha fatta).
--
-- IDEMPOTENTE. Tabella piccola per riga, molte righe: niente FK su
-- shared_pois (i POI vanno e vengono, l'archivio resta), indice per poi_id.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.fonti_poi (
  poi_id         text        NOT NULL,                 -- shared_pois.id (wd-Q…, osm-…, …)
  fonte          text        NOT NULL,                 -- wikipedia | wikidata | wikivoyage | commons | sito
  lingua         text        NOT NULL DEFAULT '',      -- 'it','en',… per wikipedia/wikivoyage; '' per wikidata/commons
  chiave         text        NOT NULL DEFAULT '',      -- titolo pagina, QID, nome file Commons, URL sito
  url            text,                                 -- dove sta l'originale
  titolo         text,
  testo          text,                                 -- estratto/sezioni in testo semplice (wikipedia, wikivoyage, sito)
  dati           jsonb,                                -- entità Wikidata (claims scelti), listing Wikivoyage, extmetadata Commons
  storage_path   text,                                 -- per commons: percorso su Storage (bucket fonti), due misure
  revisione      text,                                 -- revid Wikipedia / lastrevid Wikidata / sha1 file
  licenza        text,                                 -- CC BY-SA 4.0, CC0, CC BY 4.0, Public domain…
  attribuzione   text,                                 -- autore/credit da mostrare
  byte           integer,                              -- dimensione del testo o del file, per contare i costi
  recuperato_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poi_id, fonte, lingua, chiave)
);
CREATE INDEX IF NOT EXISTS idx_fonti_poi_poi ON public.fonti_poi (poi_id);
CREATE INDEX IF NOT EXISTS idx_fonti_poi_fonte_recuperato ON public.fonti_poi (fonte, recuperato_at);

COMMENT ON TABLE public.fonti_poi IS 'Archivio privato delle fonti (Wikipedia, Wikidata, Wikivoyage, Commons, sito) da cui si generano guide e audioguide. 12/09/2026.';

-- Solo il server (chiave di servizio) scrive e legge: il client non ha
-- bisogno delle fonti grezze.
ALTER TABLE public.fonti_poi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fonti_poi FROM anon, authenticated;
