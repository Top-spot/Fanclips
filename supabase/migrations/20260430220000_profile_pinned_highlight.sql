-- Add pinned highlight/video support for profile player cards.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pinned_clip_id uuid NULL REFERENCES public.clips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_pinned_clip_id ON public.profiles(pinned_clip_id);

COMMENT ON COLUMN public.profiles.pinned_clip_id IS
'Optional clip shown as the user pinned highlight on profile.';
