-- ═══════════════════════════════════════════════════════════════════════════
-- LE GUIDE PREMIUM NON SI SALVAVANO: LA TABELLA NON ESISTE (30/08/2026)
--
-- Collaudo: nella tab Itinerari la sezione «Guide Premium» era sempre vuota,
-- anche subito dopo aver generato (e PAGATO) una guida. Non e' un bug della
-- schermata: `itinerary_guides` non esiste proprio sul database.
--
--   GET /rest/v1/itinerary_guides
--   → 404 {"code":"PGRST205","message":"Could not find the table
--          'public.itinerary_guides' in the schema cache"}
--
-- (Provate anche premium_guides, guides, user_guides: tutte 404. Gli
-- itinerari invece ci sono e restano: user_itineraries, 93 righe.)
--
-- Il codice la usa in NOVE punti, e ogni volta fallisce in silenzio dentro un
-- `.catch()` o un `console.warn`:
--   • server.ts  /api/premium-guide/generate         → salvataggio finale
--   • server.ts  /api/premium-guide/generate-stream  → salvataggio finale
--   • server.ts  controllo cache prima di addebitare (una guida gia' pagata
--     veniva quindi RIPAGATA: la cache non poteva mai colpire)
--   • server.ts  pgLoadGuideRow → regenerate-day, epub, translate: tutti
--     rispondono «guida non trovata» anche a chi l'ha appena comprata
--   • src/services/premiumGuideService.ts  getCachedGuide, salvataggio pdf_url
--   • src/components/PlanScreen.tsx        fetchSavedPremiumGuides (l'archivio)
--
-- CHIAVE PRIMARIA = itinerary_hash. Le scritture usano
-- `Prefer: resolution=merge-duplicates` SENZA parametro on_conflict: in quel
-- caso PostgREST risolve il conflitto sulla CHIAVE PRIMARIA. Con un `id`
-- generato la fusione non aggancerebbe mai nulla e ogni rigenerazione
-- lascerebbe una riga in piu'. Tutte le letture del codice sono per
-- itinerary_hash, quindi e' anche la chiave giusta di lettura.
--
-- IDEMPOTENTE: si puo' applicare piu' volte.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.itinerary_guides (
  itinerary_hash   text PRIMARY KEY,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  content_data     jsonb,
  media_manifest   jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_itinerary jsonb,
  stile_guida      text,
  -- Il codice legge sempre `status=eq.completed`: e' il valore che marca una
  -- guida consegnata per intero. Le altre rotte non ne scrivono altri.
  status           text NOT NULL DEFAULT 'completed',
  pdf_url          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- L'archivio ordina per data decrescente filtrando sull'utente.
CREATE INDEX IF NOT EXISTS itinerary_guides_user_created_idx
  ON public.itinerary_guides (user_id, created_at DESC);

ALTER TABLE public.itinerary_guides ENABLE ROW LEVEL SECURITY;

-- Ognuno vede SOLO le proprie guide (le legge il client con la chiave
-- pubblicabile: senza policy la tabella resterebbe vuota anche esistendo).
DROP POLICY IF EXISTS "guide: lettura del proprietario" ON public.itinerary_guides;
CREATE POLICY "guide: lettura del proprietario"
  ON public.itinerary_guides FOR SELECT
  USING (auth.uid() = user_id);

-- Nessuna policy di INSERT/UPDATE per il client: le guide le scrive SOLO il
-- server con la service role (che salta la RLS), dopo aver incassato i
-- crediti. Se scrivesse il client, chiunque potrebbe inserirsi una guida
-- gratis e farla poi risultare «gia' pagata» al controllo di cache.

COMMENT ON TABLE public.itinerary_guides IS
  'Guide d''autore generate e pagate. Chiave: itinerary_hash. Scrive solo il server (service role); il proprietario legge.';
