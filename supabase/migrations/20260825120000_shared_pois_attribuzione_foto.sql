-- ═══════════════════════════════════════════════════════════════════════════
-- CHI HA SCATTATO LA FOTO, E CON CHE LICENZA — DA APPLICARE A MANO.
--
-- IL PROBLEMA (visto il 25/08/2026, segnalato da un'altra sessione).
-- `shared_pois.image_url` esiste da sempre ed e' popolata per ~450.000 POI, ma
-- non c'e' NESSUNA colonna che dica da dove viene quella fotografia, chi l'ha
-- scattata e a quali condizioni si puo' usare. Non e' una mancanza estetica:
-- la stragrande maggioranza di quelle immagini viene da Wikimedia Commons, e
-- su Commons la licenza piu' diffusa e' CC BY-SA — che l'uso commerciale lo
-- permette, ma A CONDIZIONE di citare l'autore. WIP vende crediti, quindi e'
-- uso commerciale a tutti gli effetti: senza l'attribuzione quelle foto non
-- sono utilizzabili, e non e' una sfumatura formale — e' la condizione stessa
-- che le rende lecite.
--
-- Le colonne ci sono gia' su `beni_culturali` (un'altra sessione le ha
-- aggiunte il 24/08): qui si usano gli STESSI nomi e gli STESSI valori, per
-- non avere due modi di dire la stessa cosa nella stessa banca dati.
--
--   image_source      'wikimedia_commons'      foto presa da Commons
--                     'wikimedia_commons_geo'  trovata per coordinate
--                     'wikidata_p18'           immagine scelta dell'entita'
--                     (chi aggiunge una fonte aggiunge un valore, non una colonna)
--   image_attribution la frase gia' pronta da mostrare sotto la foto, nella
--                     forma usata su beni_culturali:
--                       «Foto: Araceli Merino (CC BY-SA 3.0) via Wikimedia Commons»
--                     Si conserva la FRASE e non i pezzi perche' e' quella che
--                     va mostrata, e ricomporla ogni volta e' un modo per
--                     sbagliarla.
--   image_license     il nome corto e leggibile a macchina: 'CC BY-SA 4.0',
--                     'CC0', 'PD'. Serve per POTER CERCARE: senza, trovare
--                     tutte le foto non commerciali vuol dire leggere una
--                     frase in linguaggio naturale su mezzo milione di righe.
--
-- NESSUN DATO SI PERDE E NIENTE SI ROMPE: sono tre colonne nuove, nullable,
-- e chi legge oggi non le conosce e le ignora.
--
-- ⚠️ DOPO QUESTA MIGRATION VA FATTA LA PASSATA:
--      node scratch/attribuzione-foto-commons.mjs            (prova a vuoto)
--      node scratch/attribuzione-foto-commons.mjs --write
--    Legge i registri locali delle passate di ieri e oggi, chiede a Commons
--    autore e licenza (50 file per chiamata) e riempie queste colonne. Le foto
--    con licenza NON riusabile commercialmente (NC, ND) le TOGLIE: e' meglio
--    un POI senza foto che un POI con una foto che non possiamo mostrare.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

ALTER TABLE public.shared_pois
  ADD COLUMN IF NOT EXISTS image_source      text,
  ADD COLUMN IF NOT EXISTS image_attribution text,
  ADD COLUMN IF NOT EXISTS image_license     text;

COMMENT ON COLUMN public.shared_pois.image_source IS
  'Provenienza della foto: wikimedia_commons | wikimedia_commons_geo | wikidata_p18 | ...';
COMMENT ON COLUMN public.shared_pois.image_attribution IS
  'Frase pronta da mostrare sotto la foto. CC BY-SA obbliga a citare l''autore: senza questa, la foto non e'' utilizzabile commercialmente.';
COMMENT ON COLUMN public.shared_pois.image_license IS
  'Nome corto della licenza (CC BY-SA 4.0, CC0, PD): serve a poter CERCARE le foto non riusabili senza leggere una frase.';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA (subito dopo):
--   select column_name from information_schema.columns
--    where table_name='shared_pois' and column_name like 'image_%';
--   → image_url, image_source, image_attribution, image_license
--
-- E DOPO LA PASSATA, per vedere quanto resta scoperto:
--   select count(*) from shared_pois
--    where image_url is not null and image_attribution is null;
--   (count=planned: mai un count esatto su questa tabella)
--   Il residuo sono le ~416.000 foto scritte PRIMA di oggi, che nessun
--   registro locale copre: per quelle serve una passata a se', che rilegga
--   l'autore partendo dall'URL. Decisione dell'utente, non di questo file.
-- ═══════════════════════════════════════════════════════════════════════════
