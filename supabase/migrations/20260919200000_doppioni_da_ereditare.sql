-- ANTI-RICADUTA «foto sparite» (19/09/2026, committente: «evita che risucceda»).
-- Il 10-14/09 un lavoro di massa ha nascosto decine di migliaia di righe di shared_pois che avevano foto e testo,
-- senza passarli alla riga che restava visibile: la foto giusta c'era, ma sulla riga che la mappa non mostra.
-- Da ora: quando una riga CON foto o testo viene nascosta (is_hidden → true, o status → non visibile) il trigger la
-- ANNOTA in una coda. Niente copia dentro il trigger, apposta: il 25 % delle foto dei doppioni era sbagliato, e la
-- scelta la fa lo script col filtro sul nome del file (scratch/foto-dal-doppione-mondo.mjs --coda --write).
-- Leggero (una INSERT, solo sulle transizioni) e fail-open: un errore qui non blocca MAI la scrittura su shared_pois.
CREATE TABLE IF NOT EXISTS public.doppioni_da_ereditare (
  poi_id text PRIMARY KEY,
  nascosto_il timestamptz NOT NULL DEFAULT now(),
  scritto_da text,
  elaborato_il timestamptz,
  esito text
);
ALTER TABLE public.doppioni_da_ereditare ENABLE ROW LEVEL SECURITY; -- nessuna policy: solo service role

CREATE OR REPLACE FUNCTION public.tg_doppione_nascosto_in_coda() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO public.doppioni_da_ereditare (poi_id, scritto_da) VALUES (NEW.id, NEW.scritto_da)
    ON CONFLICT (poi_id) DO UPDATE SET nascosto_il = now(), elaborato_il = NULL, esito = NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- fail-open
  END;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_doppione_nascosto_in_coda ON public.shared_pois;
CREATE TRIGGER trg_doppione_nascosto_in_coda
AFTER UPDATE OF is_hidden, status ON public.shared_pois
FOR EACH ROW
WHEN (
  (
    (NEW.is_hidden IS TRUE AND OLD.is_hidden IS DISTINCT FROM TRUE)
    OR (lower(COALESCE(NEW.status, '')) IN ('needs_revision', 'rejected', 'draft', 'hidden')
        AND lower(COALESCE(OLD.status, '')) NOT IN ('needs_revision', 'rejected', 'draft', 'hidden'))
  )
  AND (
    COALESCE(OLD.image_url, '') <> ''
    OR length(COALESCE(OLD.description_long, '')) >= 60
    OR length(COALESCE(OLD.description_short, '')) >= 40
  )
)
EXECUTE FUNCTION public.tg_doppione_nascosto_in_coda();
