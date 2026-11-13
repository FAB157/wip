-- «NON LA TROVO»: le tappe che i visitatori saltano (10/09/2026).
--
-- Chi è dentro il museo sa cose che nessun controllo automatico può sapere:
-- che la Sala 12 è chiusa per allestimento, che il quadro è partito per una
-- mostra a Berlino, che davanti c'è un'ora di fila. Quando qualcuno tocca
-- «Non la trovo» ce lo sta dicendo dal posto, mentre ci è davanti.
--
-- Un salto singolo non significa niente — magari aveva fretta. Dieci salti
-- sulla stessa opera sono un fatto: quella tappa è sbagliata, o l'opera non
-- è più lì. Il conteggio serve a questo, ed è la ragione per cui la colonna
-- sta sulla guida e non su una tabella di eventi: interessa il totale per
-- tappa, non chi l'ha saltata.
--
-- Nessun dato personale: si contano i salti, non le persone.

ALTER TABLE public.museum_guides
  ADD COLUMN IF NOT EXISTS stop_skips jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.museum_guides.stop_skips IS
  'Quante volte ogni tappa è stata saltata da chi era sul posto: {"nome opera": n}. Un numero alto = tappa da rivedere (sala chiusa, opera in prestito, tappa sbagliata).';

-- L'incremento in una sola istruzione: due visitatori che saltano la stessa
-- opera nello stesso momento non si sovrascrivono a vicenda, come farebbe un
-- leggi-modifica-riscrivi dal server.
CREATE OR REPLACE FUNCTION public.increment_museum_stop_skip(
  p_venue_key text,
  p_stop_name text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.museum_guides
     SET stop_skips = jsonb_set(
           stop_skips,
           ARRAY[p_stop_name],
           to_jsonb(COALESCE((stop_skips ->> p_stop_name)::int, 0) + 1),
           true
         )
   WHERE venue_key = p_venue_key;
$$;

COMMENT ON FUNCTION public.increment_museum_stop_skip IS
  'Somma 1 al contatore dei salti di una tappa, su tutte le lingue di quel luogo. Atomica: niente corse fra visitatori simultanei.';
