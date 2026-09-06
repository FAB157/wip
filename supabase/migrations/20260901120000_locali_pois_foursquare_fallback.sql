-- Fallback Foursquare (solo campi Pro gratuiti: nome/indirizzo/telefono/sito)
-- per la scheda del locale (/api/locali/scheda), usato quando TripAdvisor non
-- trova il locale o ha esaurito la quota mensile. Niente voto/prezzo/foto:
-- quei campi sono Premium su Foursquare (mai gratis, si paga dalla prima
-- chiamata) e restano fuori per rispettare "solo API gratuite" su questa rotta.
alter table locali_pois
  add column if not exists fsq_id text,
  add column if not exists fsq_updated_at timestamptz;
