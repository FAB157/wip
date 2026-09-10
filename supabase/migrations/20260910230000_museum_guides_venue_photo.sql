-- LA FOTO DEL LUOGO nelle guide dei musei (10/09/2026).
--
-- Le OPERE avevano già la loro foto (Wikidata P18, legata al singolo dipinto);
-- il museo no, e nell'elenco «qui vicino» restava un simbolo uguale per tutti.
-- Il committente ha chiesto la foto nel cerchio accanto al nome «di tutti i
-- musei e tutte le opere»: questa colonna tiene quella del luogo.
--
-- Si scrive UNA sola volta, alla generazione della guida, da due fonti che
-- legano l'immagine a QUESTO luogo e non a una parola chiave:
--   1. Wikidata P18 dell'entità del museo;
--   2. in mancanza, `shared_pois.image_url` del POI collegato.
-- Se nessuna delle due esiste la colonna resta NULL e l'elenco mostra il
-- simbolo: nessuna foto è meglio della foto di un altro posto.
--
-- L'URL si conserva nella forma canonica di Commons (Special:FilePath senza
-- larghezza): le due misure servite all'app — 900 px per la testata, 160 per
-- il cerchio — si calcolano in lettura, così cambiare misura non impone di
-- riscrivere la tabella.

ALTER TABLE public.museum_guides
  ADD COLUMN IF NOT EXISTS venue_photo text;

COMMENT ON COLUMN public.museum_guides.venue_photo IS
  'Foto del luogo (Wikidata P18 del museo, o image_url del POI). URL canonico: le misure si derivano in lettura. NULL = nessuna fonte la dichiara, si mostra il simbolo.';
