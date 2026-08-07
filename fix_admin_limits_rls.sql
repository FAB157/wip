-- ============================================================
-- FIX: Admin limits not saving - RLS + missing column patch
-- Run this in Supabase SQL Editor (as service_role or postgres)
-- ============================================================

-- 1. Add missing premium_guide_limit column to global_quotas (if not present)
ALTER TABLE public.global_quotas 
  ADD COLUMN IF NOT EXISTS premium_guide_limit INTEGER NOT NULL DEFAULT 0;

-- 2. Ensure user_quotas table exists with all columns used by AdminPanel
CREATE TABLE IF NOT EXISTS public.user_quotas (
    user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    itinerari_used INTEGER NOT NULL DEFAULT 0,
    audioguide_used INTEGER NOT NULL DEFAULT 0,
    vision_used INTEGER NOT NULL DEFAULT 0,
    premium_guide_used INTEGER NOT NULL DEFAULT 0,
    itinerari_limit INTEGER NOT NULL DEFAULT 1,
    audioguide_limit INTEGER NOT NULL DEFAULT 3,
    vision_limit INTEGER NOT NULL DEFAULT 5,
    premium_guide_limit INTEGER NOT NULL DEFAULT 0,
    plan_type TEXT DEFAULT 'free',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Add missing columns to user_quotas if table already existed
ALTER TABLE public.user_quotas ADD COLUMN IF NOT EXISTS vision_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.user_quotas ADD COLUMN IF NOT EXISTS premium_guide_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.user_quotas ADD COLUMN IF NOT EXISTS vision_limit INTEGER NOT NULL DEFAULT 5;
ALTER TABLE public.user_quotas ADD COLUMN IF NOT EXISTS premium_guide_limit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.user_quotas ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'free';

-- 4. Enable RLS on user_quotas
ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;

-- 5. Drop old conflicting policies on global_quotas (if any) and recreate cleanly
DROP POLICY IF EXISTS "Admins have full access on global_quotas" ON public.global_quotas;
DROP POLICY IF EXISTS "Allow public read on global_quotas" ON public.global_quotas;

-- Re-create: public read
CREATE POLICY "Allow public read on global_quotas" ON public.global_quotas
    FOR SELECT TO public USING (true);

-- Re-create: admins INSERT (needed for upsert)
CREATE POLICY "Admins can insert global_quotas" ON public.global_quotas
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Re-create: admins UPDATE
CREATE POLICY "Admins can update global_quotas" ON public.global_quotas
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true));

-- 6. Policies for user_quotas
DROP POLICY IF EXISTS "Admins have full access on user_quotas" ON public.user_quotas;
DROP POLICY IF EXISTS "Users can view own user_quotas" ON public.user_quotas;
DROP POLICY IF EXISTS "Users can update own user_quotas" ON public.user_quotas;

-- Users can read their own quota
CREATE POLICY "Users can view own user_quotas" ON public.user_quotas
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Admins can read all quotas
CREATE POLICY "Admins can read all user_quotas" ON public.user_quotas
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Admins can insert user_quotas (needed for upsert when row doesn't exist)
CREATE POLICY "Admins can insert user_quotas" ON public.user_quotas
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Admins can update user_quotas
CREATE POLICY "Admins can update user_quotas" ON public.user_quotas
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true))
    WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_admin = true));

-- Server-side (service_role) can always update its own row
CREATE POLICY "Users can upsert own user_quotas" ON public.user_quotas
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own user_quotas" ON public.user_quotas
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
