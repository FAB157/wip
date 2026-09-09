-- AUDIT DELLE SCRITTURE SU shared_pois (09/09/2026).
--
-- Nella notte 07-09/09 per ANNULLARE le scritture sbagliate degli script di
-- massa (109 foto a caso su monumenti, 100 loghi al posto di foto, 11.417
-- agganci sbagliati nel Regno Unito) si e' dovuto ricostruire "chi ha scritto
-- cosa" dai log di testo, per nome, con regex — un'archeologia fragile
-- (la prima volta ha ripristinato 22 righe su 109 per un nome con i due
-- punti dentro). shared_pois non sa chi ha scritto un campo ne' quando.
--
-- Da oggi: ogni cambio di image_url / photo_url / description_long /
-- description_short viene registrato in poi_modifiche con valore prima e
-- dopo e la FONTE (colonna scritto_da, che ogni script mette nella stessa
-- PATCH: 'ripara-foto-morte', 'ripara-foto-collegate', 'admin', ...).
-- Annullare un giro diventa una query:
--   UPDATE shared_pois p SET image_url = m.valore_prima ...
--   FROM poi_modifiche m WHERE m.scritto_da = 'X' AND m.creato > '...'
-- invece di leggere un log.
--
-- Il trigger e' AFTER UPDATE e non blocca mai la scrittura (fail-open:
-- un errore nell'audit non deve far fallire l'aggiornamento del POI).

ALTER TABLE public.shared_pois
  ADD COLUMN IF NOT EXISTS scritto_da text;

COMMENT ON COLUMN public.shared_pois.scritto_da IS
  'Chi ha fatto l''ultima scrittura (nome script / admin / app). Copiato in poi_modifiche dal trigger.';

CREATE TABLE IF NOT EXISTS public.poi_modifiche (
  id bigserial PRIMARY KEY,
  poi_id text NOT NULL,
  campo text NOT NULL,
  valore_prima text,
  valore_dopo text,
  scritto_da text,
  creato timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poi_modifiche_poi ON public.poi_modifiche (poi_id, creato DESC);
CREATE INDEX IF NOT EXISTS idx_poi_modifiche_fonte ON public.poi_modifiche (scritto_da, creato DESC);

-- Solo la service role scrive/legge: e' uno strumento operativo, non dati utente.
ALTER TABLE public.poi_modifiche ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.audit_shared_pois()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN
      INSERT INTO public.poi_modifiche (poi_id, campo, valore_prima, valore_dopo, scritto_da)
      VALUES (NEW.id, 'image_url', OLD.image_url, NEW.image_url, NEW.scritto_da);
    END IF;
    IF NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
      INSERT INTO public.poi_modifiche (poi_id, campo, valore_prima, valore_dopo, scritto_da)
      VALUES (NEW.id, 'photo_url', OLD.photo_url, NEW.photo_url, NEW.scritto_da);
    END IF;
    IF NEW.description_long IS DISTINCT FROM OLD.description_long THEN
      INSERT INTO public.poi_modifiche (poi_id, campo, valore_prima, valore_dopo, scritto_da)
      VALUES (NEW.id, 'description_long', OLD.description_long, NEW.description_long, NEW.scritto_da);
    END IF;
    IF NEW.description_short IS DISTINCT FROM OLD.description_short THEN
      INSERT INTO public.poi_modifiche (poi_id, campo, valore_prima, valore_dopo, scritto_da)
      VALUES (NEW.id, 'description_short', OLD.description_short, NEW.description_short, NEW.scritto_da);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Fail-open: l'audit non deve mai bloccare la scrittura del POI.
    RAISE WARNING 'audit_shared_pois: % (poi %)', SQLERRM, NEW.id;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_shared_pois ON public.shared_pois;
CREATE TRIGGER tr_audit_shared_pois
  AFTER UPDATE OF image_url, photo_url, description_long, description_short
  ON public.shared_pois
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_shared_pois();

-- Pulizia: le modifiche piu' vecchie di 180 giorni non servono piu' a
-- nessun annullamento (da chiamare dal cron di manutenzione, o a mano).
CREATE OR REPLACE FUNCTION public.poi_modifiche_pulisci(giorni int DEFAULT 180)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH d AS (
    DELETE FROM public.poi_modifiche WHERE creato < now() - make_interval(days => giorni) RETURNING 1
  ) SELECT count(*)::int FROM d;
$$;
