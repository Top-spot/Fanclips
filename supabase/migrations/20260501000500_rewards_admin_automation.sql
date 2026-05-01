-- Dynamic rewards engine + admin onboarding + social interaction point automation.

CREATE TABLE IF NOT EXISTS public.reward_rules (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  points_value integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reward_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reward rules are readable" ON public.reward_rules;
CREATE POLICY "Reward rules are readable"
  ON public.reward_rules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage reward rules" ON public.reward_rules;
CREATE POLICY "Admins can manage reward rules"
  ON public.reward_rules FOR ALL USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.reward_rules (key, label, description, points_value, enabled)
VALUES
  ('like_received', 'Like Received', 'Points earned when your clip gets liked', 5, true),
  ('like_given', 'Like Given', 'Points earned when you like someone else clip', 1, true),
  ('comment_posted', 'Comment Posted', 'Points earned for posting a comment', 2, true),
  ('comment_received', 'Comment Received', 'Points earned when someone comments on your clip', 3, true),
  ('reply_received', 'Reply Received', 'Points earned when someone replies to your comment', 2, true),
  ('repost_made', 'Repost Made', 'Points earned when reposting another clip', 5, true),
  ('repost_received', 'Repost Received', 'Points earned when your clip gets reposted', 3, true)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  admin_email text NOT NULL DEFAULT 'zwimz.co@gmail.com',
  setup_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin settings are readable by authenticated users" ON public.admin_settings;
CREATE POLICY "Admin settings are readable by authenticated users"
  ON public.admin_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can update admin settings" ON public.admin_settings;
CREATE POLICY "Admins can update admin settings"
  ON public.admin_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.admin_settings (id, admin_email, setup_completed)
VALUES (1, 'zwimz.co@gmail.com', false)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view admin profiles" ON public.admin_profiles;
CREATE POLICY "Admins can view admin profiles"
  ON public.admin_profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage admin profiles" ON public.admin_profiles;
CREATE POLICY "Admins can manage admin profiles"
  ON public.admin_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.reward_rule_points(p_key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT points_value
    FROM public.reward_rules
    WHERE key = p_key AND enabled = true
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.initialize_admin_profile(p_admin_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_allowed_email text;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  SELECT admin_email INTO v_allowed_email FROM public.admin_settings WHERE id = 1;

  IF lower(COALESCE(v_email, '')) <> lower(COALESCE(v_allowed_email, '')) THEN
    RAISE EXCEPTION 'Only the configured admin email can initialize admin access';
  END IF;

  v_name := NULLIF(trim(COALESCE(p_admin_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Admin name is required';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.admin_profiles (user_id, admin_name)
  VALUES (v_uid, v_name)
  ON CONFLICT (user_id) DO UPDATE SET admin_name = EXCLUDED.admin_name, updated_at = now();

  UPDATE public.admin_settings
  SET setup_completed = true, updated_at = now()
  WHERE id = 1;

  RETURN json_build_object('ok', true, 'admin_name', v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.initialize_admin_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reward_rule_points(text) TO authenticated;

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
  v_like_received_points integer := public.reward_rule_points('like_received');
  v_like_given_points integer := public.reward_rule_points('like_given');
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
        IF v_like_received_points > 0 THEN
          UPDATE public.profiles SET points_balance = GREATEST(0, points_balance - v_like_received_points) WHERE user_id = v_clip_owner;
          INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
          VALUES (v_clip_owner, -v_like_received_points, 'Like removed', p_clip_id);
        END IF;
        IF v_like_given_points > 0 THEN
          UPDATE public.profiles SET points_balance = GREATEST(0, points_balance - v_like_given_points) WHERE user_id = p_user_id;
          INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
          VALUES (p_user_id, -v_like_given_points, 'Like removed', p_clip_id);
        END IF;
      END IF;
    END IF;
  ELSE
    INSERT INTO public.clip_likes (clip_id, user_id) VALUES (p_clip_id, p_user_id)
    ON CONFLICT (clip_id, user_id) DO NOTHING;
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    IF v_ins > 0 THEN
      UPDATE public.clips SET likes_count = likes_count + 1 WHERE id = p_clip_id;
      IF v_clip_owner IS NOT NULL AND v_clip_owner <> p_user_id THEN
        IF v_like_received_points > 0 THEN
          UPDATE public.profiles SET points_balance = points_balance + v_like_received_points WHERE user_id = v_clip_owner;
          INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
          VALUES (v_clip_owner, v_like_received_points, 'Like received', p_clip_id);
        END IF;

        IF v_like_given_points > 0 THEN
          UPDATE public.profiles SET points_balance = points_balance + v_like_given_points WHERE user_id = p_user_id;
          INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
          VALUES (p_user_id, v_like_given_points, 'Like given', p_clip_id);
        END IF;

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

CREATE OR REPLACE FUNCTION public.handle_comment_rewards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip_owner uuid;
  v_actor_name text;
  v_comment_posted_points integer := public.reward_rule_points('comment_posted');
  v_comment_received_points integer := public.reward_rule_points('comment_received');
  v_reply_received_points integer := public.reward_rule_points('reply_received');
  v_parent_owner uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_clip_owner FROM public.clips WHERE id = NEW.clip_id;
  SELECT username INTO v_actor_name FROM public.profiles WHERE user_id = NEW.user_id;

  IF v_comment_posted_points > 0 THEN
    UPDATE public.profiles
    SET points_balance = points_balance + v_comment_posted_points
    WHERE user_id = NEW.user_id;

    INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
    VALUES (NEW.user_id, v_comment_posted_points, 'Comment posted', NEW.clip_id);
  END IF;

  IF v_clip_owner IS NOT NULL AND v_clip_owner <> NEW.user_id AND v_comment_received_points > 0 THEN
    UPDATE public.profiles
    SET points_balance = points_balance + v_comment_received_points
    WHERE user_id = v_clip_owner;

    INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
    VALUES (v_clip_owner, v_comment_received_points, 'Comment received', NEW.clip_id);
  END IF;

  IF v_clip_owner IS NOT NULL AND v_clip_owner <> NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, message, reference_id, read)
    VALUES (
      v_clip_owner,
      'comment',
      '@' || COALESCE(v_actor_name, 'someone') || ' commented on your clip 💬',
      NEW.clip_id,
      false
    );
  END IF;

  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT user_id INTO v_parent_owner FROM public.comments WHERE id = NEW.parent_comment_id;
    IF v_parent_owner IS NOT NULL AND v_parent_owner <> NEW.user_id THEN
      IF v_reply_received_points > 0 THEN
        UPDATE public.profiles
        SET points_balance = points_balance + v_reply_received_points
        WHERE user_id = v_parent_owner;

        INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
        VALUES (v_parent_owner, v_reply_received_points, 'Reply received', NEW.clip_id);
      END IF;

      IF v_parent_owner <> v_clip_owner THEN
        INSERT INTO public.notifications (user_id, type, message, reference_id, read)
        VALUES (
          v_parent_owner,
          'comment',
          '@' || COALESCE(v_actor_name, 'someone') || ' replied to your comment ↩️',
          NEW.clip_id,
          false
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_rewards_trigger ON public.comments;
CREATE TRIGGER comments_rewards_trigger
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.handle_comment_rewards();

