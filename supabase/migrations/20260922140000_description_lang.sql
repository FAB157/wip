-- LINGUA DELLA DESCRIZIONE (22/09/2026, segnalazione del committente: pin e
-- schede mostrano descrizioni/audioguide nella lingua SBAGLIATA per l'utente).
--
-- Causa: shared_pois.description_short/description_long/description_ai sono
-- colonne UNICHE per POI, senza lingua. La prima volta che qualcuno arricchisce
-- un luogo (un utente in una lingua qualsiasi, o uno script di sfondo) quel
-- testo resta scritto per sempre — il guard "scrivi solo se vuoto" impedisce
-- a un utente successivo di un'altra lingua di correggerlo. /api/poi/details
-- aveva già una traduzione al volo, ma indovinava "probabilmente italiano" con
-- un'euristica sul testo (sembraItaliano); ora la lingua vera si registra qui,
-- e la traduzione scatta con certezza ogni volta che non combacia.
--
-- Colonna nullable: le righe già scritte restano NULL (comportamento di prima,
-- corretto dall'euristica esistente come fallback); solo le nuove scritture di
-- /api/poi/enrich e /api/poi/enrich-stream la valorizzano da qui in poi.
ALTER TABLE public.shared_pois
  ADD COLUMN IF NOT EXISTS description_lang text;

COMMENT ON COLUMN public.shared_pois.description_lang IS
  'Lingua (2 lettere, es. it/en/es) in cui description_short/description_long/description_ai sono state scritte. NULL = non registrata (righe pre-22/09/2026), si ricade sull''euristica sembraItaliano().';
