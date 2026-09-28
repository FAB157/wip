-- FOTO CANDIDATE DA FONTI TERZE, IN ATTESA DI APPROVAZIONE UMANA (17/09/2026).
--
-- Regola del committente: sito ufficiale della gemma e Wikipedia sono fonti
-- affidabili (licenza implicita/CC nota) e si scrivono DIRETTAMENTE in
-- shared_pois.image_url. Guide turistiche, blog di viaggio e social invece
-- possono avere la foto giusta ma licenza incerta o luogo da controllare a
-- occhio: entrano qui come CANDIDATE, mai in shared_pois, finché il
-- committente non le passa in rassegna e approva una per una.
CREATE TABLE IF NOT EXISTS public.foto_pois_da_verificare (
  id BIGSERIAL PRIMARY KEY,
  poi_id TEXT NOT NULL,
  poi_nome TEXT NOT NULL,
  foto_url TEXT NOT NULL,
  fonte_url TEXT NOT NULL,
  fonte_dominio TEXT NOT NULL,
  fonte_tipo TEXT NOT NULL DEFAULT 'terzi', -- 'blog' | 'social' | 'guida' | 'terzi'
  stato TEXT NOT NULL DEFAULT 'da_verificare', -- 'da_verificare' | 'approvata' | 'rifiutata'
  creato_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deciso_at TIMESTAMPTZ,
  deciso_da TEXT,
  UNIQUE (poi_id, foto_url)
);
CREATE INDEX IF NOT EXISTS foto_pois_da_verificare_stato_idx ON public.foto_pois_da_verificare (stato, creato_at);
