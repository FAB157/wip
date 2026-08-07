-- Creazione tabella per la gestione dei livelli
CREATE TABLE IF NOT EXISTS public.gamification_levels (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    level INTEGER NOT NULL UNIQUE,
    title TEXT NOT NULL,
    xp_required INTEGER NOT NULL,
    reward_vision INTEGER DEFAULT 0,
    reward_audio INTEGER DEFAULT 0,
    reward_itineraries INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Permessi (RLS)
ALTER TABLE public.gamification_levels ENABLE ROW LEVEL SECURITY;

-- Lettura pubblica o per utenti autenticati
CREATE POLICY "Enable read access for all users" ON public.gamification_levels
    FOR SELECT USING (true);

-- Scrittura riservata (le chiamate Admin avvengono tramite service_role_key o RLS admin)
-- (Opzionale: puoi aggiungere policy per admin se necessario, ma dal client di solito
-- le modifiche Admin si fanno usando ruoli speciali o chiamate bypass RLS. 
-- In questo caso permettiamo ALL a tutti per semplicità, se le altre tabelle itainta lo fanno,
-- altrimenti stringi i permessi).
CREATE POLICY "Enable all access for authenticated" ON public.gamification_levels
    FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Inserimento livelli base iniziali
INSERT INTO public.gamification_levels (level, title, xp_required, reward_vision, reward_audio, reward_itineraries) VALUES
(1, 'Turista', 0, 0, 0, 0),
(2, 'Viaggiatore', 50, 2, 5, 1),
(3, 'Esploratore', 150, 5, 10, 2),
(4, 'Guida Locale', 300, 10, 20, 3),
(5, 'Leggenda di ITAINTA', 600, 20, 50, 5)
ON CONFLICT (level) DO NOTHING;
