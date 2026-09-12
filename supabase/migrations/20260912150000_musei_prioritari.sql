-- ═══════════════════════════════════════════════════════════════════════════
-- MUSEI PRIORITARI (12/09/2026): i primi 500 musei del mondo per notorietà
-- (sitelink Wikidata), la lista di lavoro del cruscotto «Completezza musei»
-- e del giro notturno. Ordine = rango; il QID è la chiave comune fra i
-- prefissi (wd-/wv-/nome_) con cui lo stesso museo compare in
-- shared_pois, museum_guides, fonti_poi e mappe_museo.
-- IDEMPOTENTE.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.musei_prioritari (
  qid           text PRIMARY KEY,
  rango         integer NOT NULL,
  nome          text NOT NULL,
  lat           double precision,
  lon           double precision,
  sito          text,
  paese         text,
  sitelinks     integer,
  note          text,
  aggiornato_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_musei_prioritari_rango ON public.musei_prioritari (rango);
ALTER TABLE public.musei_prioritari ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.musei_prioritari FROM anon, authenticated;
