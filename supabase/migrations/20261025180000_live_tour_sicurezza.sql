-- Tour di gruppo (Live Tour): sicurezza e chiusura, 25/10/2026.
-- Collaudo reale con 3 utenti + 1 anonimo (scratch/collaudo-live-tour-multi.mjs):
--  1. il leader NON riusciva a terminare: UPDATE is_active=false → «new row violates row-level security policy».
--     Causa: con RETURNING la riga aggiornata deve passare anche la policy SELECT, che era «is_active = TRUE».
--  2. con la sola chiave anon si leggevano PIN e leader_id di TUTTE le sessioni attive (SELECT pubblica):
--     il PIN a 6 cifre non proteggeva nulla.
--  3. il canale realtime `live_tour:<pin>` era pubblico: un follower, o un anonimo, poteva trasmettere
--     audio-start / session-ended / museum-visit a tutti come fosse il leader.
-- Rimedio: (a) lettura della sessione SOLO per PIN tramite RPC SECURITY DEFINER (una riga, mai la lista);
-- (b) il leader vede e aggiorna le proprie righe, anche chiuse; (c) canale PRIVATO (Realtime Authorization):
-- tutti ricevono e fanno presence, solo il leader trasmette. L'app passa `private: true` e usa la RPC.

-- ── live_sessions: via tutte le policy di prima, poi quelle nuove ────────────────────────────────────
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'live_sessions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.live_sessions', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Il leader vede le proprie sessioni, anche chiuse (serve all'UPDATE con RETURNING e al ripristino).
CREATE POLICY "live_sessions: il leader legge le sue"
  ON public.live_sessions FOR SELECT TO authenticated
  USING (auth.uid() = leader_id);

CREATE POLICY "live_sessions: crea solo il leader"
  ON public.live_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = leader_id);

CREATE POLICY "live_sessions: aggiorna solo il leader"
  ON public.live_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = leader_id)
  WITH CHECK (auth.uid() = leader_id);

-- Nessuna policy DELETE: una sessione si chiude (is_active=false, expires_at=now()), non si cancella.

-- ── Ingresso per PIN: una riga sola, mai l'elenco ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.live_tour_entra(p_pin text)
RETURNS TABLE (id uuid, pin varchar, leader_id uuid, is_active boolean, current_poi_id text,
               expires_at timestamptz, created_at timestamptz, language text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.pin, s.leader_id, s.is_active, s.current_poi_id, s.expires_at, s.created_at, s.language
  FROM public.live_sessions s
  WHERE s.pin = regexp_replace(coalesce(p_pin, ''), '\D', '', 'g')
    AND s.is_active = TRUE
    AND s.expires_at > now()
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.live_tour_entra(text) FROM public;
GRANT EXECUTE ON FUNCTION public.live_tour_entra(text) TO anon, authenticated;

-- ── Aiuti per le policy del canale (SECURITY DEFINER: le policy girano col ruolo di chi si collega,
--    che ora NON vede live_sessions) ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.live_tour_canale_attivo(p_topic text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_sessions s
    WHERE p_topic = 'live_tour:' || s.pin AND s.is_active = TRUE AND s.expires_at > now()
  )
$$;
CREATE OR REPLACE FUNCTION public.live_tour_e_leader(p_topic text, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.live_sessions s
    WHERE p_topic = 'live_tour:' || s.pin AND s.leader_id = p_uid AND s.is_active = TRUE AND s.expires_at > now()
  )
$$;
REVOKE ALL ON FUNCTION public.live_tour_canale_attivo(text) FROM public;
REVOKE ALL ON FUNCTION public.live_tour_e_leader(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.live_tour_canale_attivo(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_tour_e_leader(text, uuid) TO anon, authenticated;

-- ── Canale privato `live_tour:<pin>` (Realtime Authorization su realtime.messages) ─────────────────
DROP POLICY IF EXISTS "live_tour: tutti ricevono" ON realtime.messages;
DROP POLICY IF EXISTS "live_tour: presence di tutti" ON realtime.messages;
DROP POLICY IF EXISTS "live_tour: trasmette solo il leader" ON realtime.messages;

-- Ricevere (broadcast e presence) e leggere lo stato: chiunque conosca il PIN di una sessione attiva, ospiti inclusi.
CREATE POLICY "live_tour: tutti ricevono"
  ON realtime.messages FOR SELECT TO authenticated, anon
  USING (realtime.topic() LIKE 'live_tour:%' AND public.live_tour_canale_attivo(realtime.topic()));

-- Presence (track): tutti, così il leader conta le persone per nome.
CREATE POLICY "live_tour: presence di tutti"
  ON realtime.messages FOR INSERT TO authenticated, anon
  WITH CHECK (realtime.topic() LIKE 'live_tour:%' AND realtime.messages.extension = 'presence'
              AND public.live_tour_canale_attivo(realtime.topic()));

-- Broadcast (audio-start, museum-*, session-ended): SOLO il leader della sessione di quel PIN.
CREATE POLICY "live_tour: trasmette solo il leader"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (realtime.topic() LIKE 'live_tour:%' AND realtime.messages.extension = 'broadcast'
              AND public.live_tour_e_leader(realtime.topic(), auth.uid()));

-- Chiusura delle sessioni rimaste «attive» per il difetto 1 (nessuna più giovane di 12 h viene toccata:
-- expires_at le chiude da solo; qui si allineano solo quelle già scadute).
UPDATE public.live_sessions SET is_active = FALSE WHERE is_active = TRUE AND expires_at <= now();
