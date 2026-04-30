
-- ============================================================
-- FanCam Full Schema Migration
-- ============================================================

-- 1. Role Enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'fan');

-- 2. Clip status enum
CREATE TYPE public.clip_status AS ENUM ('processing', 'live', 'featured', 'rejected');

-- 3. Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  avatar_url TEXT,
  team TEXT,
  section TEXT,
  points_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- 4. User roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Security definer function to check roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Clips table
CREATE TABLE public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  caption TEXT,
  section_tag TEXT,
  game_tag TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  status clip_status NOT NULL DEFAULT 'processing',
  ai_processed BOOLEAN NOT NULL DEFAULT false,
  ai_title TEXT,
  ai_caption TEXT,
  likes_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clips are viewable by everyone" ON public.clips FOR SELECT USING (true);
CREATE POLICY "Users can insert own clips" ON public.clips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clips" ON public.clips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clips" ON public.clips FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can update any clip" ON public.clips FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- 6. Clip likes table
CREATE TABLE public.clip_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clip_id, user_id)
);

ALTER TABLE public.clip_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone" ON public.clip_likes FOR SELECT USING (true);
CREATE POLICY "Users can insert own likes" ON public.clip_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own likes" ON public.clip_likes FOR DELETE USING (auth.uid() = user_id);

-- 7. Rewards catalog
CREATE TABLE public.rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rewards are viewable by everyone" ON public.rewards FOR SELECT USING (true);
CREATE POLICY "Admins can manage rewards" ON public.rewards FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 8. Reward redemptions
CREATE TABLE public.reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  points_spent INTEGER NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemptions" ON public.reward_redemptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own redemptions" ON public.reward_redemptions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 9. Points transactions
CREATE TABLE public.points_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.points_transactions FOR SELECT USING (auth.uid() = user_id);

-- 10. Storage bucket for clips and avatars
INSERT INTO storage.buckets (id, name, public) VALUES ('clips', 'clips', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('thumbnails', 'thumbnails', true);

-- Storage policies
CREATE POLICY "Clips are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'clips');
CREATE POLICY "Users can upload clips" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'clips' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own clips" ON storage.objects FOR UPDATE USING (bucket_id = 'clips' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own clips" ON storage.objects FOR DELETE USING (bucket_id = 'clips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Avatars are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Thumbnails are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'thumbnails');
CREATE POLICY "Users can upload thumbnails" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'thumbnails' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 11. Auto-update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clips_updated_at BEFORE UPDATE ON public.clips FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'fan');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 13. Seed sample rewards
INSERT INTO public.rewards (name, description, points_cost, category) VALUES
  ('$5 Concession Credit', 'Redeem at any stadium food stand', 500, 'food'),
  ('10% Merch Discount', 'Save on official team merchandise', 750, 'merch'),
  ('Field Access Raffle Entry', 'Enter to win field access after the game', 1000, 'experience'),
  ('Free Drink Voucher', 'One free drink at any concession', 300, 'food'),
  ('Team Signed Photo', 'A randomly selected signed player photo', 2000, 'merch'),
  ('Suite Upgrade Raffle', 'Enter to win a luxury suite upgrade', 5000, 'experience');
