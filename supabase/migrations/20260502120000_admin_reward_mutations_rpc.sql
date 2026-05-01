-- Admin reward catalog / rules mutations via SECURITY DEFINER RPCs.
-- Ensures saves work reliably for users with admin role even if direct-table RLS
-- or PostgREST row visibility would otherwise block updates.

CREATE OR REPLACE FUNCTION public.admin_update_reward_rule(
  p_key text,
  p_label text,
  p_description text,
  p_points_value integer,
  p_enabled boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_key IS NULL OR btrim(p_key) = '' THEN
    RAISE EXCEPTION 'Invalid key';
  END IF;

  IF p_label IS NULL OR btrim(p_label) = '' THEN
    RAISE EXCEPTION 'Label is required';
  END IF;

  UPDATE public.reward_rules
  SET
    label = btrim(p_label),
    description = NULLIF(btrim(COALESCE(p_description, '')), ''),
    points_value = GREATEST(0, COALESCE(p_points_value, 0)),
    enabled = COALESCE(p_enabled, true),
    updated_at = now()
  WHERE key = p_key;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Rule not found';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_reward(
  p_id uuid,
  p_name text,
  p_description text,
  p_points_cost integer,
  p_category text,
  p_active boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Invalid reward id';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Reward name is required';
  END IF;

  IF p_category IS NULL OR btrim(p_category) = '' THEN
    RAISE EXCEPTION 'Category is required';
  END IF;

  UPDATE public.rewards
  SET
    name = btrim(p_name),
    description = NULLIF(btrim(COALESCE(p_description, '')), ''),
    points_cost = GREATEST(1, COALESCE(p_points_cost, 1)),
    category = btrim(p_category),
    active = COALESCE(p_active, true)
  WHERE id = p_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'Reward not found';
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_reward(
  p_name text,
  p_description text,
  p_points_cost integer,
  p_category text,
  p_active boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Reward name is required';
  END IF;

  IF p_category IS NULL OR btrim(p_category) = '' THEN
    RAISE EXCEPTION 'Category is required';
  END IF;

  INSERT INTO public.rewards (name, description, points_cost, category, active)
  VALUES (
    btrim(p_name),
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    GREATEST(1, COALESCE(p_points_cost, 1)),
    btrim(p_category),
    COALESCE(p_active, true)
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_reward_rule(text, text, text, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_reward_rule(text, text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_reward_rule(text, text, text, integer, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_reward(uuid, text, text, integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_reward(uuid, text, text, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_reward(uuid, text, text, integer, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_create_reward(text, text, integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_reward(text, text, integer, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_reward(text, text, integer, text, boolean) TO service_role;
