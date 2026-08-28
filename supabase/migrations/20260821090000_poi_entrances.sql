-- ═══════════════════════════════════════════════════════════════════════════
-- INGRESSI DEI POI — tabella affiancata. DA APPLICARE A MANO (SQL editor).
--
-- PERCHE' UNA TABELLA E NON DUE COLONNE SU shared_pois.
-- shared_pois ha 2,2 milioni di righe e un trigger che aggiorna `updated_at`
-- a ogni UPDATE. Quel campo NON e' decorativo: il sync offline decide da li'
-- quali aree ri-scaricare, e un pacchetto area contiene testi e audio, non due
-- float. Toccare due milioni di righe per registrare da dove viene un punto
-- significherebbe far ri-scaricare mezzo mondo a chi ha i pacchetti offline.
-- Qui invece si INSERISCE in una tabella nuova: nessun UPDATE, nessun trigger,
-- nessun `updated_at` mosso. Stesso schema di poi_footprints (20260815100000).
--
-- COSA CI VA DENTRO: TUTTI gli abbinamenti trovati, anche quelli che non useremo.
-- Un ingresso a 24 metri con dodici candidati intorno non e' un ingresso, e'
-- un tiro a indovinare — ma vogliamo poterlo rileggere, non scoprirlo di nuovo
-- fra sei mesi rifacendo l'estrazione dal planet OSM. La riga si scrive sempre;
-- e' la PROMOZIONE su shared_pois che e' selettiva (colonna `promosso`).
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.poi_entrances (
  poi_id text PRIMARY KEY REFERENCES public.shared_pois(id) ON DELETE CASCADE,

  lat double precision NOT NULL,
  lon double precision NOT NULL,

  -- Vocabolario GIA' ESISTENTE nel client: src/lib/tour/tourState.ts::LivelloIngresso.
  --   dichiarato = nodo `entrance=*` di OSM. Chi ha mappato l'edificio ha detto
  --                "la porta e' qui". Quando c'e', e' la risposta e non si discute.
  --   civico     = numero civico piu' vicino. Sta sulla facciata (rapporto mediano
  --                0,96 fra distanza dal civico e distanza dal centroide), quindi
  --                in pratica e' il portone — ma "in pratica", non "per certo".
  --   indirizzo  = solo la via, senza un punto: non sposta niente, serve a scrivere
  --                "Via Roma 12" nella scheda e nell'istruzione finale del navigatore.
  livello text NOT NULL CHECK (livello IN ('dichiarato', 'civico', 'indirizzo')),

  -- ── Le misure che dicono se fidarsi ──────────────────────────────────────
  -- distanza_m: quanto ci si sposta dal centroide. Sotto i 3 m non vale la pena.
  distanza_m real,
  -- candidati: quanti punti c'erano entro la soglia. 1 = certo. 12 = si tira a
  --   indovinare, e allora e' meglio restare al centroide che sbagliare porta.
  candidati integer,
  -- margine_m: distanza fra il primo e il secondo candidato. Sotto i 2 metri e'
  --   un testa a testa: due porte equivalenti, la scelta e' arbitraria.
  margine_m real,
  -- rango: qualita' del tag OSM. 0 = entrance=main, 1 = yes/public/customers,
  --   2 = secondary/staircase/entrance, 3 = ripiego (service, garage...).
  --   `staircase` NON e' scartato: in Germania, Polonia e nei paesi nordici e'
  --   la porta di strada, e vale 557.996 nodi in Europa.
  rango smallint,

  -- ── L'indirizzo, che e' meta' del punto ──────────────────────────────────
  -- "Ti porto in Via Roma 12" vale quanto portarti sulle coordinate giuste:
  -- l'ultima istruzione del navigatore e la riga nella scheda escono da qui.
  street text,
  housenumber text,
  city text,
  postcode text,

  -- ── Provenienza e stato ──────────────────────────────────────────────────
  fonte text NOT NULL DEFAULT 'osm',
  -- promosso: la riga e' stata copiata su shared_pois.entrance_lat/lon.
  -- Serve a sapere cosa e' gia' in produzione senza rileggere 2,2 M di POI, e a
  -- poter tornare indietro: la riga qui resta anche se la promozione si annulla.
  promosso boolean NOT NULL DEFAULT false,
  promosso_il timestamptz,
  creato_il timestamptz NOT NULL DEFAULT now()
);

-- La promozione lavora per livello e per stato: senza indice sarebbe una
-- scansione completa a ogni blocco.
CREATE INDEX IF NOT EXISTS idx_poi_entrances_da_promuovere
  ON public.poi_entrances (livello, promosso);

-- RLS: lettura pubblica (sono dati OSM, gia' pubblici, e la scheda POI puo'
-- mostrare l'indirizzo), scrittura SOLO service key — gli script di apply
-- passano dal server, mai dal client. Stesso pattern di poi_footprints.
ALTER TABLE public.poi_entrances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS poi_entrances_public_read ON public.poi_entrances;
CREATE POLICY poi_entrances_public_read ON public.poi_entrances
  FOR SELECT USING (true);
-- Nessuna policy INSERT/UPDATE/DELETE: bloccate per i client.

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE:
--   select tablename, rowsecurity from pg_tables where tablename='poi_entrances';
--   → rowsecurity = true
--   select count(*) from pg_policies where tablename='poi_entrances';
--   → 1 (solo la SELECT pubblica)
--   insert into public.poi_entrances (poi_id, lat, lon, livello)
--     values ('__prova__', 0, 0, 'dichiarato');
--   → deve FALLIRE con violazione di chiave esterna (shared_pois non ha '__prova__'):
--     e' la prova che il vincolo verso shared_pois e' attivo.
-- ═══════════════════════════════════════════════════════════════════════════
