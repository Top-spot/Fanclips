export interface DemoClip {
  id: string;
  title: string;
  caption: string;
  section_tag: string;
  game_tag: string;
  thumbnail_url: string;
  video_url: string;
  likes_count: number;
  ai_processed: boolean;
  ai_title: string;
  ai_caption: string;
  status: "live";
  created_at: string;
  user_id: string;
  is_hidden: boolean;
}

export const DEMO_CLIPS: DemoClip[] = [
  {
    id: "demo-clip-1",
    title: "Test Clip: Quick Football Counter",
    caption: "Demo sports clip for playback testing.",
    section_tag: "Sec 101",
    game_tag: "Football Highlight",
    thumbnail_url: "https://i.ytimg.com/vi/UvcWSOQjiG4/hqdefault.jpg",
    video_url: "https://www.youtube.com/watch?v=UvcWSOQjiG4",
    likes_count: 18,
    ai_processed: true,
    ai_title: "Counter Attack in Two Touches",
    ai_caption: "Fast transition and a clinical finish.",
    status: "live",
    created_at: "2026-04-28T18:00:00.000Z",
    user_id: "demo-user",
    is_hidden: false,
  },
  {
    id: "demo-clip-2",
    title: "Test Clip: Derby Match Winner",
    caption: "Demo sports clip for playback testing.",
    section_tag: "Sec 114",
    game_tag: "Football Highlight",
    thumbnail_url: "https://i.ytimg.com/vi/jr6VcG6wX2A/hqdefault.jpg",
    video_url: "https://www.youtube.com/watch?v=jr6VcG6wX2A",
    likes_count: 24,
    ai_processed: true,
    ai_title: "Late Header Seals the Derby",
    ai_caption: "Set-piece delivery and perfect timing.",
    status: "live",
    created_at: "2026-04-28T18:01:00.000Z",
    user_id: "demo-user",
    is_hidden: false,
  },
  {
    id: "demo-clip-3",
    title: "Test Clip: Bundesliga Thriller",
    caption: "Demo sports clip for playback testing.",
    section_tag: "Sec 203",
    game_tag: "Soccer Highlight",
    thumbnail_url: "https://i.ytimg.com/vi/ZDbZ9xssHCI/hqdefault.jpg",
    video_url: "https://www.youtube.com/watch?v=ZDbZ9xssHCI",
    likes_count: 31,
    ai_processed: true,
    ai_title: "End-to-End Five-Goal Thriller",
    ai_caption: "Big chances, late drama, huge finish.",
    status: "live",
    created_at: "2026-04-28T18:02:00.000Z",
    user_id: "demo-user",
    is_hidden: false,
  },
];
