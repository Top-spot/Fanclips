-- Seed 3 short sports videos for feed/video playback testing.
-- This only runs when at least one profile exists.
WITH seed_owner AS (
  SELECT user_id
  FROM public.profiles
  ORDER BY created_at
  LIMIT 1
),
seed_rows AS (
  SELECT
    seed_owner.user_id,
    v.title,
    v.caption,
    v.section_tag,
    v.game_tag,
    v.video_url,
    v.thumbnail_url
  FROM seed_owner
  CROSS JOIN (
    VALUES
      (
        'Test Clip: Quick Football Counter',
        'Seeded YouTube test video for playback and embed validation.',
        'Sec 101',
        'Football Highlight',
        'https://www.youtube.com/watch?v=UvcWSOQjiG4',
        'https://i.ytimg.com/vi/UvcWSOQjiG4/hqdefault.jpg'
      ),
      (
        'Test Clip: Derby Match Winner',
        'Seeded YouTube test video for playback and embed validation.',
        'Sec 114',
        'Football Highlight',
        'https://www.youtube.com/watch?v=jr6VcG6wX2A',
        'https://i.ytimg.com/vi/jr6VcG6wX2A/hqdefault.jpg'
      ),
      (
        'Test Clip: Bundesliga Thriller',
        'Seeded YouTube test video for playback and embed validation.',
        'Sec 203',
        'Soccer Highlight',
        'https://www.youtube.com/watch?v=ZDbZ9xssHCI',
        'https://i.ytimg.com/vi/ZDbZ9xssHCI/hqdefault.jpg'
      )
  ) AS v(title, caption, section_tag, game_tag, video_url, thumbnail_url)
)
INSERT INTO public.clips (
  user_id,
  title,
  caption,
  section_tag,
  game_tag,
  video_url,
  thumbnail_url,
  status,
  ai_processed,
  likes_count
)
SELECT
  s.user_id,
  s.title,
  s.caption,
  s.section_tag,
  s.game_tag,
  s.video_url,
  s.thumbnail_url,
  'live'::public.clip_status,
  false,
  0
FROM seed_rows s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.clips c
  WHERE c.title = s.title
);
