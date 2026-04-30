-- Fix notifications INSERT policy: restrict to service_role only (used by SECURITY DEFINER functions)
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;

-- Recreate with service_role restriction - notifications are only inserted by 
-- SECURITY DEFINER functions (toggle_clip_like) or authenticated users for comments
CREATE POLICY "Authenticated users can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add index for faster notification queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, read);

-- Add index for faster comment queries  
CREATE INDEX IF NOT EXISTS idx_comments_clip_id ON public.comments(clip_id);

-- Add index for faster clip_likes lookups
CREATE INDEX IF NOT EXISTS idx_clip_likes_user_clip ON public.clip_likes(user_id, clip_id);

-- Add index for clips by user
CREATE INDEX IF NOT EXISTS idx_clips_user_status ON public.clips(user_id, status);

-- Add index for clips feed ordering
CREATE INDEX IF NOT EXISTS idx_clips_status_created ON public.clips(status, created_at DESC);