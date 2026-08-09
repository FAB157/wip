-- ─────────────────────────────────────────────────────────────────────────
-- WIP COMMUNITY (Vision) — Fase 0: hardening + campi per la revisione.
-- DA APPLICARE A MANO su Supabase (SQL editor), come le migration
-- dell'hardening economia. lock_timeout basso per non accodarsi dietro
-- query lunghe e bloccare il REST (lezione pm2/enrich).
--
-- AUTOSUFFICIENTE: la migration 20260804000000_vision_cards.sql non è mai
-- stata applicata al DB live (relation "vision_cards" does not exist),
-- quindi qui si crea tutto da zero se manca: tabella, RLS, bucket foto.
-- ─────────────────────────────────────────────────────────────────────────
set lock_timeout = '5s';

-- 0) vision_cards: schema completo (come 20260804000000, mai applicata).
CREATE TABLE IF NOT EXISTS vision_cards (
  id text PRIMARY KEY,
  user_id uuid,
  name text NOT NULL,
  artist text,
  year text,
  style text,
  city text,
  category text,
  curiosity text,
  description_short text,
  description_long text,
  history text,
  audio_script text,
  lat double precision,
  lon double precision,
  photo_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vision_cards_user_idx ON vision_cards (user_id, created_at DESC);

-- Il server scrive con la service role (bypassa la RLS); i client leggono
-- SOLO le proprie schede (l'album My Vision è personale).
ALTER TABLE vision_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vision_cards_select_own" ON vision_cards;
CREATE POLICY "vision_cards_select_own" ON vision_cards
  FOR SELECT USING (auth.uid() = user_id);

-- 1) Campi per il flusso di revisione admin ("WIP Community") e My Vision.
--    review_status: 'pending' | 'approved' | 'rejected' (testo libero, come
--    status di shared_pois — niente enum per coerenza con il resto).
--    No-op se la CREATE qui sopra è appena passata; servono nel caso la
--    tabella esistesse già dalla migration di agosto su un altro ambiente.
ALTER TABLE vision_cards ADD COLUMN IF NOT EXISTS recognized boolean DEFAULT true;
ALTER TABLE vision_cards ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending';
ALTER TABLE vision_cards ADD COLUMN IF NOT EXISTS user_comment text;
ALTER TABLE vision_cards ADD COLUMN IF NOT EXISTS comment_tags text[];
ALTER TABLE vision_cards ADD COLUMN IF NOT EXISTS clean_photo_url text;
ALTER TABLE vision_cards ADD COLUMN IF NOT EXISTS published_poi_id text;
ALTER TABLE vision_cards ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE vision_cards ADD COLUMN IF NOT EXISTS reviewed_by uuid;

CREATE INDEX IF NOT EXISTS vision_cards_review_idx
  ON vision_cards (review_status, created_at DESC);

-- 2) Bucket foto: il server carica in vision-photos con la service key; se
--    il bucket manca l'upload fallisce e le schede restano senza foto.
--    (Pubblico per ora; il passaggio a bucket privato + URL firmati è
--    pianificato con la Fase 2 - revisione admin.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('vision-photos', 'vision-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 3) shared_vision_cache: finora la tabella era riferita dal client SENZA
--    migration ed era pensata scrivibile con la anon key → chiunque poteva
--    "avvelenare" la cache GPS e servire un riconoscimento falso (gratuito)
--    ai vicini. Da ora legge e scrive SOLO il server: RLS attiva senza
--    alcuna policy = nessun accesso per anon/authenticated, pieno accesso
--    alla service role.
CREATE TABLE IF NOT EXISTS shared_vision_cache (
  id text PRIMARY KEY,
  lat double precision,
  lon double precision,
  data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_vision_cache_geo_idx
  ON shared_vision_cache (lat, lon);

ALTER TABLE shared_vision_cache ENABLE ROW LEVEL SECURITY;

-- La tabella può preesistere con policy dai nomi ignoti: via tutte.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shared_vision_cache'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.shared_vision_cache', pol.policyname);
  END LOOP;
END $$;
