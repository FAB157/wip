-- ═══════════════════════════════════════════════════════════════════════════
-- VISION / WIP COMMUNITY v2 (21/08/2026) — DA APPLICARE A MANO (SQL editor).
-- lock_timeout basso: mai accodarsi dietro query lunghe (lezione pm2/enrich).
--
-- Contenuto:
--  1) vision_cards: colonne per lingua, confidenza, candidati, motivo rifiuto,
--     moderazione automatica, provenienza foto/coordinate, foto hi-res,
--     bonus "primo scopritore" e crediti erogati.
--  2) (nessuna colonna profilo: anonimato totale per decisione di prodotto)
--  3) RPC atomiche add_credits / add_xp: fine dei GET-then-PATCH concorrenti
--     su user_profiles (premio Vision, bonus benvenuto, XP).
--  4) shared_vision_cache: indice su created_at per il TTL.
--  5) community_content_reports: indice per stato (coda admin "Segnalate").
-- Tutto idempotente.
-- ═══════════════════════════════════════════════════════════════════════════
set lock_timeout = '5s';

-- 1) vision_cards ------------------------------------------------------------
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS confidence integer;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS candidates_json jsonb;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS user_confirmed_name text;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS reject_note text;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS moderation_json jsonb;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS photo_source text;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS coords_source text;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS photo_taken_at timestamptz;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS hires_photo_url text;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS first_discoverer boolean DEFAULT false;
ALTER TABLE public.vision_cards ADD COLUMN IF NOT EXISTS reward_credits integer DEFAULT 0;

-- Novità per l'utente (/api/vision/my-updates) e conteggi anti-farm.
CREATE INDEX IF NOT EXISTS vision_cards_user_reviewed_idx
  ON public.vision_cards (user_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS vision_cards_user_recognized_idx
  ON public.vision_cards (user_id, recognized, created_at DESC);
-- Feed geolocalizzato delle approvate.
CREATE INDEX IF NOT EXISTS vision_cards_approved_geo_idx
  ON public.vision_cards (lat, lon) WHERE review_status = 'approved';

-- 2) (niente firma/nickname: i profili e i nomi restano SEMPRE anonimi —
--    decisione 21/08/2026; il feed community non espone mai l'autore)

-- 3) RPC atomiche -------------------------------------------------------------
-- add_credits: accredita in una sola UPDATE (niente lost update fra premio
-- Vision, bonus benvenuto e consume_credits concorrenti). Solo service role:
-- il trigger protect_profile_sensitive_cols lascia passare auth.role() =
-- 'service_role', ed è così che la chiama il server (chiave service).
CREATE OR REPLACE FUNCTION public.add_credits(p_user_id uuid, p_amount integer, p_kind text DEFAULT 'earned')
RETURNS TABLE (earned_credits integer, purchased_credits integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'add_credits: importo non valido';
  END IF;
  IF p_kind NOT IN ('earned', 'purchased') THEN
    RAISE EXCEPTION 'add_credits: tipo non valido';
  END IF;
  INSERT INTO public.user_profiles (id, earned_credits, purchased_credits)
  VALUES (p_user_id,
          CASE WHEN p_kind = 'earned' THEN p_amount ELSE 0 END,
          CASE WHEN p_kind = 'purchased' THEN p_amount ELSE 0 END)
  ON CONFLICT (id) DO UPDATE SET
    earned_credits    = coalesce(public.user_profiles.earned_credits, 0)
                        + CASE WHEN p_kind = 'earned' THEN p_amount ELSE 0 END,
    purchased_credits = coalesce(public.user_profiles.purchased_credits, 0)
                        + CASE WHEN p_kind = 'purchased' THEN p_amount ELSE 0 END;
  RETURN QUERY
    SELECT up.earned_credits, up.purchased_credits
    FROM public.user_profiles up WHERE up.id = p_user_id;
END $$;
REVOKE ALL ON FUNCTION public.add_credits(uuid, integer, text) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.add_xp(p_user_id uuid, p_amount integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_xp integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'add_xp: importo non valido';
  END IF;
  UPDATE public.user_profiles
     SET xp_points = coalesce(xp_points, 0) + p_amount
   WHERE id = p_user_id
   RETURNING xp_points INTO v_xp;
  RETURN coalesce(v_xp, 0);
END $$;
REVOKE ALL ON FUNCTION public.add_xp(uuid, integer) FROM public, anon, authenticated;

-- 4) Cache GPS condivisa: TTL (180 giorni, applicato dal server in lettura)
CREATE INDEX IF NOT EXISTS shared_vision_cache_created_idx
  ON public.shared_vision_cache (created_at DESC);

-- 5) Segnalazioni: coda admin per stato
CREATE INDEX IF NOT EXISTS idx_ccr_status_created
  ON public.community_content_reports (status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICA POST-APPLICAZIONE:
--   select column_name from information_schema.columns
--   where table_name='vision_cards' and column_name in
--   ('language','confidence','reject_reason','moderation_json','first_discoverer');
--   → 5 righe
--   select proname from pg_proc where proname in ('add_credits','add_xp'); → 2 righe
-- ═══════════════════════════════════════════════════════════════════════════
