-- Create user_profiles table for subscription status
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    subscription_tier TEXT NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'premium')),
    subscription_status TEXT DEFAULT NULL,
    subscription_plan TEXT DEFAULT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    premium_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    is_forever_premium BOOLEAN NOT NULL DEFAULT false,
    is_admin BOOLEAN NOT NULL DEFAULT false,
    stripe_customer_id TEXT,
    custom_limit_itinerary INTEGER DEFAULT NULL,
    custom_limit_audio_guide INTEGER DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (id)
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins have full access on profiles" ON public.user_profiles
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Create API Cache table for reducing external API calls
CREATE TABLE IF NOT EXISTS public.api_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cache_key TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL CHECK (content_type IN ('itinerary', 'audio_guide')),
    text_content JSONB,
    audio_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: No RLS needed for api_cache if we only use it server-side, 
-- or we can enable RLS and just allow service_role access.

-- Ensure audio_cache bucket exists for audio guide caching
INSERT INTO storage.buckets (id, name, public) VALUES ('audio_cache', 'audio_cache', true) ON CONFLICT DO NOTHING;

-- Insert some static/default values? No need.
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    duration_days INTEGER NOT NULL,
    max_uses INTEGER NOT NULL,
    uses_count INTEGER NOT NULL DEFAULT 0,
    structure_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Admins can do anything, authenticated users can read active coupons to redeem them
CREATE POLICY "Admins have full access on coupons" ON public.coupons
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Users can search active coupons" ON public.coupons
    FOR SELECT TO authenticated
    USING (is_active = true);

-- Create the user_api_quotas table
CREATE TABLE IF NOT EXISTS public.user_api_quotas (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    itineraries_count INTEGER NOT NULL DEFAULT 0,
    audio_guides_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, date)
);

-- Enable Row Level Security
ALTER TABLE public.user_api_quotas ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to read only their own quotas
CREATE POLICY "Users can view own quotas" ON public.user_api_quotas
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Create policy to allow users to update their own quotas (insert/update)
CREATE POLICY "Users can update own quotas" ON public.user_api_quotas
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quotas (update)" ON public.user_api_quotas
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Optional: Create function to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_api_quotas_updated_at
    BEFORE UPDATE ON public.user_api_quotas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ALTER existing user_api_quotas table to add new counts for dynamic limits
ALTER TABLE public.user_api_quotas ADD COLUMN IF NOT EXISTS poi_details_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.user_api_quotas ADD COLUMN IF NOT EXISTS photo_searches_count INTEGER NOT NULL DEFAULT 0;

