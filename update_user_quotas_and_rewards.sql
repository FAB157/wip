-- 1. Aggiungere le colonne bonus alla tabella user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS bonus_vision INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bonus_audio INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS bonus_itinerari INTEGER DEFAULT 0;

-- 2. Creare la tabella per tracciare i premi già riscossi
CREATE TABLE IF NOT EXISTS public.user_rewards_claimed (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reward_source_type TEXT NOT NULL, -- 'level' o 'challenge'
    reward_source_id TEXT NOT NULL,   -- L'ID della sfida o il numero del livello (es. '1', '2', o 'esploratore')
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, reward_source_type, reward_source_id)
);

-- Permessi (RLS) per user_rewards_claimed
ALTER TABLE public.user_rewards_claimed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own claimed rewards" ON public.user_rewards_claimed
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own claimed rewards" ON public.user_rewards_claimed
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Creare la funzione RPC per incrementare i bonus in modo sicuro
CREATE OR REPLACE FUNCTION increment_user_bonus(
    p_user_id UUID,
    p_vision INTEGER DEFAULT 0,
    p_audio INTEGER DEFAULT 0,
    p_itinerari INTEGER DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.user_profiles
    SET 
        bonus_vision = COALESCE(bonus_vision, 0) + p_vision,
        bonus_audio = COALESCE(bonus_audio, 0) + p_audio,
        bonus_itinerari = COALESCE(bonus_itinerari, 0) + p_itinerari
    WHERE id = p_user_id;
END;
$$;

-- 4. Creare la funzione RPC per consumare un bonus in modo sicuro (ritorna true se successo, false se bonus insufficiente)
CREATE OR REPLACE FUNCTION consume_user_bonus(
    p_user_id UUID,
    p_type TEXT -- 'vision', 'audio', o 'itinerari'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_bonus INTEGER;
BEGIN
    IF p_type = 'vision' THEN
        SELECT bonus_vision INTO v_current_bonus FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
        IF v_current_bonus > 0 THEN
            UPDATE public.user_profiles SET bonus_vision = bonus_vision - 1 WHERE id = p_user_id;
            RETURN true;
        END IF;
    ELSIF p_type = 'audio' THEN
        SELECT bonus_audio INTO v_current_bonus FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
        IF v_current_bonus > 0 THEN
            UPDATE public.user_profiles SET bonus_audio = bonus_audio - 1 WHERE id = p_user_id;
            RETURN true;
        END IF;
    ELSIF p_type = 'itinerari' THEN
        SELECT bonus_itinerari INTO v_current_bonus FROM public.user_profiles WHERE id = p_user_id FOR UPDATE;
        IF v_current_bonus > 0 THEN
            UPDATE public.user_profiles SET bonus_itinerari = bonus_itinerari - 1 WHERE id = p_user_id;
            RETURN true;
        END IF;
    END IF;
    
    RETURN false;
END;
$$;
