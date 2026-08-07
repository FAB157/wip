-- Teaser multilingua: colonne per tutte le lingue dell'app.
-- Finora esistevano solo teaser_text_it e teaser_text_en: per gli utenti
-- FR/ES/DE/RU/ZH la generazione del teaser falliva (colonna inesistente)
-- e il nativo ripiegava sull'inglese o sulla frase fissa di fallback.
ALTER TABLE shared_pois
  ADD COLUMN IF NOT EXISTS teaser_text_fr text,
  ADD COLUMN IF NOT EXISTS teaser_text_es text,
  ADD COLUMN IF NOT EXISTS teaser_text_de text,
  ADD COLUMN IF NOT EXISTS teaser_text_ru text,
  ADD COLUMN IF NOT EXISTS teaser_text_zh text;