-- Create global_quotas table
CREATE TABLE IF NOT EXISTS public.global_quotas (
    tier TEXT NOT NULL PRIMARY KEY CHECK (tier IN ('free', 'premium')),
    itineraries_limit INTEGER NOT NULL DEFAULT 5,
    audio_guides_limit INTEGER NOT NULL DEFAULT 15,
    poi_details_limit INTEGER NOT NULL DEFAULT 10,
    photo_searches_limit INTEGER NOT NULL DEFAULT 3,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed initial baseline defaults
INSERT INTO public.global_quotas (tier, itineraries_limit, audio_guides_limit, poi_details_limit, photo_searches_limit) 
VALUES 
  ('free', 1, 3, 5, 2),
  ('premium', 5, 15, 20, 10)
ON CONFLICT (tier) DO UPDATE SET
  itineraries_limit = EXCLUDED.itineraries_limit,
  audio_guides_limit = EXCLUDED.audio_guides_limit,
  poi_details_limit = EXCLUDED.poi_details_limit,
  photo_searches_limit = EXCLUDED.photo_searches_limit;

-- Enable RLS for global_quotas
ALTER TABLE public.global_quotas ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated or anonymous (since public reads them to enforce limits)
CREATE POLICY "Allow public read on global_quotas" ON public.global_quotas
    FOR SELECT TO public USING (true);

-- Only admins can modify global_quotas
CREATE POLICY "Admins have full access on global_quotas" ON public.global_quotas
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Create shared_pois table for the Elite POI Architecture
CREATE TABLE IF NOT EXISTS public.shared_pois (
    id TEXT PRIMARY KEY, -- String formatted as "lat,lon" (e.g. "44.079,10.098")
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description_ai TEXT,
    image_url TEXT,
    is_gem BOOLEAN DEFAULT false,
    desc TEXT,
    tech TEXT,
    info TEXT,
    audio TEXT,
    source_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_coords UNIQUE (lat, lon)
);

-- Enable RLS for shared_pois
ALTER TABLE public.shared_pois ENABLE ROW LEVEL SECURITY;

-- Read policy: Anyone can see elite POIs
CREATE POLICY "Allow public read on shared_pois" ON public.shared_pois
    FOR SELECT TO public USING (true);

-- Insert/Upsert policy: Authenticated and service role can upsert curated POIs
CREATE POLICY "Allow authenticated upsert on shared_pois" ON public.shared_pois
    FOR ALL TO public USING (true) WITH CHECK (true);

-- Create shared_poi_audio_cache for language/mode-specific summaries and audio
CREATE TABLE IF NOT EXISTS public.shared_poi_audio_cache (
    poi_id TEXT NOT NULL, -- e.g. "osm-node-123_it" or "lat,lon_it"
    guide_mode TEXT NOT NULL, -- "dante" or "nicky"
    name TEXT,
    category TEXT,
    description TEXT,
    wiki_extract TEXT,
    wiki_data TEXT,
    trip_data TEXT,
    parking_data TEXT,
    generated_text TEXT,
    image_url TEXT,
    audio_base64 TEXT,
    sub_category TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (poi_id, guide_mode)
);

-- Enable RLS for shared_poi_audio_cache
ALTER TABLE public.shared_poi_audio_cache ENABLE ROW LEVEL SECURITY;

-- Read policy: Anyone can read audio cache
CREATE POLICY "Allow public read on shared_poi_audio_cache" ON public.shared_poi_audio_cache
    FOR SELECT TO public USING (true);

-- Insert/Upsert policy: Anyone can insert/upsert details
CREATE POLICY "Allow public upsert on shared_poi_audio_cache" ON public.shared_poi_audio_cache
    FOR ALL TO public USING (true) WITH CHECK (true);

-- Create api_usage_logs table for tracking external API consumption
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_name TEXT NOT NULL,
    feature_context TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Read policy: Anyone authenticated (or admins) can see logs
CREATE POLICY "Allow public read on api_usage_logs" ON public.api_usage_logs
    FOR SELECT TO public USING (true);

-- Insert policy: Public can insert telemetry logs
CREATE POLICY "Allow public insert on api_usage_logs" ON public.api_usage_logs
    FOR INSERT TO public WITH CHECK (true);

-- ===================================================
-- EDITOR MODULE EXTENSIONS
-- ===================================================

-- 1. Add review columns to public.shared_pois
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('draft', 'verified', 'needs_revision')) DEFAULT 'draft';
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL DEFAULT NULL;

-- 2. Create public.revision_logs table for audit tracking
CREATE TABLE IF NOT EXISTS public.revision_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poi_id TEXT REFERENCES public.shared_pois(id) ON DELETE CASCADE,
    admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL, -- e.g. 'regenerate_text', 'regenerate_audio', 'regenerate_image', 'translate_all', 'approve_publish'
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Enable Row Level Security (RLS) on revision_logs
ALTER TABLE public.revision_logs ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for revision_logs (Admins Only)
CREATE POLICY "Admins have full access on revision_logs" ON public.revision_logs
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true));

-- 5. Row-level protective trigger for shared_pois review columns
-- Ensures non-admins cannot change status or review fields directly through client-side API requests.
CREATE OR REPLACE FUNCTION protect_poi_review_columns()
RETURNS TRIGGER AS $$
DECLARE
    is_admin_user BOOLEAN := false;
BEGIN
    -- Check if current user is admin
    IF auth.uid() IS NOT NULL THEN
        SELECT is_admin INTO is_admin_user FROM public.user_profiles WHERE id = auth.uid();
    END IF;

    -- If not admin and trying to change status/review fields, abort
    IF NOT COALESCE(is_admin_user, false) THEN
        IF NEW.status IS DISTINCT FROM OLD.status OR
           NEW.last_reviewed_at IS DISTINCT FROM OLD.last_reviewed_at OR
           NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
            RAISE EXCEPTION 'Only admin users can modify POI review status or review columns';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER before_update_shared_pois_review
    BEFORE UPDATE ON public.shared_pois
    FOR EACH ROW
    EXECUTE FUNCTION protect_poi_review_columns();


-- ===================================================
-- SHADOW EDITING & AZURE TTS EXTENSIONS (DOppio Binario)
-- ===================================================

-- Ensure columns are present on shared_pois
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS audio_url TEXT DEFAULT NULL;
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS description_ai TEXT DEFAULT NULL;
ALTER TABLE public.shared_pois ADD COLUMN IF NOT EXISTS is_gem BOOLEAN DEFAULT false;

