-- ═══════════════════════════════════════════════════════════════════════════
-- LE FOTO DEI BENI VINCOLATI — DA APPLICARE A MANO (SQL editor).
--
-- PERCHE'. `beni_culturali` (1,78 M di righe) non ha mai avuto un posto dove
-- mettere una fotografia: l'unico modo di dare un'immagine a un bene era
-- promuoverlo a POI e scriverla su `shared_pois`. Ma i beni dell'atlante NON
-- sono POI — restano scheda e mappa — e una scheda senza foto e' una riga di
-- testo su un muro bianco.
--
-- DA DOVE VENGONO LE FOTO (misurato il 24/08/2026):
--   • Wikidata P18 → Wikimedia Commons: ~825.000 beni ne hanno una, e la
--     licenza (CC BY-SA o pubblico dominio) permette l'uso commerciale con
--     l'attribuzione. Regno Unito 59%, Germania 89%, Svezia 70%, Stati Uniti
--     99%, Spagna 80%, Ucraina 50%, Armenia 60%.
--   • NON dal catalogo italiano: SIGECweb pubblica 146.000 foto dei beni
--     italiani, ma con licenza CC BY-NC-SA — "NC" vuol dire niente uso
--     commerciale, e WIP vende crediti. Stessa cosa per i cataloghi
--     regionali lombardi. Quelle foto si possono solo LINKARE, non mostrare.
--     Per questo esiste `image_source`: si deve sempre poter dire da dove
--     viene un'immagine, e togliere in blocco quelle di una fonte se la
--     licenza cambia.
--
-- L'ATTRIBUZIONE NON E' UN OPTIONAL. CC BY-SA obbliga a nominare l'autore e
-- la licenza. `image_attribution` la conserva gia' pronta da mostrare; se e'
-- vuota, l'immagine NON va pubblicata — meglio nessuna foto che una foto
-- senza credito, che e' una violazione di licenza oltre che una scortesia
-- verso chi l'ha scattata.
-- ═══════════════════════════════════════════════════════════════════════════

set lock_timeout = '5s';

ALTER TABLE public.beni_culturali
  -- L'indirizzo dell'immagine da mostrare (per Commons: Special:FilePath, che
  -- regge il ridimensionamento con ?width=).
  ADD COLUMN IF NOT EXISTS image_url text,
  -- Il nome del file su Commons: serve a ricostruire la pagina dei crediti
  -- e a chiedere autore e licenza all'API senza rifare la ricerca.
  ADD COLUMN IF NOT EXISTS image_file text,
  -- 'wikimedia_commons' | 'arco' | 'sirbec' | ... : la provenienza, per
  -- poter sfoltire per fonte quando una licenza non va piu' bene.
  ADD COLUMN IF NOT EXISTS image_source text,
  -- "Foto: <autore> (CC BY-SA 4.0) via Wikimedia Commons" — pronta da
  -- stampare sotto l'immagine. Nulla = non pubblicabile.
  ADD COLUMN IF NOT EXISTS image_attribution text,
  -- DOVE NON SI PUO' MOSTRARE, SI PUO' SEMPRE PORTARE (committente,
  -- 24/08/2026: «dove non puoi usare foto crea link — ma priorita' alla
  -- foto»). La scheda pubblica del catalogo nazionale: per l'Italia
  -- catalogo.beniculturali.it, per la Polonia zabytek.pl, e cosi' via.
  -- Linkare e' sempre lecito, anche quando l'immagine non e' riusabile: il
  -- bene senza foto smette di essere un vicolo cieco e diventa una porta.
  -- La foto viene PRIMA: il link e' cio' che resta quando la foto non c'e'
  -- o non si puo' usare.
  ADD COLUMN IF NOT EXISTS catalog_url text;

-- Indice parziale sui soli beni CON foto: le interrogazioni utili sono
-- "dammi quelli che hanno un'immagine" e "quanti ne mancano ancora", e su
-- 1,78 M di righe un indice pieno costerebbe spazio per niente.
CREATE INDEX IF NOT EXISTS idx_beni_culturali_con_foto
  ON public.beni_culturali (country)
  WHERE image_url IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA — incollare dopo:
--
--   select count(*) from information_schema.columns
--   where table_schema='public' and table_name='beni_culturali'
--     and column_name in ('image_url','image_file','image_source','image_attribution','catalog_url');
--   → 5
-- ═══════════════════════════════════════════════════════════════════════════
