-- =====================================================================
-- MIGRATION: Fix POI Status + Cache-First Statistics
-- Esegui nel SQL Editor di Supabase
-- =====================================================================

-- ── 1. APPROVA TUTTI I POI IMPORTATI (seed / import operations) ──────
-- Tutti i POI che non sono stati esplicitamente modificati da un admin
-- devono essere "verified" e immediatamente visibili ai nuovi utenti.
UPDATE public.shared_pois
SET status = 'verified'
WHERE status = 'draft'
  AND description_ai IS NOT NULL;  -- hanno già testo AI = completati

-- Anche i POI con description_ai null ma che provengono dall'import:
-- (quelli senza testo AI li manteniamo draft finché non vengono arricchiti)

-- ── 2. CAMBIA IL DEFAULT STATUS a 'verified' per i nuovi INSERT ───────
ALTER TABLE public.shared_pois 
  ALTER COLUMN status SET DEFAULT 'verified';

-- ── 3. FIX TRIGGER enrich_poi: triggera su 'verified' non su 'draft' ──
-- Il vecchio trigger si attivava solo su status='draft', ora non serve più.
-- Modifichiamo per triggerare su description_ai IS NULL (indipendente dallo status)
CREATE OR REPLACE FUNCTION public.trigger_enrich_poi()
RETURNS TRIGGER AS $$
BEGIN
    -- Trigger enrichment whenever a new POI has no AI description yet
    IF (NEW.description_ai IS NULL OR NEW.description_ai = '') THEN
        PERFORM net.http_post(
            url := 'https://qfxxhzkkrkvbuekfknhh.supabase.co/functions/v1/manager-poi',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer <<SUPABASE_SERVICE_ROLE_KEY>>'
            ),
            body := jsonb_build_object(
                'action', 'enrich-now',
                'id', NEW.id,
                'name', NEW.name,
                'lat', NEW.lat,
                'lon', NEW.lon,
                'category', NEW.category,
                'lang', 'it'
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. AGGIUNGI COLONNA poi_id a shared_poi_audio_cache per tracking ──
-- Assicura che la tabella shared_poi_audio_cache abbia un indice su created_at
-- per conteggi efficienti per periodo temporale
CREATE INDEX IF NOT EXISTS idx_shared_poi_audio_cache_created 
  ON public.shared_poi_audio_cache (created_at);

-- ── 5. FIX: La tabella punti_interesse (se usata) deve avere status verified ──
-- Se punti_interesse esiste (tabella separata), approva tutti i draft
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'punti_interesse'
  ) THEN
    EXECUTE 'UPDATE public.punti_interesse SET status = ''verified'' WHERE status = ''draft''';
    EXECUTE 'UPDATE public.punti_interesse SET status = ''verified'' WHERE status IS NULL';
    RAISE NOTICE 'punti_interesse: tutti i POI impostati a verified';
  ELSE
    RAISE NOTICE 'Tabella punti_interesse non trovata, skip.';
  END IF;
END$$;

-- ── 6. VERIFICA CONTEGGI POST-MIGRATION ──────────────────────────────
SELECT 
  'shared_pois' AS tabella,
  COUNT(*) AS totale,
  COUNT(*) FILTER (WHERE status = 'verified') AS verificati,
  COUNT(*) FILTER (WHERE status = 'draft') AS bozze,
  COUNT(*) FILTER (WHERE status = 'needs_revision') AS da_revisionare,
  COUNT(*) FILTER (WHERE description_ai IS NOT NULL) AS con_testo_ai
FROM public.shared_pois

UNION ALL

SELECT
  'shared_poi_audio_cache' AS tabella,
  COUNT(*) AS totale,
  COUNT(*) FILTER (WHERE audio_base64 IS NOT NULL) AS con_audio,
  COUNT(*) FILTER (WHERE generated_text IS NOT NULL) AS con_testo,
  0 AS da_revisionare,
  0 AS con_testo_ai
FROM public.shared_poi_audio_cache

UNION ALL

SELECT
  'api_cache' AS tabella,
  COUNT(*) AS totale,
  COUNT(*) FILTER (WHERE content_type = 'audio_guide') AS audio_guide,
  COUNT(*) FILTER (WHERE content_type = 'itinerary') AS itinerari,
  0 AS da_revisionare,
  0 AS con_testo_ai
FROM public.api_cache;
