-- Migrazione per semplificare la gamification sostituendo i vari reward con un unico sistema a crediti

-- 0. Assicuriamoci che le tabelle esistano (nel caso manchino)
CREATE TABLE IF NOT EXISTS public.gamification_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level INT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    xp_required INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.gamification_challenges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    category_trigger TEXT NOT NULL,
    threshold INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1. Aggiornamento gamification_levels
ALTER TABLE public.gamification_levels DROP COLUMN IF EXISTS reward_vision;
ALTER TABLE public.gamification_levels DROP COLUMN IF EXISTS reward_audio;
ALTER TABLE public.gamification_levels DROP COLUMN IF EXISTS reward_itineraries;
ALTER TABLE public.gamification_levels ADD COLUMN IF NOT EXISTS reward_credits INT DEFAULT 0;

-- 2. Aggiornamento gamification_challenges
ALTER TABLE public.gamification_challenges DROP COLUMN IF EXISTS reward_type;
ALTER TABLE public.gamification_challenges DROP COLUMN IF EXISTS reward_amount;
ALTER TABLE public.gamification_challenges ADD COLUMN IF NOT EXISTS reward_credits INT DEFAULT 0;

-- 3. (Opzionale ma raccomandato) Assegniamo un ammontare standard per i livelli e le sfide esistenti 
-- ad esempio 30 crediti per livello e 15 crediti per sfida
UPDATE public.gamification_levels SET reward_credits = 30 WHERE reward_credits = 0 OR reward_credits IS NULL;
UPDATE public.gamification_challenges SET reward_credits = 15 WHERE reward_credits = 0 OR reward_credits IS NULL;
