-- ═══════════════════════════════════════════════════════════════════════════
-- L'INDIRIZZO DIVENTA UN PUNTO — DA APPLICARE A MANO (SQL editor).
--
-- IL PROBLEMA. 1,22 milioni di POI hanno `address` (una stringa) e solo
-- 277.363 hanno `entrance_lat/lon` (un punto). Ma il trigger del geofence e
-- il navigatore non sanno leggere una stringa: `puntoArrivo()` in
-- src/lib/puntoArrivo.ts prende l'ingresso, e se manca ripiega sul centroide.
-- Il centroide di un palazzo puo' agganciare OSRM alla via sul RETRO: il
-- percorso gira dalla parte sbagliata per tutta la sua lunghezza.
-- `puntoArrivoSuStrada()` geocodifica l'indirizzo AL VOLO, una volta per POI e
-- per sessione, e butta via il risultato. Queste due colonne sono quella
-- geocodifica fatta una volta sola e conservata.
--
-- PERCHE' NON SI RIUSA entrance_lat/lon.
-- Sono due cose diverse, con due gradi di fiducia diversi:
--   entrance_lat/lon  = IL PORTONE RILEVATO. Un nodo `entrance=*` di OSM
--                       (qualcuno ha mappato quella porta) o il civico
--                       abbinato al perimetro dell'edificio. E' misurato.
--   address_point_*   = UN INDIRIZZO GEOCODIFICATO. Una stringa data in pasto
--                       a un geocoder, che risponde col civico se lo conosce e
--                       col centro della via se non lo conosce. E' dedotto.
-- Il trigger DEVE poterli distinguere, perche' il raggio non e' lo stesso:
-- sull'ingresso si puo' scattare a 30-40 m (guideSettings.ts DISTANCE_CONFIG,
-- ItaintaBackgroundPoiService.kt:101), su un indirizzo geocodificato no —
-- l'errore tipico di un civico interpolato e' di qualche decina di metri, e un
-- raggio stretto centrato li' farebbe scattare l'audioguida davanti alla porta
-- del vicino, o non farla scattare affatto. Se scrivessimo il punto dedotto
-- dentro entrance_lat/lon perderemmo per sempre l'informazione «questo e'
-- misurato, quest'altro e' dedotto»: dal database non si distinguono piu', e
-- la prossima passata degli ingressi veri (promuovi-ingressi.mjs, che rispetta
-- «un civico non scavalca un ingresso gia' misurato») li scavalcherebbe
-- credendoli portoni.
--
-- COSTO DELLA SCRITTURA. Sono UPDATE su shared_pois: muovono `updated_at`, e
-- il sync offline decide da li' quali aree ri-scaricare. Un pacchetto area
-- contiene testi e audio, non due float. Per questo la passata si fa UNA volta
-- sola, con tutto insieme, e non a pezzi settimana dopo settimana.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

ALTER TABLE public.shared_pois
  -- Il punto geocodificato dall'indirizzo. Gerarchia d'uso, dopo l'ingresso e
  -- prima del centroide (src/lib/puntoArrivo.ts::puntoArrivoSuStrada).
  ADD COLUMN IF NOT EXISTS address_point_lat double precision,
  ADD COLUMN IF NOT EXISTS address_point_lon double precision,
  -- Provenienza E qualita', in un valore solo:
  --   photon_casa_civico → la casa piu' vicina del dump Nominatim portava via
  --                        E numero civico. Errore tipico pochi metri: e' la
  --                        facciata, si puo' usare un raggio quasi da ingresso.
  --   photon_casa        → la casa portava solo la via. Il punto e' sulla
  --                        strada giusta ma puo' stare qualche decina di metri
  --                        piu' in la'. Buono per far agganciare OSRM alla via
  --                        del portone, MAI per stringere il raggio di trigger.
  -- Se un giorno il residuo si coprira' con un geocoder a pagamento, quello
  -- scrivera' valori suoi (`geoapify_building`, …): il campo esiste apposta.
  -- Chi legge deve poter decidere il raggio dalla qualita', non dalla presenza.
  ADD COLUMN IF NOT EXISTS address_point_source text,
  -- Il nome della via COME L'HA DETTA IL GEOCODER. Non e' ridondante rispetto
  -- ad `address`: e' la prova dell'accettazione. Il criterio di scarto dello
  -- script e' «la via combacia con quella scritta in address» (il geocoder
  -- sbaglia il civico, quasi mai la via), e senza conservare la via risposta
  -- non si puo' piu' verificare a posteriori perche' un punto fu accettato,
  -- ne' misurare quanto spesso il civico manca ma la via c'e'.
  ADD COLUMN IF NOT EXISTS address_point_street text;

COMMENT ON COLUMN public.shared_pois.address_point_lat IS
  'Indirizzo GEOCODIFICATO (dedotto), non il portone rilevato: vedi entrance_lat. Fiducia minore, raggio piu larghi.';
COMMENT ON COLUMN public.shared_pois.address_point_source IS
  'photon_casa_civico (la casa aveva via e numero) | photon_casa (solo la via).';

-- ── Indice: SI', e serve davvero ───────────────────────────────────────────
-- La passata di geocodifica pagina per `lat` (ordinare per id con un filtro va
-- in timeout su questa tabella — lezione delle 46.493 route_geometries) e
-- rifa' la stessa selezione migliaia di volte, una per pagina, per giorni.
-- Senza indice ogni pagina e' una scansione di 2,2 milioni di righe.
-- Parziale: indicizza SOLO i candidati (~1,22 M oggi, e cala a ogni passata,
-- perche' chi viene scritto esce dall'indice).
--
-- ⚠️ L'INDICE NON STA IN QUESTO FILE, di proposito (23/08/2026).
-- `CREATE INDEX CONCURRENTLY` non puo' girare dentro una transazione, e il
-- SQL Editor di Supabase avvolge SEMPRE quello che gli si da' in una
-- transazione: l'errore e' `25001: CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction block`. La versione senza CONCURRENTLY, su 2,2 milioni
-- di righe, prende un lock che ferma le SCRITTURE per tutta la costruzione —
-- ed e' esattamente il genere di operazione che il 18/08 ha messo in
-- ginocchio la produzione.
--
-- Quindi: questo file fa SOLO le colonne, ed e' sicuro nell'editor.
-- L'indice si crea DOPO, separatamente, e SOLO se serve davvero:
--
--   a) da psql o da un client che non apra una transazione:
--        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shared_pois_da_geocodificare
--          ON public.shared_pois (lat)
--          WHERE address IS NOT NULL
--            AND entrance_lat IS NULL
--            AND address_point_lat IS NULL;
--
--   b) oppure per niente: la passata pagina per `lat`, che e' gia' coperta
--      dagli indici esistenti. Senza l'indice parziale ogni pagina costa di
--      piu', ma la passata gira lo stesso — si parte senza, si guarda quanto
--      va, e lo si aggiunge solo se le pagine sono lente.
--
-- A passata finita l'indice si BUTTA: e' un indice di cantiere, e ogni indice
-- in piu' rallenta ogni INSERT su shared_pois.
--   drop index concurrently public.idx_shared_pois_da_geocodificare;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE:
--   select column_name from information_schema.columns
--    where table_name='shared_pois' and column_name like 'address_point%';
--   → 4 righe
--   select count(*) from shared_pois
--    where address is not null and entrance_lat is null and address_point_lat is null;
--   (count=planned: mai un count esatto su questa tabella)
-- ═══════════════════════════════════════════════════════════════════════════
