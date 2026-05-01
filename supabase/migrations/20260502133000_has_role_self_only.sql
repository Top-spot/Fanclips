-- has_role is SECURITY DEFINER and previously allowed any authenticated caller to test
-- arbitrary user_ids for role membership, bypassing user_roles SELECT RLS (admin probing).
-- All policies and RPC guards in this repo use has_role(auth.uid(), ...).

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (_user_id IS NOT DISTINCT FROM auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
