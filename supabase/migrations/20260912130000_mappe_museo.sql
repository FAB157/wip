-- ═══════════════════════════════════════════════════════════════════════════
-- MAPPE INTERATTIVE DEI MUSEI (12/09/2026, regola fissa del committente:
-- «da ora sempre mappe interattive con posizione delle opere con audioguida,
-- sia lista come ora che mappa interattiva»).
--
-- Una riga per pianta (un museo può averne una per piano): l'immagine sta
-- sul bucket PUBBLICO «mappe» (copiata da fonti/musei/<poi>/mappa-N.* del
-- sito ufficiale), i pin sono le sale con le coordinate in frazione
-- 0-1 dell'immagine (origine in alto a sinistra), messi da un modello vision
-- che legge le etichette della pianta e corretti a mano dall'admin.
-- Il client abbina ogni tappa della guida al pin della sua sala («dove»).
-- IDEMPOTENTE.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mappe_museo (
  poi_id        text        NOT NULL,
  indice        integer     NOT NULL DEFAULT 1,
  titolo        text,
  storage_path  text        NOT NULL,          -- nel bucket pubblico «mappe»
  url           text        NOT NULL,          -- URL pubblico dell'immagine
  fonte_url     text,                          -- pagina ufficiale da cui viene
  origine       text        NOT NULL DEFAULT 'sito',   -- sito | commons | osm | admin
  larghezza     integer,
  altezza       integer,
  -- [{ "sala": "Sala 10", "x": 0.42, "y": 0.31, "origine": "ai"|"admin", "piano": "1" }]
  pins          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  pins_origine  text,                          -- ai | admin | null (nessun pin)
  aggiornato_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poi_id, indice)
);
COMMENT ON TABLE public.mappe_museo IS 'Piante dei musei con i pin delle sale (frazione 0-1 dell''immagine). 12/09/2026.';

-- Lettura pubblica (la mappa la vede chi visita), scrittura solo dal server.
ALTER TABLE public.mappe_museo ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mappe_museo' AND policyname = 'mappe_museo_lettura') THEN
    CREATE POLICY mappe_museo_lettura ON public.mappe_museo FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
REVOKE INSERT, UPDATE, DELETE ON public.mappe_museo FROM anon, authenticated;
