-- ═══════════════════════════════════════════════════════════════════════════
-- ATLANTE BENI CULTURALI PROTETTI — DA APPLICARE A MANO (Supabase SQL editor).
--
-- Decisione utente 15/08/2026: TUTTI i beni dei cataloghi del patrimonio
-- (Italia MiC + registri mondiali, inclusi i NON visitabili) vivono in una
-- tabella dedicata, mostrata da una chip mappa "Beni Culturali" separata.
-- shared_pois resta il motore audioguida (solo beni turistici/visitabili,
-- promossi da qui). Questa tabella è un layer informativo: niente geofencing,
-- niente audioguide, caricamento per bbox a zoom alto.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.beni_culturali (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Provenienza: chiave naturale del record nel registro d'origine.
  source text NOT NULL,               -- 'mic_catalogo' | 'merimee' | 'nrhp' | 'rijksmonumenten' | ...
  source_id text NOT NULL,            -- URI/ID nel registro
  country text NOT NULL DEFAULT 'IT', -- ISO 3166-1 alpha-2
  name text NOT NULL,
  typology text,                      -- tipologia originale del registro ("chiesa, parrocchiale", "palazzo"...)
  tier text NOT NULL CHECK (tier IN ('A','B','C')),  -- fascia filtro: A turistico, B da confermare, C protetto non visitabile
  category_wip text,                  -- categoria WIP mappata (chiese/monumenti/castelli/...) o NULL per fascia C
  -- Localizzazione: l'indirizzo arriva dal registro; le coordinate dal
  -- geocoding/match OSM (NULL finché non geocodificato → non ancora in mappa).
  address text,
  comune text,
  region text,
  lat double precision,
  lon double precision,
  geocode_source text,                -- 'osm_match' | 'photon' | 'wikidata' | NULL
  -- Collegamenti al mondo WIP:
  matched_poi_id text,                -- POI shared_pois corrispondente (bene già in mappa come POI)
  promoted_poi_id text,               -- POI creato promuovendo questo bene (import fascia A/B confermata)
  wikidata_id text,
  description text,                   -- descrizione dal registro (grounding/popup)
  attribution text NOT NULL,          -- stringa di attribuzione della licenza fonte
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

-- Fetch per bbox dalla mappa (chip a zoom alto): indice su lat/lon.
CREATE INDEX IF NOT EXISTS idx_beni_culturali_latlon
  ON public.beni_culturali (lat, lon) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_beni_culturali_matched
  ON public.beni_culturali (matched_poi_id) WHERE matched_poi_id IS NOT NULL;

-- RLS: lettura pubblica (è un layer di mappa), scrittura SOLO service key
-- (i connettori batch). Stesso pattern di poi_footprints.
ALTER TABLE public.beni_culturali ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS beni_culturali_public_read ON public.beni_culturali;
CREATE POLICY beni_culturali_public_read ON public.beni_culturali
  FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE:
--   select tablename, rowsecurity from pg_tables where tablename='beni_culturali';
--   → rowsecurity = true
--   select count(*) from pg_policies where tablename='beni_culturali';
--   → 1 (solo SELECT pubblica)
-- ═══════════════════════════════════════════════════════════════════════════
