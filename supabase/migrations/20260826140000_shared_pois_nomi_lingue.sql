-- I NOMI DEI LUOGHI NELLE ALTRE LINGUE.
-- =====================================
-- Committente (26/08/2026): «e i nomi nelle altre lingue».
--
-- Oggi `shared_pois.name` porta UN nome solo, quello della fonte, e l'app lo
-- mostra identico a tutti e sette i pubblici che parla (IT/EN/FR/ES/DE/RU/ZH).
-- Un russo davanti al Duomo di Milano legge «Duomo di Milano»; un italiano a
-- Kyoto legge 清水寺 e non sa nemmeno pronunciarlo per chiedere indicazioni.
--
-- Overture porta i nomi tradotti nel campo `names.common` (lingua → nome), e
-- arrivano nella stessa lettura dei 9,8 GB che stiamo gia' facendo. Wikidata
-- ne ha altri, per i luoghi che hanno una voce.
--
-- UNA COLONNA JSONB E NON SETTE COLONNE. Le lingue dell'app cambiano — ne sono
-- state aggiunte tre in un mese — e ogni lingua nuova sarebbe una migrazione
-- nuova su una tabella da 2,86 milioni di righe. In piu' i nomi utili non si
-- fermano alle nostre sette: il nome giapponese di un tempio serve sul posto
-- anche a chi legge l'app in italiano.
--
-- NIENTE INDICE. Non si cerca per nome tradotto: si legge quello del POI che
-- si sta gia' mostrando. Un indice GIN su 2,86 milioni di righe costerebbe
-- spazio e scritture per una domanda che nessuno fa.
alter table public.shared_pois
  add column if not exists name_i18n jsonb;

comment on column public.shared_pois.name_i18n is
  'Nome del luogo per lingua ISO-639-1, es. {"it":"Duomo di Milano","ja":"ミラノ大聖堂"}. Fonti: Overture names.common, Wikidata. Vuoto quando la fonte non ne ha.';
