
-- ============================================================
-- 1. DROP ALL EXISTING RESTRICTIVE RLS POLICIES
-- ============================================================

-- clip_likes
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.clip_likes;
DROP POLICY IF EXISTS "Users can delete own likes" ON public.clip_likes;
DROP POLICY IF EXISTS "Users can insert own likes" ON public.clip_likes;

-- clips
DROP POLICY IF EXISTS "Admins can update any clip" ON public.clips;
DROP POLICY IF EXISTS "Clips are viewable by everyone" ON public.clips;
DROP POLICY IF EXISTS "Users can delete own clips" ON public.clips;
DROP POLICY IF EXISTS "Users can insert own clips" ON public.clips;
DROP POLICY IF EXISTS "Users can update own clips" ON public.clips;

-- comments
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can insert own comments" ON public.comments;

-- notifications
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;

-- points_transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.points_transactions;

-- profiles
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- rewards
DROP POLICY IF EXISTS "Admins can manage rewards" ON public.rewards;
DROP POLICY IF EXISTS "Rewards are viewable by everyone" ON public.rewards;

-- reward_redemptions
DROP POLICY IF EXISTS "Users can insert own redemptions" ON public.reward_redemptions;
DROP POLICY IF EXISTS "Users can view own redemptions" ON public.reward_redemptions;

-- user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;

-- ============================================================
-- 2. RECREATE ALL POLICIES AS PERMISSIVE
-- ============================================================

-- clip_likes
CREATE POLICY "Likes are viewable by everyone" ON public.clip_likes FOR SELECT USING (true);
CREATE POLICY "Users can insert own likes" ON public.clip_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own likes" ON public.clip_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- clips
CREATE POLICY "Clips are viewable by everyone" ON public.clips FOR SELECT USING (true);
CREATE POLICY "Users can insert own clips" ON public.clips FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clips" ON public.clips FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can update any clip" ON public.clips FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can delete own clips" ON public.clips FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- comments
CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Users can insert own comments" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.comments FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- notifications (no direct client INSERT — only via SECURITY DEFINER functions)
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- points_transactions (no direct client INSERT — only via SECURITY DEFINER functions)
CREATE POLICY "Users can view own transactions" ON public.points_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- profiles
CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- rewards
CREATE POLICY "Rewards are viewable by everyone" ON public.rewards FOR SELECT USING (true);
CREATE POLICY "Admins can manage rewards" ON public.rewards FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- reward_redemptions (no direct client INSERT — only via edge function with service role)
CREATE POLICY "Users can view own redemptions" ON public.reward_redemptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- user_roles (no direct client INSERT — only via trigger)
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 3. CREATE SECURITY DEFINER FUNCTIONS
-- ============================================================

-- notify_comment: safely creates a notification for the clip owner when someone comments
CREATE OR REPLACE FUNCTION public.notify_comment(p_clip_id uuid, p_commenter_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clip_owner uuid;
BEGIN
  SELECT user_id INTO v_clip_owner FROM public.clips WHERE id = p_clip_id;
  IF v_clip_owner IS NULL OR v_clip_owner = auth.uid() THEN
    RETURN;
  END IF;
  INSERT INTO public.notifications (user_id, type, message, reference_id)
  VALUES (v_clip_owner, 'comment', '@' || COALESCE(p_commenter_username, 'someone') || ' commented on your clip 💬', p_clip_id);
END;
$$;

-- award_upload_points: safely awards points for uploading a clip
CREATE OR REPLACE FUNCTION public.award_upload_points(p_clip_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_already_awarded boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  -- Verify the clip belongs to the caller
  IF NOT EXISTS (SELECT 1 FROM public.clips WHERE id = p_clip_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'Clip not owned by caller';
  END IF;
  -- Prevent double-awarding
  SELECT EXISTS (
    SELECT 1 FROM public.points_transactions
    WHERE user_id = v_user_id AND reference_id = p_clip_id AND reason = 'Clip uploaded'
  ) INTO v_already_awarded;
  IF v_already_awarded THEN
    RETURN;
  END IF;
  UPDATE public.profiles SET points_balance = points_balance + 50 WHERE user_id = v_user_id;
  INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
  VALUES (v_user_id, 50, 'Clip uploaded', p_clip_id);
END;
$$;

-- redeem_reward_atomic: atomic reward redemption preventing race conditions
CREATE OR REPLACE FUNCTION public.redeem_reward_atomic(p_reward_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_reward record;
  v_balance integer;
  v_new_balance integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'Not authenticated');
  END IF;

  -- Lock the profile row to prevent concurrent redemptions
  SELECT points_balance INTO v_balance
  FROM public.profiles
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN json_build_object('error', 'Profile not found');
  END IF;

  SELECT * INTO v_reward FROM public.rewards WHERE id = p_reward_id AND active = true;
  IF v_reward IS NULL THEN
    RETURN json_build_object('error', 'Reward not found or inactive');
  END IF;

  IF v_balance < v_reward.points_cost THEN
    RETURN json_build_object('error', 'Insufficient points', 'balance', v_balance, 'cost', v_reward.points_cost);
  END IF;

  v_new_balance := v_balance - v_reward.points_cost;

  UPDATE public.profiles SET points_balance = v_new_balance WHERE user_id = v_user_id;

  INSERT INTO public.reward_redemptions (user_id, reward_id, points_spent)
  VALUES (v_user_id, v_reward.id, v_reward.points_cost);

  INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
  VALUES (v_user_id, -v_reward.points_cost, 'Redeemed: ' || v_reward.name, v_reward.id);

  RETURN json_build_object('success', true, 'new_balance', v_new_balance, 'reward_name', v_reward.name);
END;
$$;
