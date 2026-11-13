-- Indice mondiale dei musei scaricato da museu.ms (12/09/2026 sera, committente:
-- «verifica ed estrapola più dati che puoi… scarica tutto, di tutti i musei»).
-- Una riga per scheda: contatti, orari, ingresso, descrizione, tipo. Serve a
-- riempire orari/servizi delle guide e a scoprire musei assenti dal nostro
-- archivio. L'aggancio al POI (poi_id) si fa dopo, per nome e paese.
CREATE TABLE IF NOT EXISTS public.musei_directory (
  fonte        text NOT NULL DEFAULT 'museu.ms',
  fonte_id     integer NOT NULL,
  url          text,
  nome         text,
  indirizzo    text,
  citta        text,
  paese        text,
  telefono     text,
  email        text,
  sito         text,
  tipo         text,
  orari        jsonb,
  ingresso     text,
  descrizione  text,
  vicini       jsonb,
  poi_id       text,
  qid          text,
  recuperato_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fonte, fonte_id)
);
CREATE INDEX IF NOT EXISTS musei_directory_nome_idx ON public.musei_directory USING gin (to_tsvector('simple', coalesce(nome, '')));
CREATE INDEX IF NOT EXISTS musei_directory_paese_idx ON public.musei_directory (paese);
ALTER TABLE public.musei_directory ENABLE ROW LEVEL SECURITY;
