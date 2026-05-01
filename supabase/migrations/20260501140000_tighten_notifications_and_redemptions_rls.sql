-- Hardening: remove client-forgeable INSERT paths.
--
-- Notifications are created by SECURITY DEFINER triggers/RPCs (table owner bypasses RLS).
-- Authenticated users must not be able to INSERT arbitrary rows into other users' inboxes.
--
-- Reward redemptions must only be created by SECURITY DEFINER redemption logic so the
-- points ledger and redemption rows stay consistent.

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;

DROP POLICY IF EXISTS "Users can insert own redemptions" ON public.reward_redemptions;
