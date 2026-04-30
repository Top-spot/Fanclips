

# Fix Upload, Build Comments, Notifications, and Clip Detail Page

## Problems Found

1. **Upload silently fails** -- The storage upload itself works (RLS policies are correct), but the `process-clip-ai` edge function sets clip status to `"live"` only after AI processing completes. If the function errors or times out, clips stay stuck in `"processing"` and never appear in the feed.

2. **Home feed query is broken** -- The feed query joins `clips` to `profiles` using `profiles!inner(...)`, but there is NO foreign key between `clips` and `profiles`. The FK goes from `clips.user_id` to `auth.users.id`, not to `profiles`. This causes a 400 error ("Could not find a relationship between clips and profiles"), so **the feed shows nothing**.

3. **Missing features** -- Comments, notifications, and a dedicated clip detail page (for shared links like `/?clip=123`) do not exist yet.

---

## Plan

### 1. Database Migration

**Add foreign key and new tables:**

- Add a FK from `clips.user_id` to `profiles.user_id` so the feed join query works (profiles.user_id already mirrors auth.users.id via the signup trigger)
- Add a unique constraint on `profiles.user_id` first (required for FK target)
- Create `comments` table (id, clip_id FK, user_id, content, created_at) with RLS
- Create `notifications` table (id, user_id, type, message, reference_id, read, created_at) with RLS
- Enable realtime on `comments` and `notifications` tables
- Add RLS policies:
  - Comments: everyone can read, authenticated users can insert their own, users can delete their own
  - Notifications: users can only read/update their own

### 2. Fix the Edge Function (`process-clip-ai`)

- Set clip status to `"live"` immediately on insert (so it appears in feed even before AI finishes), then update with AI content after
- OR change the upload flow to insert with `status: "live"` directly and let the edge function only update AI fields
- Add notification creation when someone likes a clip or comments on it

### 3. Fix HomeFeed Query

- After the FK is added, the `profiles!inner(username, avatar_url, team)` join will work
- Add video playback support (currently only shows thumbnails/placeholder)
- Show comment count on each clip card
- Handle the `?clip=` query parameter to open a specific clip

### 4. Create Clip Detail Page (`/clip/:id`)

- New route in App.tsx: `/clip/:id`
- Full-screen clip view with video player, title, caption, user info
- Like button, share button, comment section
- This is the destination for shared links

### 5. Build Comments Component

- Comment list with user avatars and usernames
- Comment input field (requires auth)
- Real-time updates via database subscriptions
- Creating a comment also creates a notification for the clip owner

### 6. Build Notifications System

- Notification bell icon in the feed header showing unread count
- Notification list page/drawer
- Types: "like" (someone liked your clip), "comment" (someone commented), "featured" (clip was featured)
- Tapping a notification navigates to the relevant clip detail page
- Mark as read on tap

### 7. Update Upload Flow

- Insert clips with `status: "live"` so they appear immediately
- Edge function updates AI fields in the background
- Better error handling with clear toast messages

---

## Technical Details

### Database Migration SQL (summary)

```text
-- Unique constraint on profiles.user_id (needed for FK target)
ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);

-- FK from clips to profiles
ALTER TABLE clips ADD CONSTRAINT clips_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE;

-- Comments table
CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- + RLS policies

-- Notifications table  
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,        -- 'like', 'comment', 'featured'
  message text NOT NULL,
  reference_id uuid,         -- clip_id to navigate to
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- + RLS policies

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE comments;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

### Files to Create
- `src/pages/ClipDetail.tsx` -- Full clip view with comments
- `src/components/CommentSection.tsx` -- Comment list + input
- `src/components/NotificationBell.tsx` -- Bell icon with unread badge
- `src/components/NotificationsDrawer.tsx` -- Notification list

### Files to Modify
- `src/App.tsx` -- Add `/clip/:id` route
- `src/components/HomeFeed.tsx` -- Fix query, add comment count, handle `?clip=` param, add video playback
- `src/components/UploadPage.tsx` -- Set status to "live" on insert
- `supabase/functions/process-clip-ai/index.ts` -- Only update AI fields (don't change status), create notification
- `src/pages/Index.tsx` -- Add notification bell to header area

