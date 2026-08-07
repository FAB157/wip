-- Schede Vision: il riconoscimento fotografico non crea più POI in
-- shared_pois ma una scheda enciclopedica personale, con la foto
-- dell'utente nel bucket pubblico vision-photos.
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

-- Il server scrive con la service role (bypassa la RLS); i client possono
-- solo leggere le proprie schede.
ALTER TABLE vision_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vision_cards_select_own" ON vision_cards;
CREATE POLICY "vision_cards_select_own" ON vision_cards
  FOR SELECT USING (auth.uid() = user_id);
