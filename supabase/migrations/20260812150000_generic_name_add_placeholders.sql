-- ═══════════════════════════════════════════════════════════════════════════
-- ESTENDE is_generic_poi_name con i placeholder "Punto di interesse" & co.
-- (DA APPLICARE A MANO — Supabase SQL Editor)
--
-- Scoperta 12/08/2026: la migration 20260812130000 nascondeva "luogo d'interesse"
-- ma NON "Punto di interesse" — che è il nome del blocco più grosso (~369k righe
-- del vecchio import CSV, source='csv' category='information'). Quella frase non
-- era nell'elenco della funzione → i POI restavano status='verified',
-- is_hidden=false = VISIBILI sulla mappa.
--
-- Attenzione: NON tutto csv+information è spazzatura (ci sono centri visitatori
-- con nome reale: "Visit Scotland iCentre"…). Qui NON si tocca la categoria: si
-- aggiungono solo le FRASI-placeholder esatte, che nessun POI reale porta.
--
-- Le RPC nearby_pois / get_utility_pois chiamano questa funzione a runtime:
-- sostituirla basta, non serve ricrearle.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_generic_poi_name(n text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT
    n IS NULL
    OR length(trim(n)) < 2
    OR lower(trim(n)) IN (
      'parcheggio','parco','giardino','giardinetti','giardinetto','villa','parking',
      'park','garden','playground','posteggio','sosta','stazionamento',
      'luogo d''interesse','luogo d interesse','area camper','area sosta',
      'area di sosta','sito','punto',
      -- placeholder del vecchio import CSV/OSM (nessun contenuto):
      'punto di interesse','punto d''interesse','punto d interesse',
      'luogo di interesse','point of interest','points of interest'
    )
    OR lower(trim(n)) ~* '^(parcheggio|posteggio|parking|park)( (pubblic[oi]|comunal[ei]|gratuit[oi]|privat[oi]|riservat[oi]|clienti|coperto|scoperto|cittadin[oi]|auto|camper|moto|disabili|residenti|gratis|free|public|private|custodito|interrato|multipiano|a|di|per|e|pagamento))+$'
$$;

-- Verifica veloce (deve dare tutti true tranne gli ultimi due):
-- select is_generic_poi_name('Punto di interesse')  as t1,  -- true
--        is_generic_poi_name('Punto di Interesse')  as t2,  -- true (case-insensitive)
--        is_generic_poi_name('luogo di interesse')  as t3,  -- true
--        is_generic_poi_name('Visit Scotland iCentre') as f1,  -- false
--        is_generic_poi_name('Duomo di Milano')      as f2;    -- false
