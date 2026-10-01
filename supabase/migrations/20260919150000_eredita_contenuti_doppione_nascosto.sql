-- QUANDO SI NASCONDE UN DOPPIONE, FOTO E TESTO PASSANO ALLA RIGA CHE RESTA
-- (19/09/2026, committente: «avevo molte piu` foto giuste… ripristina ed evita
-- che risucceda», «anche le descrizioni»).
--
-- Misurato quel giorno: ~140.000 righe NASCOSTE di shared_pois con una foto
-- (quasi tutte source='csv', nascoste in massa il 10/09 come needs_revision),
-- mentre la gemella VISIBILE dello stesso luogo era senza. Stadio dei Marmi di
-- Carrara: la riga visibile vuota, la foto giusta sul doppione nascosto. Chi ha
-- nascosto non ha guardato cosa portava via — ed e` la terza volta (luglio,
-- 07/09, 10/09). Una regola scritta non basta: la garanzia sta nel database,
-- e vale per chiunque scriva (app, script, droplet, SQL a mano).
--
-- Regola, volutamente SEVERA: stesso luogo = entro 40 m E stesso nome
-- normalizzato (minuscole, senza il disambiguante fra parentesi, senza
-- punteggiatura). Si riempie SOLO cio` che sulla riga visibile manca; mai una
-- sovrascrittura, mai una riga bloccata. FAIL-OPEN: qualunque errore qui dentro
-- non deve mai far fallire l'UPDATE che nasconde la riga.
--
-- Costo: il trigger parte solo quando is_hidden passa a TRUE e la riga ha
-- qualcosa da lasciare (clausola WHEN), e fa UNA ricerca sull'indice spaziale.

CREATE OR REPLACE FUNCTION public.poi_nome_normalizzato(n text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(regexp_replace(coalesce(n, ''), '\s*\([^)]*\)', '', 'g'), '[^[:alnum:]]+', '', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.eredita_contenuti_doppione_nascosto()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  erede text;
BEGIN
  BEGIN
    -- `location` (geography), NON `geom`: l'indice GiST sta li` (idx_shared_pois_location,
    -- verificato il 19/09/2026). Su `geom` sarebbe una scansione intera per ogni riga.
    IF length(public.poi_nome_normalizzato(NEW.name)) < 4 OR NEW.location IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT v.id INTO erede
    FROM public.shared_pois v
    WHERE v.id <> NEW.id
      AND v.is_hidden IS NOT TRUE
      AND coalesce(v.is_locked, false) = false
      AND ST_DWithin(v.location, NEW.location, 40)
      AND public.poi_nome_normalizzato(v.name) = public.poi_nome_normalizzato(NEW.name)
    ORDER BY ST_Distance(v.location, NEW.location)
    LIMIT 1;

    IF erede IS NULL THEN
      RETURN NEW;
    END IF;

    UPDATE public.shared_pois v SET
      image_url         = CASE WHEN coalesce(v.image_url, '') = '' AND coalesce(NEW.image_url, '') <> '' AND NEW.image_url NOT LIKE '%source.unsplash.com%' THEN NEW.image_url ELSE v.image_url END,
      photo_url         = CASE WHEN coalesce(v.image_url, '') = '' AND coalesce(NEW.image_url, '') <> '' AND NEW.image_url NOT LIKE '%source.unsplash.com%' THEN coalesce(NEW.photo_url, NEW.image_url) ELSE v.photo_url END,
      image_source      = CASE WHEN coalesce(v.image_url, '') = '' AND coalesce(NEW.image_url, '') <> '' THEN NEW.image_source ELSE v.image_source END,
      image_attribution = CASE WHEN coalesce(v.image_url, '') = '' AND coalesce(NEW.image_url, '') <> '' THEN NEW.image_attribution ELSE v.image_attribution END,
      image_license     = CASE WHEN coalesce(v.image_url, '') = '' AND coalesce(NEW.image_url, '') <> '' THEN NEW.image_license ELSE v.image_license END,
      description_short = CASE WHEN coalesce(v.description_short, '') = '' THEN NEW.description_short ELSE v.description_short END,
      description_long  = CASE WHEN coalesce(v.description_long, '') = '' THEN NEW.description_long ELSE v.description_long END,
      description_ai    = CASE WHEN coalesce(v.description_ai, '') = '' THEN NEW.description_ai ELSE v.description_ai END,
      scritto_da        = 'eredita-doppione-nascosto'
    WHERE v.id = erede
      AND ( (coalesce(v.image_url, '') = '' AND coalesce(NEW.image_url, '') <> '')
         OR (coalesce(v.description_short, '') = '' AND coalesce(NEW.description_short, '') <> '')
         OR (coalesce(v.description_long, '') = '' AND coalesce(NEW.description_long, '') <> '')
         OR (coalesce(v.description_ai, '') = '' AND coalesce(NEW.description_ai, '') <> '') );
  EXCEPTION WHEN OTHERS THEN
    -- fail-open: nascondere una riga non deve mai fallire per colpa di questo trigger
    RAISE WARNING 'eredita_contenuti_doppione_nascosto: % (riga %)', SQLERRM, NEW.id;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_eredita_doppione_nascosto ON public.shared_pois;
CREATE TRIGGER tr_eredita_doppione_nascosto
AFTER UPDATE OF is_hidden ON public.shared_pois
FOR EACH ROW
WHEN (NEW.is_hidden IS TRUE AND OLD.is_hidden IS NOT TRUE
      AND (coalesce(NEW.image_url, '') <> '' OR coalesce(NEW.description_short, '') <> ''
           OR coalesce(NEW.description_long, '') <> '' OR coalesce(NEW.description_ai, '') <> ''))
EXECUTE FUNCTION public.eredita_contenuti_doppione_nascosto();
