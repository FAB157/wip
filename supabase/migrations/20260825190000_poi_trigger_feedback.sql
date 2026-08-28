-- ═══════════════════════════════════════════════════════════════════════════
-- CALIBRAZIONE ADATTIVA DEL RAGGIO DI TRIGGER (poi_trigger_feedback).
--
-- PERCHE' SERVE. Ogni POI ha un geofence_radius (il cerchio che fa scattare
-- l'audioguida), ma ogni antenna GPS e ogni citta' hanno riflessioni diverse:
-- un raggio calibrato per la media suona "in ritardo" in una via e "troppo
-- presto" in un'altra. Il committente ha chiesto un sistema che impari dal
-- comportamento reale, non un numero fisso uguale per tutti.
--
-- IL SEGNALE ESISTE GIA'. La rotta /api/telemetry/feedback riceve un verdetto
-- ('ok'|'early'|'wrong') dal player dopo ogni ascolto scattato da trigger
-- (PoiAudioPlayer.tsx, evento wip-trigger-feedback-request) e la rotta
-- /api/telemetry/trigger registra ogni 'fired'. Oggi finiscono SOLO in un
-- aggregato per-giorno (api_cache, chiave trigger_telemetry_YYYY-MM-DD,
-- campo byPoi) che si perde nel rumore quotidiano e non guida nessuna
-- decisione. Questa tabella e' l'aggregato PERSISTENTE per POI che serve al
-- job di calibrazione (server.ts, GET /api/geofence/calibrate-radius) per
-- decidere se stringere il raggio di un POI specifico.
--
-- SEMANTICA DEI CONTATORI: 'early' = l'utente ha giudicato che l'audio e'
-- partito troppo presto (il raggio era troppo largo per quel punto); 'wrong'
-- = POI sbagliato (non usato per il raggio, solo tenuto per diagnostica);
-- 'ok' = tutto giusto. Il job azzera i contatori dopo ogni aggiustamento,
-- cosi' il rapporto misura sempre il comportamento COL raggio attuale, non
-- una media che include il raggio di prima.
-- ═══════════════════════════════════════════════════════════════════════════

set search_path = public;
set lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.poi_trigger_feedback (
  poi_id        text PRIMARY KEY REFERENCES public.shared_pois(id) ON DELETE CASCADE,
  fired_count   integer NOT NULL DEFAULT 0,
  ok_count      integer NOT NULL DEFAULT 0,
  early_count   integer NOT NULL DEFAULT 0,
  wrong_count   integer NOT NULL DEFAULT 0,
  -- Ultima volta che il job di calibrazione ha toccato geofence_radius per
  -- questo POI: un nudge al massimo ogni 3 giorni (vedi la query del job),
  -- cosi' un raggio non oscilla avanti e indietro sullo stesso campione.
  last_nudge_at timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Il job legge "chi ha abbastanza campioni e non e' stato appena toccato":
-- questo indice parziale copre esattamente quella query senza pesare sulle
-- scritture frequenti (un bump per trigger/feedback, che sono tanti).
CREATE INDEX IF NOT EXISTS idx_poi_trigger_feedback_da_calibrare
  ON public.poi_trigger_feedback (fired_count)
  WHERE fired_count >= 15;

-- ── RLS: nessun accesso pubblico. Solo la service key (server.ts) legge e
-- scrive, tramite la RPC sotto per gli incrementi e una SELECT/UPDATE diretta
-- per il job di calibrazione notturno. ──────────────────────────────────────
ALTER TABLE public.poi_trigger_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS poi_trigger_feedback_service_only ON public.poi_trigger_feedback;
CREATE POLICY poi_trigger_feedback_service_only ON public.poi_trigger_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Incremento atomico (punto 1-2 della calibrazione) ───────────────────────
-- Stesso motivo di increment_quota (20260822120100): un GET-poi-PATCH dal
-- server rischia la race fra due richieste concorrenti sullo stesso POI (due
-- utenti che ascoltano la stessa chiesa nello stesso minuto). Una sola
-- UPDATE con upsert nella stessa transazione, mai due round-trip.
CREATE OR REPLACE FUNCTION public.bump_poi_trigger_feedback(
  p_poi_id text,
  p_field  text  -- 'fired' | 'ok' | 'early' | 'wrong'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_field NOT IN ('fired', 'ok', 'early', 'wrong') THEN
    RAISE EXCEPTION 'bump_poi_trigger_feedback: campo sconosciuto %', p_field;
  END IF;

  INSERT INTO public.poi_trigger_feedback (poi_id)
  VALUES (p_poi_id)
  ON CONFLICT (poi_id) DO NOTHING;

  EXECUTE format(
    'UPDATE public.poi_trigger_feedback SET %I = %I + 1, updated_at = now() WHERE poi_id = $1',
    p_field || '_count', p_field || '_count'
  ) USING p_poi_id;
EXCEPTION WHEN foreign_key_violation THEN
  -- Il poiId arrivato dal client non esiste (piu') in shared_pois: la
  -- telemetria e' best-effort, non deve mai far fallire la risposta al
  -- client per un riferimento zoppo.
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_poi_trigger_feedback(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_poi_trigger_feedback(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_poi_trigger_feedback(text, text) TO service_role;
