-- ═══════════════════════════════════════════════════════════════════════════
-- «LEGGI DI PIÙ» SU QUALUNQUE POI — DA APPLICARE A MANO (SQL editor).
--
-- PERCHE'. Sui beni vincolati il pin porta gia' alla scheda del catalogo
-- nazionale (`beni_culturali.catalog_url`, 185.825 link scritti fra Italia e
-- Polonia, gli altri paesi in corso). La stessa cosa vale per i POI normali,
-- e con una fonte migliore: l'ARTICOLO DI WIKIPEDIA. Per un visitatore
-- davanti a un tempio o a un palazzo, l'articolo racconta il posto, ha le
-- fotografie e le date, ed esiste nella sua lingua — vale piu' di qualunque
-- scheda catastale.
--
-- QUALSIASI PUNTO, DI QUALSIASI CATEGORIA (committente, 26/08/2026). Non
-- solo musei e monumenti: se un ponte, una stazione storica, un mercato, una
-- montagna o un locale hanno un articolo, quel collegamento vale. La regola
-- che resta invariata e' l'ALTRA: si scrive solo quando siamo certi che
-- l'articolo parli di QUEL punto. Un articolo sbagliato e' peggio di nessun
-- articolo, come una foto sbagliata.
--
-- COME SI RIEMPIE. Due strade, in ordine di certezza:
--   1. il POI ha gia' il codice Wikidata (`shared_pois.wikidata`, 414.009
--      POI di ogni categoria): l'articolo si ricava dall'entita', ed e'
--      esatto in qualunque alfabeto;
--   2. altrimenti si cerca per POSIZIONE (la ricerca geografica di Wikipedia)
--      e si accetta solo se il titolo dell'articolo combacia col nome del
--      POI. Vicino non basta: in un centro storico entro 200 metri ci sono
--      venti articoli, e prendere il piu' vicino significa raccontare un
--      altro monumento.
--
-- SI APRE DENTRO L'APP. Il link passa da src/lib/apriScheda.ts, che su
-- Android e iOS usa la scheda interna (Chrome Custom Tab /
-- SFSafariViewController): l'utente non esce dall'app e l'audioguida non si
-- interrompe.
--
-- NIENTE ATTRIBUZIONE QUI: un collegamento a Wikipedia non e' una
-- riproduzione, e non richiede licenza. La citazione serve quando si copia il
-- TESTO — e quella la porta gia' `enrichment_source`.
-- ═══════════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';

ALTER TABLE public.shared_pois
  -- L'indirizzo completo dell'articolo, nella lingua scelta:
  -- "https://ja.wikipedia.org/wiki/清水寺". Si conserva l'URL intero e non
  -- (lingua, titolo) separati, perche' ricomporlo a ogni schermo e' un modo
  -- per sbagliarlo in un posto solo e non accorgersene.
  ADD COLUMN IF NOT EXISTS wikipedia_url text;

-- Indice parziale sui soli POI che ce l'hanno: le domande utili sono «quanti
-- ne mancano» e «dammi quelli collegati», e su 2,86 milioni di righe un
-- indice pieno costerebbe spazio per niente.
CREATE INDEX IF NOT EXISTS idx_shared_pois_con_wikipedia
  ON public.shared_pois (country)
  WHERE wikipedia_url IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA — incollare dopo:
--
--   select count(*) from information_schema.columns
--   where table_schema='public' and table_name='shared_pois'
--     and column_name = 'wikipedia_url';
--   → 1
-- ═══════════════════════════════════════════════════════════════════════════
