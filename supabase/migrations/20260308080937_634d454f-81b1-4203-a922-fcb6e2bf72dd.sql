
-- user_preferences: stores which sports each user follows
CREATE TABLE public.user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sport text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sport)
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own preferences" ON public.user_preferences FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- user_followed_teams: stores which teams/schools each user follows
CREATE TABLE public.user_followed_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  team_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, team_name)
);
ALTER TABLE public.user_followed_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own followed teams" ON public.user_followed_teams FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own followed teams" ON public.user_followed_teams FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own followed teams" ON public.user_followed_teams FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- clip_views: track views for engagement scoring
CREATE TABLE public.clip_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clip_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert views" ON public.clip_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Views are readable" ON public.clip_views FOR SELECT USING (true);
