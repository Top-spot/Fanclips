-- clip_reposts table + RLS.
-- Canonical RPC definitions (toggle_clip_like, repost_clip, grants, FK) live in
-- 20260430200000_system_consolidation.sql — apply that migration after this one.

CREATE TABLE IF NOT EXISTS public.clip_reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clip_id, user_id)
);

ALTER TABLE public.clip_reposts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clip_reposts_select_all" ON public.clip_reposts;
CREATE POLICY "clip_reposts_select_all"
  ON public.clip_reposts FOR SELECT USING (true);

DROP POLICY IF EXISTS "clip_reposts_insert_own" ON public.clip_reposts;
CREATE POLICY "clip_reposts_insert_own"
  ON public.clip_reposts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "clip_reposts_delete_own" ON public.clip_reposts;
CREATE POLICY "clip_reposts_delete_own"
  ON public.clip_reposts FOR DELETE USING (auth.uid() = user_id);
