-- Idempotent +50 pts for a clip upload (fallback if process-clip-ai is down or fails).
-- SECURITY DEFINER so we can write points_transactions without a client INSERT policy.
CREATE OR REPLACE FUNCTION public.claim_clip_upload_points(p_clip_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
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
    RETURN json_build_object('ok', true, 'already_claimed', true);
  END IF;

  INSERT INTO public.points_transactions (user_id, amount, reason, reference_id)
  VALUES (auth.uid(), 50, 'Clip uploaded', p_clip_id);

  PERFORM public.increment_points(auth.uid(), 50);

  RETURN json_build_object('ok', true, 'points', 50);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_clip_upload_points(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_clip_upload_points(uuid) TO authenticated;

-- increment_points should only be callable server-side (edge functions use service_role).
REVOKE ALL ON FUNCTION public.increment_points(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_points(uuid, integer) TO service_role;
