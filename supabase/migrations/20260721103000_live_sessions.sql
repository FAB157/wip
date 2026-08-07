-- Crea tabella per le sessioni live
CREATE TABLE IF NOT EXISTS public.live_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pin VARCHAR(6) NOT NULL UNIQUE,
    leader_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '12 hours',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    current_poi_id TEXT,
    language TEXT DEFAULT 'IT'
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_live_sessions_pin ON public.live_sessions(pin);
CREATE INDEX IF NOT EXISTS idx_live_sessions_leader ON public.live_sessions(leader_id);

-- RLS
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Lettura pubblica (anche per gli anonimi che si uniscono con PIN)
CREATE POLICY "Allow public read of active sessions" 
    ON public.live_sessions FOR SELECT 
    USING (is_active = TRUE);

-- Solo utenti autenticati possono creare sessioni (Leader)
CREATE POLICY "Allow authenticated create sessions" 
    ON public.live_sessions FOR INSERT 
    WITH CHECK (auth.uid() = leader_id);

-- Solo il leader può aggiornare la propria sessione
CREATE POLICY "Allow leader update session" 
    ON public.live_sessions FOR UPDATE 
    USING (auth.uid() = leader_id);
