-- ═══════════════════════════════════════════════════════════════════════════
-- INDIRIZZI E INGRESSI DA OPENSTREETMAP — DA APPLICARE A MANO.
--
-- Cosa arriva. L'estrazione OSM (scratch/indirizzi-mondo.mjs) ha portato 91,7
-- milioni di nodi civico e 5,5 milioni di nodi `entrance` di tutto il mondo;
-- l'incrocio con i nostri POI (scratch/abbina-ingressi-mondo.mjs) ne ha
-- abbinati 414.298: 279.239 con via e numero, 295.295 con le coordinate del
-- portone.
--
-- Perche' una tabella di appoggio invece di 574.000 PATCH via REST. A dieci
-- scritture al secondo sarebbero sedici ore di martellamento continuo su un
-- database che questa settimana e' gia' caduto due volte sotto carico. Con lo
-- staging si caricano 414.298 righe in ~420 richieste, e l'aggiornamento vero
-- lo fa il database in casa propria, a lotti, senza rete di mezzo.
--
-- Perche' una funzione a lotti invece di un solo UPDATE. Un UPDATE che tocca
-- 414.000 righe di shared_pois tiene i lock per minuti e blocca le letture
-- degli utenti: e' esattamente il modo in cui si e' rotto tutto il 18/08.
-- La funzione ne fa 5.000 per volta e segna quelle fatte, cosi' il lavoro e'
-- interrompibile e ripetibile.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- ── Tabella di appoggio ────────────────────────────────────────────────────
-- Vive finche' serve e poi si butta (DROP in fondo al file, commentato).
CREATE TABLE IF NOT EXISTS public.poi_indirizzi_import (
  id            text PRIMARY KEY,
  address       text,
  entrance_lat  double precision,
  entrance_lon  double precision,
  citta         text,
  applicato     boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_poi_indirizzi_import_da_fare
  ON public.poi_indirizzi_import (id) WHERE NOT applicato;

-- Nessuno la deve leggere dal client: e' un cantiere, non un dato.
ALTER TABLE public.poi_indirizzi_import ENABLE ROW LEVEL SECURITY;
-- Nessuna policy = nessun accesso dai client. La service key passa comunque.

-- ── La funzione che applica un lotto ───────────────────────────────────────
-- Ritorna quante righe ha applicato: 0 significa "finito".
--
-- LE DUE REGOLE DI PRUDENZA, scritte qui e non nello script che chiama, cosi'
-- valgono anche se qualcuno la invoca a mano:
--   • l'indirizzo si scrive SOLO dove non c'e' gia'. Le fonti ufficiali
--     (catalogo MiC, IMLS, Museofile, registri patrimonio) sono migliori di un
--     civico OSM dedotto: mai sovrascriverle.
--   • l'ingresso si scrive SOLO dove non c'e' gia', per lo stesso motivo.
CREATE OR REPLACE FUNCTION public.applica_indirizzi_osm(p_limite integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH lotto AS (
    SELECT i.id, i.address, i.entrance_lat, i.entrance_lon
    FROM public.poi_indirizzi_import i
    WHERE NOT i.applicato
    ORDER BY i.id
    LIMIT p_limite
    FOR UPDATE SKIP LOCKED
  ), scritti AS (
    UPDATE public.shared_pois p
    SET address        = COALESCE(p.address, l.address),
        address_source = CASE WHEN p.address IS NULL AND l.address IS NOT NULL
                              THEN 'osm_civico' ELSE p.address_source END,
        entrance_lat   = COALESCE(p.entrance_lat, l.entrance_lat),
        entrance_lon   = COALESCE(p.entrance_lon, l.entrance_lon)
    FROM lotto l
    WHERE p.id = l.id
      AND (
        (p.address IS NULL      AND l.address IS NOT NULL) OR
        (p.entrance_lat IS NULL AND l.entrance_lat IS NOT NULL)
      )
    RETURNING p.id
  )
  UPDATE public.poi_indirizzi_import i
  SET applicato = true
  FROM lotto l
  WHERE i.id = l.id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.applica_indirizzi_osm(integer) FROM public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE:
--   select count(*) from poi_indirizzi_import;              -- 414.298 dopo il caricamento
--   select applica_indirizzi_osm(100);                      -- prova: ritorna 100
--   select count(*) from shared_pois where address_source='osm_civico';
--
-- QUANDO E' FINITO (applica_indirizzi_osm ritorna 0 e i numeri tornano):
--   drop function public.applica_indirizzi_osm(integer);
--   drop table public.poi_indirizzi_import;
-- ═══════════════════════════════════════════════════════════════════════════
