-- Points gifting and star transfers between users

CREATE OR REPLACE FUNCTION public.transfer_points(
  p_to_user_id UUID,
  p_amount INTEGER,
  p_kind TEXT DEFAULT 'gift',
  p_message TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_user_id UUID := auth.uid();
  v_from_balance INTEGER;
  v_to_exists BOOLEAN;
  v_reason_from TEXT;
  v_reason_to TEXT;
  v_note TEXT;
BEGIN
  IF v_from_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_to_user_id IS NULL OR p_to_user_id = v_from_user_id THEN
    RAISE EXCEPTION 'Invalid recipient';
  END IF;

  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 5000 THEN
    RAISE EXCEPTION 'Amount must be between 1 and 5000';
  END IF;

  SELECT points_balance INTO v_from_balance
  FROM public.profiles
  WHERE user_id = v_from_user_id
  FOR UPDATE;

  IF v_from_balance IS NULL THEN
    RAISE EXCEPTION 'Sender profile not found';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = p_to_user_id
  ) INTO v_to_exists;

  IF NOT v_to_exists THEN
    RAISE EXCEPTION 'Recipient profile not found';
  END IF;

  IF v_from_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  UPDATE public.profiles
  SET points_balance = points_balance - p_amount
  WHERE user_id = v_from_user_id;

  UPDATE public.profiles
  SET points_balance = points_balance + p_amount
  WHERE user_id = p_to_user_id;

  v_reason_from := CASE
    WHEN p_kind = 'star' THEN 'Star sent'
    ELSE 'Gift sent'
  END;
  v_reason_to := CASE
    WHEN p_kind = 'star' THEN 'Star received'
    ELSE 'Gift received'
  END;
  v_note := NULLIF(trim(COALESCE(p_message, '')), '');

  INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
  VALUES
    (v_from_user_id, -p_amount, v_reason_from, p_to_user_id),
    (p_to_user_id, p_amount, v_reason_to, v_from_user_id);

  INSERT INTO public.notifications (user_id, type, message, reference_id, read)
  VALUES (
    p_to_user_id,
    CASE WHEN p_kind = 'star' THEN 'star' ELSE 'gift' END,
    CASE
      WHEN p_kind = 'star' THEN format('You received %s points as stars%s', p_amount, COALESCE(' - ' || v_note, ''))
      ELSE format('You received a %s-point gift%s', p_amount, COALESCE(' - ' || v_note, ''))
    END,
    v_from_user_id,
    false
  );

  RETURN json_build_object('success', true, 'amount', p_amount, 'kind', p_kind);
END;
$$;
