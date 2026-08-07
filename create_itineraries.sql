-- Creazione della tabella "itineraries"
CREATE TABLE IF NOT EXISTS public.itineraries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    plan JSONB NOT NULL DEFAULT '{}'::jsonb,
    constraints JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Abilita RLS
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

-- Policy per Select: l'utente vede solo i propri
CREATE POLICY "Users can view their own itineraries" 
    ON public.itineraries FOR SELECT 
    USING (auth.uid() = user_id);

-- Policy per Insert
CREATE POLICY "Users can insert their own itineraries" 
    ON public.itineraries FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Policy per Update
CREATE POLICY "Users can update their own itineraries" 
    ON public.itineraries FOR UPDATE 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Policy per Delete
CREATE POLICY "Users can delete their own itineraries" 
    ON public.itineraries FOR DELETE 
    USING (auth.uid() = user_id);

-- Abilita Real-Time
ALTER PUBLICATION supabase_realtime ADD TABLE public.itineraries;

-- Aggiungi anche un trigger per l'updated_at
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_public_itineraries_updated_at ON public.itineraries;
CREATE TRIGGER set_public_itineraries_updated_at
BEFORE UPDATE ON public.itineraries
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();
