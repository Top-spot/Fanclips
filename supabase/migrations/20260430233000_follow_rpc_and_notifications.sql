-- Follow/unfollow RPCs with DB-side notification writes.

CREATE OR REPLACE FUNCTION public.follow_user(p_target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_uid THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_target_user_id
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN json_build_object('ok', false, 'error', 'target_not_found');
  END IF;

  INSERT INTO public.follows (follower_id, following_id)
  VALUES (v_uid, p_target_user_id)
  ON CONFLICT (follower_id, following_id) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public.follows WHERE follower_id = v_uid AND following_id = p_target_user_id
  ) THEN
    INSERT INTO public.notifications (user_id, type, message, reference_id, read)
    VALUES (p_target_user_id, 'follow', 'You have a new follower 👥', v_uid, false);
    RETURN json_build_object('ok', true, 'following', true);
  END IF;

  RETURN json_build_object('ok', true, 'following', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.unfollow_user(p_target_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_target_user_id IS NULL OR p_target_user_id = v_uid THEN
    RETURN json_build_object('ok', false, 'error', 'invalid_target');
  END IF;

  DELETE FROM public.follows
  WHERE follower_id = v_uid AND following_id = p_target_user_id;

  RETURN json_build_object('ok', true, 'following', false);
END;
$$;

REVOKE ALL ON FUNCTION public.follow_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.follow_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.follow_user(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.unfollow_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unfollow_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_user(uuid) TO service_role;
