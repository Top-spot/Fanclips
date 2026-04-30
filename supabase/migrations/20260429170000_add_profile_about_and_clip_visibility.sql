-- Profile about text + per-clip visibility

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bio TEXT;

ALTER TABLE public.clips
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
