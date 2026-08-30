-- ═══════════════════════════════════════════════════════════════════════════
--  DA INCOLLARE NEL PANNELLO SUPABASE → SQL EDITOR
--  (30/08/2026 — «troppi luoghi vicini», niente foto, pin che sfarfallano)
--
--  SINTOMO. Sul telefono compare «Troppi errori di rete recenti: pausa di
--  sicurezza sul caricamento dei luoghi dal database» e la mappa smette di
--  mostrare POI. Non e' un messaggio sul numero di luoghi: e' il circuit
--  breaker del client che si apre dopo ripetuti fallimenti della RPC
--  `nearby_pois`, e da quel momento la mappa legge solo la cache locale.
--  Senza POI non arrivano nemmeno le foto, e la lista che oscilla fra pieno e
--  vuoto fa togliere e rimettere i marcatori: da qui lo sfarfallio.
--
--  MISURATO OGGI dal PC, con la chiave di servizio (8 s di statement_timeout):
--     Carrara  2 km  →  158 POI in 2.394 ms
--     Carrara 10 km  →  400 POI in 3.309 ms
--     Firenze  2 km  →  TIMEOUT 57014 dopo 8.069 ms
--     Firenze  5 km  →  TIMEOUT 57014 dopo 8.073 ms
--     Roma     2 km  →  TIMEOUT 57014 dopo 8.062 ms
--     Roma    10 km  →  400 POI in 228 ms
--  Ripetendo, gli stessi punti a volte rispondono in 1,4 s e a volte scadono:
--  la funzione non e' «rotta», e' CRONICAMENTE LENTA e ondeggia intorno al
--  limite. Ogni volta che lo supera, il breaker si avvicina all'apertura.
--
--  Che un raggio PIU` STRETTO sia piu' lento di uno largo, e che i tempi
--  ballino cosi', indica che il piano di esecuzione non usa (o non usa bene)
--  l'indice spaziale e che le statistiche della tabella sono vecchie:
--  `shared_pois` e' passata a 8,7 milioni di righe con gli import di questi
--  giorni.
--
--  Le sezioni 1 e 2 non modificano niente: servono a vedere. La 3 e la 4
--  correggono. Si possono eseguire una alla volta.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1) DIAGNOSI: l'indice spaziale c'e'? ED e' quello giusto?
--
-- `nearby_pois` ordina con l'operatore KNN `<->` su
--     st_setsrid(st_makepoint(lon, lat), 4326)::geography
-- Perche' l'indice venga usato deve essere costruito sulla STESSA identica
-- espressione. Un indice su una colonna `geom` diversa, o su `geometry`
-- invece che `geography`, non viene preso e si fa la scansione completa.
-- ───────────────────────────────────────────────────────────────────────────
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'shared_pois'
ORDER BY indexname;


-- ───────────────────────────────────────────────────────────────────────────
-- 2) DIAGNOSI: la tabella e' mai stata analizzata? e quanto e' gonfia?
--
-- Se `last_autoanalyze` e `last_analyze` sono NULL, il pianificatore sta
-- lavorando su statistiche inventate: e' la causa tipica dei piani che
-- cambiano da una chiamata all'altra. `n_dead_tup` alto significa righe morte
-- che la scansione deve comunque attraversare.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  n_live_tup   AS righe_vive,
  n_dead_tup   AS righe_morte,
  last_vacuum, last_autovacuum,
  last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND relname = 'shared_pois';


-- ───────────────────────────────────────────────────────────────────────────
-- 3) CORREZIONE: statistiche aggiornate e manutenzione automatica sensata
--
-- ANALYZE su 8,7 milioni di righe richiede qualche minuto ma non blocca
-- nessuno (non prende lock esclusivi). Le soglie di default di autovacuum
-- (10% e 20% della tabella) su una tabella cosi' grande vogliono dire
-- centinaia di migliaia di righe cambiate prima che parta: di fatto non parte
-- mai. Qui si fissano soglie in valore assoluto.
-- ───────────────────────────────────────────────────────────────────────────
ANALYZE public.shared_pois;

ALTER TABLE public.shared_pois SET (
  autovacuum_analyze_scale_factor = 0,
  autovacuum_analyze_threshold    = 50000,
  autovacuum_vacuum_scale_factor  = 0,
  autovacuum_vacuum_threshold     = 50000
);


-- ───────────────────────────────────────────────────────────────────────────
-- 4) CORREZIONE: l'indice KNN sull'espressione ESATTA usata dalla funzione
--
-- CONCURRENTLY non blocca le scritture, ma NON puo' stare dentro una
-- transazione: va eseguito DA SOLO, selezionando solo questa riga. Su 8,7
-- milioni di righe puo' richiedere parecchi minuti. Se esiste gia' con questo
-- nome, la riga non fa nulla.
-- ───────────────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS shared_pois_geog_knn_idx
  ON public.shared_pois
  USING gist ((st_setsrid(st_makepoint(lon, lat), 4326)::geography));


-- ───────────────────────────────────────────────────────────────────────────
-- 5) LA CHIAMATA NON DEVE ESSERE TRONCATA (decisione del committente:
--    «il nostro database non deve bloccare la chiamata anche se dura 10
--    secondi»).
--
-- Oggi il ruolo che esegue la RPC ha statement_timeout 8 s: una risposta che
-- ne impiega 10 non arriva mai — viene uccisa a meta' con 57014, e per il
-- telefono e' un errore, non una lentezza. Il timeout si puo' alzare SULLA
-- SINGOLA FUNZIONE, senza toccare il ruolo: cosi' vale per la mappa e per il
-- radar, e non allenta i limiti sul resto del database (una query impazzita
-- altrove continua a essere fermata come prima).
--
-- 25 s e' largo di proposito: serve a NON troncare, non a rendere normale
-- l'attesa. Con l'indice e le statistiche a posto (sezioni 3 e 4) le
-- chiamate tornano in decine di millisecondi e questo tetto non si sfiora.
-- ───────────────────────────────────────────────────────────────────────────
ALTER FUNCTION public.nearby_pois(float, float, int, int) SET statement_timeout = '25s';

DO $$
BEGIN
  IF to_regprocedure('public.get_utility_pois(double precision, double precision, integer, integer)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.get_utility_pois(double precision, double precision, integer, integer) SET statement_timeout = ''25s''';
  END IF;
END $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 6) VERIFICA: dopo la 3 e la 4, questa deve rispondere in decine di
--    millisecondi e il piano deve nominare l'indice qui sopra.
-- ───────────────────────────────────────────────────────────────────────────
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.nearby_pois(43.7696, 11.2558, 2000, 400);
