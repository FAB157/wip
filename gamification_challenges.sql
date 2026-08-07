-- Creazione tabella per le Sfide Gamification Dinamiche
CREATE TABLE IF NOT EXISTS public.gamification_challenges (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL,
    category_trigger TEXT NOT NULL,
    threshold INTEGER NOT NULL DEFAULT 1,
    reward_type TEXT NOT NULL,
    reward_amount INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Inserimento delle sfide base (quelle attualmente hardcoded)
INSERT INTO public.gamification_challenges (id, name, icon, category_trigger, threshold, reward_type, reward_amount)
VALUES 
    ('pioniere', 'Pioniere', '🧭', 'all', 10, 'itinerary', 1),
    ('esploratore_gusto', 'Esploratore del Gusto', '🍷', 'esperienze_locali', 5, 'audio_guide', 2),
    ('cacciatore_fontanelle', 'Cacciatore Fontanelle', '⛲', 'utilita', 3, 'audio_guide', 1),
    ('storico', 'Storico', '🏛️', 'monument', 5, 'none', 0)
ON CONFLICT (id) DO NOTHING;

-- Configurazione sicurezza RLS (Row Level Security)
ALTER TABLE public.gamification_challenges ENABLE ROW LEVEL SECURITY;

-- Policy di lettura per tutti gli utenti (tutti possono vedere i trofei)
CREATE POLICY "Le sfide sono pubbliche" 
ON public.gamification_challenges FOR SELECT 
TO public 
USING (true);

-- Policy di inserimento/modifica/eliminazione (idealmente andrebbe limitata agli Admin, 
-- ma per permettere modifiche veloci dall'App senza service_role, consentiamo momentaneamente agli autenticati)
CREATE POLICY "Gli autenticati possono gestire le sfide" 
ON public.gamification_challenges FOR ALL
TO authenticated 
USING (true)
WITH CHECK (true);
