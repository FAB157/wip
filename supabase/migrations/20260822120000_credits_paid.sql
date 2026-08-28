-- Garanzia pioggia: il rimborso deve basarsi sui crediti REALMENTE pagati
-- per l'itinerario, non sul listino del momento (che un admin può cambiare
-- dopo l'acquisto → conio di crediti). /api/groq/itinerary-stream emette a
-- fine stream un evento `billing` {credits_paid, credits_paid_earned}; il
-- client lo copia qui quando salva l'itinerario. Finché la riga non ha il
-- valore, /api/rain-guarantee/claim ripiega sul registro api_cache
-- (itin_paid_<user>_<ts>) e poi su credit_transactions; se non trova nulla
-- rimborsa 0.

ALTER TABLE public.user_itineraries
  ADD COLUMN IF NOT EXISTS credits_paid integer,
  ADD COLUMN IF NOT EXISTS credits_paid_earned integer;

COMMENT ON COLUMN public.user_itineraries.credits_paid IS
  'Crediti effettivamente addebitati per la generazione (conguaglio incluso). NULL = sconosciuto.';
COMMENT ON COLUMN public.user_itineraries.credits_paid_earned IS
  'Quota di credits_paid uscita dal portafoglio earned (il resto da purchased): il rimborso torna sullo stesso portafoglio.';
