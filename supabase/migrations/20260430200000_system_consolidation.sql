-- FanCam / Fanclips — final consolidation (safe to re-run on existing DBs).
-- Fixes: atomic like/unlike (ROWCOUNT), FK on clip_reposts.user_id, indexes,
-- RPC EXECUTE grants for authenticated clients, realtime publication.

-- ---------------------------------------------------------------------------
-- 1. clip_reposts → auth.users FK + indexes
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clip_reposts'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clip_reposts_user_id_fkey'
  ) THEN
    ALTER TABLE public.clip_reposts
      ADD CONSTRAINT clip_reposts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clip_reposts_user_id ON public.clip_reposts(user_id);
CREATE INDEX IF NOT EXISTS idx_clip_reposts_clip_id ON public.clip_reposts(clip_id);

-- ---------------------------------------------------------------------------
-- 2. toggle_clip_like — auth match + ROWCOUNT-safe insert/delete + clip guard
-- ---------------------------------------------------------------------------
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
  v_ins INTEGER;
  v_del INTEGER;
  v_final_liked BOOLEAN;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT user_id INTO v_clip_owner FROM public.clips WHERE id = p_clip_id;
  IF NOT FOUND THEN
    RETURN json_build_object('liked', false, 'likes_count', 0, 'error', 'clip_not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.clip_likes WHERE clip_id = p_clip_id AND user_id = p_user_id
  ) INTO v_liked;

  IF v_liked THEN
    DELETE FROM public.clip_likes WHERE clip_id = p_clip_id AND user_id = p_user_id;
    GET DIAGNOSTICS v_del = ROW_COUNT;
    IF v_del > 0 THEN
      UPDATE public.clips SET likes_count = GREATEST(0, likes_count - 1) WHERE id = p_clip_id;
      IF v_clip_owner IS NOT NULL AND v_clip_owner <> p_user_id THEN
        UPDATE public.profiles SET points_balance = GREATEST(0, points_balance - 5) WHERE user_id = v_clip_owner;
        UPDATE public.profiles SET points_balance = GREATEST(0, points_balance - 1) WHERE user_id = p_user_id;
      END IF;
    END IF;
  ELSE
    INSERT INTO public.clip_likes (clip_id, user_id) VALUES (p_clip_id, p_user_id)
    ON CONFLICT (clip_id, user_id) DO NOTHING;
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    IF v_ins > 0 THEN
      UPDATE public.clips SET likes_count = likes_count + 1 WHERE id = p_clip_id;
      IF v_clip_owner IS NOT NULL AND v_clip_owner <> p_user_id THEN
        UPDATE public.profiles SET points_balance = points_balance + 5 WHERE user_id = v_clip_owner;
        INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
        VALUES (v_clip_owner, 5, 'Like received', p_clip_id);

        UPDATE public.profiles SET points_balance = points_balance + 1 WHERE user_id = p_user_id;
        INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
        VALUES (p_user_id, 1, 'Like given', p_clip_id);

        SELECT username INTO v_liker_name FROM public.profiles WHERE user_id = p_user_id;
        INSERT INTO public.notifications (user_id, type, message, reference_id)
        VALUES (
          v_clip_owner,
          'like',
          '@' || COALESCE(v_liker_name, 'someone') || ' liked your clip ❤️',
          p_clip_id
        );
      END IF;
    END IF;
  END IF;

  SELECT likes_count INTO v_new_count FROM public.clips WHERE id = p_clip_id;
  SELECT EXISTS (
    SELECT 1 FROM public.clip_likes WHERE clip_id = p_clip_id AND user_id = p_user_id
  ) INTO v_final_liked;

  RETURN json_build_object(
    'liked',
    COALESCE(v_final_liked, false),
    'likes_count',
    COALESCE(v_new_count, 0)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. repost_clip — keep logic; ensure grants
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repost_clip(p_clip_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_exists boolean;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT user_id INTO v_owner FROM public.clips WHERE id = p_clip_id AND status = 'live';
  IF v_owner IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'clip_not_found');
  END IF;

  IF v_owner = v_uid THEN
    RETURN json_build_object('ok', false, 'error', 'own_clip');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.clip_reposts WHERE clip_id = p_clip_id AND user_id = v_uid
  ) INTO v_exists;

  IF v_exists THEN
    RETURN json_build_object('ok', false, 'already', true);
  END IF;

  INSERT INTO public.clip_reposts (clip_id, user_id) VALUES (p_clip_id, v_uid);

  UPDATE public.profiles SET points_balance = points_balance + 5 WHERE user_id = v_uid;
  INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
  VALUES (v_uid, 5, 'Repost bonus', p_clip_id);

  UPDATE public.profiles SET points_balance = points_balance + 3 WHERE user_id = v_owner;
  INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
  VALUES (v_owner, 3, 'Your clip was reposted', p_clip_id);

  SELECT username INTO v_name FROM public.profiles WHERE user_id = v_uid;
  INSERT INTO public.notifications (user_id, type, message, reference_id)
  VALUES (
    v_owner,
    'repost',
    '@' || COALESCE(v_name, 'Someone') || ' reposted your clip 🔁',
    p_clip_id
  );

  RETURN json_build_object('ok', true, 'reposter_points', 5, 'owner_points', 3);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. transfer_points — explicit grants (RPC from Rewards page)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.transfer_points(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_points(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_points(uuid, integer, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Like / repost RPC grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.toggle_clip_like(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_clip_like(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_clip_like(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.repost_clip(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repost_clip(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repost_clip(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. claim_clip_upload_points (ensure app can invoke after migrations)
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.claim_clip_upload_points(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Realtime (optional; ignore if already member)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clip_reposts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

COMMENT ON FUNCTION public.toggle_clip_like(uuid, uuid) IS
  'Atomically toggles like; awards +5 pts owner and +1 liker on new like; requires auth.uid() = p_user_id.';
COMMENT ON FUNCTION public.repost_clip(uuid) IS
  'One repost per user per clip; +5 reposter +3 owner; notifies owner.';
COMMENT ON FUNCTION public.transfer_points(uuid, integer, text, text) IS
  'P2P points gift/star; debits sender, credits recipient, logs transactions.';
