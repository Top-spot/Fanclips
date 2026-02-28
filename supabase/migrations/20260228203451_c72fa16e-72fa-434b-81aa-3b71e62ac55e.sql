-- FK from comments.user_id to profiles.user_id so PostgREST join works
ALTER TABLE public.comments ADD CONSTRAINT comments_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;