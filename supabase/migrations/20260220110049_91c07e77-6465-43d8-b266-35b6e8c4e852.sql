
-- increment_points RPC function used by edge function
CREATE OR REPLACE FUNCTION public.increment_points(p_user_id UUID, p_amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET points_balance = points_balance + p_amount
  WHERE user_id = p_user_id;
END;
$$;

-- toggle_like function for atomic like/unlike + points
CREATE OR REPLACE FUNCTION public.toggle_clip_like(p_clip_id UUID, p_user_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_liked BOOLEAN;
  v_clip_owner UUID;
  v_new_count INTEGER;
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
    END IF;
  END IF;

  SELECT likes_count INTO v_new_count FROM public.clips WHERE id = p_clip_id;
  RETURN json_build_object('liked', NOT v_liked, 'likes_count', v_new_count);
END;
$$;
