-- Live audio "commentary" reactions on someone else's clip.
-- Extension points for other agents:
--   - Table: public.clip_commentary_features
--   - Storage: client uploads to existing bucket `clips` at {user_id}/commentary-{feature_id}.webm
--     (optional bucket clip_commentary_audio + policies below for legacy experiments)
--   - Client/service: src/services/clipCommentaryService.ts, src/lib/clipCommentary/

CREATE TABLE IF NOT EXISTS public.clip_commentary_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_clip_id uuid NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  creator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_storage_path text NOT NULL,
  duration_seconds real NOT NULL DEFAULT 0,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clip_commentary_duration_reasonable CHECK (duration_seconds >= 0 AND duration_seconds <= 600)
);

CREATE INDEX IF NOT EXISTS idx_clip_commentary_creator_created
  ON public.clip_commentary_features (creator_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clip_commentary_source
  ON public.clip_commentary_features (source_clip_id);

ALTER TABLE public.clip_commentary_features ENABLE ROW LEVEL SECURITY;

-- SELECT: same visibility idea as clips — owner of clip, public profile, or accepted friend of clip owner.
DROP POLICY IF EXISTS "clip_commentary_select" ON public.clip_commentary_features;
CREATE POLICY "clip_commentary_select"
  ON public.clip_commentary_features FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.clips c
      WHERE c.id = clip_commentary_features.source_clip_id
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.user_id = c.user_id
              AND p.is_private = false
          )
          OR EXISTS (
            SELECT 1
            FROM public.follows fo
            WHERE fo.follower_id = auth.uid()
              AND fo.following_id = c.user_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.friendships f
            WHERE f.status = 'accepted'
              AND (
                (f.requester_id = c.user_id AND f.addressee_id = auth.uid())
                OR (f.addressee_id = c.user_id AND f.requester_id = auth.uid())
              )
          )
        )
    )
  );

-- INSERT: authenticated, own row, not your own clip, target clip is live and visible to you.
DROP POLICY IF EXISTS "clip_commentary_insert" ON public.clip_commentary_features;
CREATE POLICY "clip_commentary_insert"
  ON public.clip_commentary_features FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = creator_user_id
    AND EXISTS (
      SELECT 1
      FROM public.clips c
      WHERE c.id = source_clip_id
        AND c.user_id <> auth.uid()
        AND c.status = 'live'
        AND c.is_hidden = false
        AND (
          EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.user_id = c.user_id
              AND p.is_private = false
          )
          OR EXISTS (
            SELECT 1
            FROM public.follows fo
            WHERE fo.follower_id = auth.uid()
              AND fo.following_id = c.user_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.friendships f
            WHERE f.status = 'accepted'
              AND (
                (f.requester_id = c.user_id AND f.addressee_id = auth.uid())
                OR (f.addressee_id = c.user_id AND f.requester_id = auth.uid())
              )
          )
        )
    )
  );

DROP POLICY IF EXISTS "clip_commentary_delete_own" ON public.clip_commentary_features;
CREATE POLICY "clip_commentary_delete_own"
  ON public.clip_commentary_features FOR DELETE
  USING (auth.uid() = creator_user_id);

COMMENT ON TABLE public.clip_commentary_features IS
  'User-recorded microphone commentary tied to another user''s clip; audio in storage bucket clip_commentary_audio.';

-- Storage bucket (public read for simple playback URLs; scoped writes by user folder)
INSERT INTO storage.buckets (id, name, public)
VALUES ('clip_commentary_audio', 'clip_commentary_audio', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "clip_commentary_audio_select" ON storage.objects;
CREATE POLICY "clip_commentary_audio_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'clip_commentary_audio');

DROP POLICY IF EXISTS "clip_commentary_audio_insert" ON storage.objects;
CREATE POLICY "clip_commentary_audio_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'clip_commentary_audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "clip_commentary_audio_update" ON storage.objects;
CREATE POLICY "clip_commentary_audio_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'clip_commentary_audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "clip_commentary_audio_delete" ON storage.objects;
CREATE POLICY "clip_commentary_audio_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'clip_commentary_audio'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
