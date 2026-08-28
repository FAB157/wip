-- Il CHECK su guide_character ammetteva solo 'nicky'/'dante': ogni tentativo
-- di salvare un registro diverso (breve/bambini/duetto, es. 'nicky_duetto')
-- falliva in silenzio (server.ts logga l'errore ma non blocca la risposta),
-- quindi quei registri non venivano mai messi in cache e la modalità
-- "duetto" sembrava "non funzionare" — in realtà rigenerava da zero ogni
-- volta, e se l'LLM non rispettava il formato NICKY:/DANTE: il player
-- ripiegava silenziosamente su una sola voce.
ALTER TABLE public.poi_audioguides DROP CONSTRAINT IF EXISTS poi_audioguides_guide_character_check;
ALTER TABLE public.poi_audioguides ADD CONSTRAINT poi_audioguides_guide_character_check
  CHECK (guide_character IN (
    'nicky', 'dante',
    'nicky_breve', 'dante_breve',
    'nicky_bambini', 'dante_bambini',
    'nicky_duetto', 'dante_duetto'
  ));
