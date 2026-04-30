
-- Temporarily allow null user_id on clips for anonymous testing uploads
ALTER TABLE public.clips ALTER COLUMN user_id DROP NOT NULL;

-- Drop the FK constraint temporarily so anon uploads don't fail
ALTER TABLE public.clips DROP CONSTRAINT IF EXISTS clips_user_id_profiles_fkey;
