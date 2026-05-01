-- Rewards integrity hardening:
-- 1) add upload reward rule seed if missing
-- 2) enforce idempotent upload claims at DB level
-- 3) atomically redeem rewards (single transaction path)

INSERT INTO public.reward_rules (key, label, description, points_value, enabled)
VALUES ('upload', 'Clip Upload', 'Points earned when uploading a clip', 50, true)
ON CONFLICT (key) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS ux_points_transactions_clip_uploaded_once
ON public.points_transactions (user_id, reference_id, reason)
WHERE reason = 'Clip uploaded';

CREATE OR REPLACE FUNCTION public.claim_clip_upload_points(p_clip_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_points integer := GREATEST(0, COALESCE(public.reward_rule_points('upload'), 50));
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT c.user_id INTO v_owner FROM public.clips c WHERE c.id = p_clip_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'clip_not_found');
  END IF;
  IF v_owner <> auth.uid() THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.points_transactions pt
    WHERE pt.user_id = auth.uid()
      AND pt.reference_id = p_clip_id
      AND pt.reason = 'Clip uploaded'
  ) THEN
    RETURN json_build_object('ok', true, 'already_claimed', true, 'points', 0);
  END IF;

  INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
  VALUES (auth.uid(), v_points, 'Clip uploaded', p_clip_id);

  PERFORM public.increment_points(auth.uid(), v_points);

  RETURN json_build_object('ok', true, 'points', v_points);
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_reward_atomic(p_reward_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cost integer;
  v_name text;
  v_balance integer;
  v_new_balance integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT points_cost, name
  INTO v_cost, v_name
  FROM public.rewards
  WHERE id = p_reward_id
    AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reward not found or inactive';
  END IF;

  SELECT points_balance
  INTO v_balance
  FROM public.profiles
  WHERE user_id = v_uid
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_balance < v_cost THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  v_new_balance := v_balance - v_cost;

  UPDATE public.profiles
  SET points_balance = v_new_balance
  WHERE user_id = v_uid;

  INSERT INTO public.reward_redemptions (user_id, reward_id, points_spent)
  VALUES (v_uid, p_reward_id, v_cost);

  INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
  VALUES (v_uid, -v_cost, 'Reward redeemed: ' || v_name, p_reward_id);

  RETURN json_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'reward_name', v_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_reward_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_reward_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_reward_atomic(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_rewards_overview()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance integer := 0;
  v_ledger_total bigint := 0;
  v_total_earned bigint := 0;
  v_total_spent bigint := 0;
  v_tx_count bigint := 0;
  v_redemptions bigint := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(points_balance, 0)
  INTO v_balance
  FROM public.profiles
  WHERE user_id = v_uid;

  SELECT
    COALESCE(SUM(amount), 0),
    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0),
    COUNT(*)
  INTO v_ledger_total, v_total_earned, v_total_spent, v_tx_count
  FROM public.points_transactions
  WHERE user_id = v_uid;

  SELECT COUNT(*)
  INTO v_redemptions
  FROM public.reward_redemptions
  WHERE user_id = v_uid;

  RETURN json_build_object(
    'balance', v_balance,
    'ledger_total', v_ledger_total,
    'total_earned', v_total_earned,
    'total_spent', v_total_spent,
    'transactions_count', v_tx_count,
    'redemptions_count', v_redemptions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_rewards_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_rewards_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_rewards_overview() TO service_role;

CREATE OR REPLACE FUNCTION public.get_admin_rewards_overview()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_users bigint := 0;
  v_total_tx bigint := 0;
  v_total_earned bigint := 0;
  v_total_spent bigint := 0;
  v_total_redemptions bigint := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(*) INTO v_total_users FROM public.profiles;

  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0)
  INTO v_total_tx, v_total_earned, v_total_spent
  FROM public.points_transactions;

  SELECT COUNT(*) INTO v_total_redemptions FROM public.reward_redemptions;

  RETURN json_build_object(
    'users_count', v_total_users,
    'transactions_count', v_total_tx,
    'total_earned', v_total_earned,
    'total_spent', v_total_spent,
    'total_redemptions', v_total_redemptions
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_rewards_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_rewards_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_rewards_overview() TO service_role;
