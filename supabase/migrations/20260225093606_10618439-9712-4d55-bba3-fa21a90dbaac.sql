
-- Unique constraint on profiles.user_id (needed as FK target)
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);

-- FK from clips.user_id to profiles.user_id so PostgREST join works
ALTER TABLE public.clips ADD CONSTRAINT clips_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

-- Comments table
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are viewable by everyone"
  ON public.comments FOR SELECT USING (true);

CREATE POLICY "Users can insert own comments"
  ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE USING (auth.uid() = user_id);

-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  message text NOT NULL,
  reference_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- Allow service role / triggers to insert notifications (no user-facing insert)
CREATE POLICY "Service can insert notifications"
  ON public.notifications FOR INSERT WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Update toggle_clip_like to also create a notification
CREATE OR REPLACE FUNCTION public.toggle_clip_like(p_clip_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_liked BOOLEAN;
  v_clip_owner UUID;
  v_new_count INTEGER;
  v_liker_name TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.clip_likes WHERE clip_id = p_clip_id AND user_id = p_user_id
  ) INTO v_liked;

  SELECT user_id INTO v_clip_owner FROM public.clips WHERE id = p_clip_id;

  IF v_liked THEN
    DELETE FROM public.clip_likes WHERE clip_id = p_clip_id AND user_id = p_user_id;
    UPDATE public.clips SET likes_count = GREATEST(0, likes_count - 1) WHERE id = p_clip_id;
    IF v_clip_owner IS NOT NULL AND v_clip_owner != p_user_id THEN
      UPDATE public.profiles SET points_balance = GREATEST(0, points_balance - 5) WHERE user_id = v_clip_owner;
    END IF;
  ELSE
    INSERT INTO public.clip_likes (clip_id, user_id) VALUES (p_clip_id, p_user_id)
    ON CONFLICT DO NOTHING;
    UPDATE public.clips SET likes_count = likes_count + 1 WHERE id = p_clip_id;
    IF v_clip_owner IS NOT NULL AND v_clip_owner != p_user_id THEN
      UPDATE public.profiles SET points_balance = points_balance + 5 WHERE user_id = v_clip_owner;
      INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
      VALUES (v_clip_owner, 5, 'Like received', p_clip_id);

      -- Create notification for clip owner
      SELECT username INTO v_liker_name FROM public.profiles WHERE user_id = p_user_id;
      INSERT INTO public.notifications (user_id, type, message, reference_id)
      VALUES (v_clip_owner, 'like', '@' || COALESCE(v_liker_name, 'someone') || ' liked your clip ❤️', p_clip_id);
    END IF;
  END IF;

  SELECT likes_count INTO v_new_count FROM public.clips WHERE id = p_clip_id;
  RETURN json_build_object('liked', NOT v_liked, 'likes_count', v_new_count);
END;
$$;