-- Table for real-time interactions (visits/listens)
CREATE TABLE IF NOT EXISTS public.poi_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poi_id TEXT REFERENCES public.shared_pois(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('visit', 'listen')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for poi_interactions
ALTER TABLE public.poi_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public insert on poi_interactions" ON public.poi_interactions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public read on poi_interactions" ON public.poi_interactions FOR SELECT TO public USING (true);

-- Table for Shadow Editing (pending edits)
CREATE TABLE IF NOT EXISTS public.pending_edits (
    poi_id TEXT PRIMARY KEY REFERENCES public.shared_pois(id) ON DELETE CASCADE,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description_ai TEXT,
    image_url TEXT,
    is_gem BOOLEAN DEFAULT false,
    audio_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for pending_edits
ALTER TABLE public.pending_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public full access on pending_edits" ON public.pending_edits FOR ALL TO public USING (true) WITH CHECK (true);

-- SQL Transaction: Approve and Publish shadow edits
CREATE OR REPLACE FUNCTION public.approve_and_publish_poi(target_poi_id TEXT)
RETURNS VOID AS $$
DECLARE
    pending RECORD;
BEGIN
    -- Select the pending edit
    SELECT * INTO pending FROM public.pending_edits WHERE poi_id = target_poi_id;
    
    IF FOUND THEN
        -- Update the shared_pois table with pending changes
        UPDATE public.shared_pois
        SET 
            lat = COALESCE(pending.lat, lat),
            lon = COALESCE(pending.lon, lon),
            name = COALESCE(pending.name, name),
            category = COALESCE(pending.category, category),
            description_ai = COALESCE(pending.description_ai, description_ai),
            image_url = COALESCE(pending.image_url, image_url),
            is_gem = COALESCE(pending.is_gem, is_gem),
            audio_url = COALESCE(pending.audio_url, audio_url),
            status = 'verified',
            last_reviewed_at = NOW()
        WHERE id = target_poi_id;
        
        -- Delete from pending_edits
        DELETE FROM public.pending_edits WHERE poi_id = target_poi_id;
    ELSE
        -- If not found in pending_edits, just verify the POI
        UPDATE public.shared_pois
        SET 
            status = 'verified',
            last_reviewed_at = NOW()
        WHERE id = target_poi_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger Postgres trigger for automated Azure audio generation
CREATE OR REPLACE FUNCTION public.trigger_generate_audio() 
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger if description_ai has changed, is not null, and audio_url is reset to null (signaling regeneration request)
    IF (NEW.description_ai IS NOT NULL AND (OLD.description_ai IS NULL OR NEW.description_ai != OLD.description_ai) AND NEW.audio_url IS NULL) THEN
        PERFORM net.http_post(
            url := 'https://qfxxhzkkrkvbuekfknhh.supabase.co/functions/v1/generate-poi-audio',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || COALESCE(current_setting('request.headers', true)::jsonb->>'authorization', '')
            ),
            body := jsonb_build_object('poi_id', NEW.id, 'text', NEW.description_ai)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger
CREATE OR REPLACE TRIGGER trg_generate_poi_audio
    AFTER UPDATE ON public.shared_pois
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_generate_audio();


-- Trigger Postgres trigger for automated POI details and photo enrichment on insertion
CREATE OR REPLACE FUNCTION public.trigger_enrich_poi()
RETURNS TRIGGER AS $$
DECLARE
    v_lang TEXT := 'en'; -- default lingua fallback globale
BEGIN
    -- Only trigger if the status is 'draft' or is newly created and lacks description
    IF (NEW.status = 'draft' OR NEW.description_ai IS NULL) THEN
        PERFORM net.http_post(
            url := 'https://qfxxhzkkrkvbuekfknhh.supabase.co/functions/v1/manager-poi',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer <<SUPABASE_SERVICE_ROLE_KEY>>'
            ),
            body := jsonb_build_object(
                'action',   'enrich-now',
                'id',       NEW.id,
                'name',     NEW.name,
                'lat',      NEW.lat,
                'lon',      NEW.lon,
                'category', NEW.category,
                -- Lingua: usa 'en' come fallback globale (massima copertura Wikipedia).
                -- enrichSinglePoi() tenta sempre anche la versione italiana come primo step.
                'lang',     v_lang
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the insert trigger
CREATE OR REPLACE TRIGGER trg_enrich_poi_on_insert
    AFTER INSERT ON public.shared_pois
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_enrich_poi();




