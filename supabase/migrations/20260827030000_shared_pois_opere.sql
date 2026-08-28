-- LE OPERE GIRATE O AMBIENTATE IN UN LUOGO.
-- =========================================
-- Committente (27/08/2026): «attacchiamo l'opera al POI, ma creiamo nella
-- categoria tematici un POI specifico che da' informazioni solo sul film con
-- le scene e tutti i dettagli».
--
-- Sono due cose diverse e ne servono due:
--   • QUESTA COLONNA sta sul luogo che gia' abbiamo — Marina Corricella resta
--     un porto, e in fondo alla sua scheda compare «qui hanno girato Il
--     talento di Mr. Ripley». L'audioguida del porto puo' citarlo dentro il
--     racconto, non accanto.
--   • IL POI DEDICATO (category='cinema') e' un oggetto separato, alle stesse
--     coordinate, che parla del FILM: le scene, il regista, l'anno. Sta nei
--     verticali tematici, che per decisione del 22/08 si vedono sulla mappa e
--     negli itinerari ma NON fanno partire la voce da soli.
--
-- FORMA: un elenco JSON, non una colonna per opera. In un luogo si gira piu'
-- di una volta — a Matera hanno girato decine di film — e una colonna per
-- opera vorrebbe una migrazione a ogni film nuovo.
--
-- NIENTE INDICE, per ora. Non si cerca «tutti i luoghi dove hanno girato X»:
-- si legge l'elenco del POI che si sta gia' mostrando. Se un domani servisse
-- quella ricerca, un indice GIN si aggiunge in un minuto; aggiungerlo adesso
-- costerebbe spazio e scritture su 4,4 milioni di righe per una domanda che
-- nessuno fa ancora.
alter table public.shared_pois
  add column if not exists works_json jsonb;

comment on column public.shared_pois.works_json is
  'Opere girate o ambientate qui. Elenco di oggetti: {qid, titolo, anno, tipo (film|serie|libro), ruolo (riprese|ambientazione), regista, autore, wikipedia, immagine}. Fonte: Wikidata P915/P840/P1441 (CC0). Vuoto per la stragrande maggioranza dei POI.';
