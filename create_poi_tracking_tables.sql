-- =====================================================================
-- ITAINTA · TABELLE DI TRACCIAMENTO POI (ITINERARI E SEED)
-- =====================================================================

-- 1. Tabella poi_itinerari: Traccia quali POI sono stati creati da quali itinerari
CREATE TABLE IF NOT EXISTS public.poi_itinerari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poi_id TEXT NOT NULL REFERENCES public.shared_pois(id) ON DELETE CASCADE,
    itinerary_id UUID NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Abilitazione RLS
ALTER TABLE public.poi_itinerari ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on poi_itinerari" ON public.poi_itinerari
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow authenticated insert on poi_itinerari" ON public.poi_itinerari
    FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Tabella poi_seed: Traccia quali POI sono stati seminati (Overpass) e da chi
CREATE TABLE IF NOT EXISTS public.poi_seed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poi_id TEXT NOT NULL REFERENCES public.shared_pois(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Abilitazione RLS
ALTER TABLE public.poi_seed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on poi_seed" ON public.poi_seed
    FOR SELECT TO public USING (true);

CREATE POLICY "Allow authenticated insert on poi_seed" ON public.poi_seed
    FOR INSERT TO authenticated WITH CHECK (true);
