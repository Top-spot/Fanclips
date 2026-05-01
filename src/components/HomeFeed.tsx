import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Heart, MapPin, Play, Share2, MessageCircle, Search, Repeat2, SlidersHorizontal, X, BadgeCheck, Volume2, VolumeX, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { getYouTubeEmbedUrl } from "@/lib/video";
import { DEMO_CLIPS } from "@/lib/demoClips";
import { mergeFeedPreferences } from "@/lib/feedPreferences";
import { CHANNELS, loadFollowedChannels } from "@/lib/channels";
import { listLiveClips, repostClip, toggleClipLike } from "@/services/clipsService";
import CommentSection from "@/components/CommentSection";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import NotificationBell from "@/components/NotificationBell";
import NotificationsPopover from "@/components/NotificationsPopover";

const QUICK_SPORT_FILTERS = [
  { label: "Football", query: "Football", icon: "🏈" },
  { label: "Basketball", query: "Basketball", icon: "🏀" },
  { label: "Soccer", query: "Soccer", icon: "⚽" },
  { label: "Baseball", query: "Baseball", icon: "⚾" },
  { label: "Tennis", query: "Tennis", icon: "🎾" },
  { label: "Hockey", query: "Hockey", icon: "🏒" },
  { label: "MMA", query: "MMA", icon: "🥊" },
  { label: "Highlights", query: "Highlights", icon: "🔥" },
  { label: "Cricket", query: "Cricket", icon: "🏏" },
  { label: "Volleyball", query: "Volleyball", icon: "🏐" },
];
const FEED_VOLUME_LEVEL_KEY = "fanclips_feed_volume_level";
const VOLUME_PRESETS = [0, 0.25, 0.5, 0.75, 1];

interface ClipProfile {
  username: string;
  avatar_url: string | null;
  team: string | null;
  is_private?: boolean;
}

interface Clip {
  id: string;
  title: string;
  caption: string | null;
  section_tag: string | null;
  game_tag: string | null;
  thumbnail_url: string | null;
  video_url: string | null;
  likes_count: number;
  ai_processed: boolean;
  ai_title: string | null;
  ai_caption: string | null;
  status: string;
  created_at: string;
  is_hidden: boolean;
  user_id: string;
  profiles: ClipProfile | null;
  liked: boolean;
  comment_count: number;
  repost_count: number;
  is_demo?: boolean;
  reposted?: boolean;
}

export default function HomeFeed({
  onWatchModeChange,
}: {
  onWatchModeChange?: (isWatching: boolean) => void;
}) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [feedMode, setFeedMode] = useState<"all" | "friends">("all");
  const [watchingClip, setWatchingClip] = useState<Clip | null>(null);
  const [chatClip, setChatClip] = useState<Clip | null>(null);
  const [shareClip, setShareClip] = useState<Clip | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [topMenuVisible, setTopMenuVisible] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [followedChannelIds, setFollowedChannelIds] = useState<string[]>([]);
  const { user, profile, refreshProfile } = useAuth();
  const feedPrefs = useMemo(() => mergeFeedPreferences(profile, user?.id), [profile, user?.id]);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const openWatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOpenClipIdRef = useRef<string | null>(null);
  const firstTapRef = useRef(0);
  const modalsOpenRef = useRef(false);
  const [burstClipId, setBurstClipId] = useState<string | null>(null);
  const [watchDragY, setWatchDragY] = useState(0);
  const watchTouchRef = useRef({ startY: 0, active: false });
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(FEED_VOLUME_LEVEL_KEY);
      if (!raw) return 0;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return 0;
      return Math.max(0, Math.min(1, parsed));
    } catch {
      return 0;
    }
  });
  const [isVolumeMenuOpen, setIsVolumeMenuOpen] = useState(false);
  const volumeMenuRef = useRef<HTMLDivElement | null>(null);
  const [chatDragY, setChatDragY] = useState(0);
  const chatTouchRef = useRef({ startY: 0, active: false });
  const { toast } = useToast();
  const isMuted = volumeLevel <= 0;

  useEffect(() => {
    if (!user) {
      setFollowedChannelIds([]);
      return;
    }
    setFollowedChannelIds(loadFollowedChannels(user.id));
  }, [user]);

  useEffect(() => {
    if (audioUnlocked) return;
    const unlock = () => setAudioUnlocked(true);
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [audioUnlocked]);

  useEffect(() => {
    localStorage.setItem(FEED_VOLUME_LEVEL_KEY, String(volumeLevel));
    Object.values(videoRefs.current).forEach((video) => {
      if (!video) return;
      video.volume = volumeLevel;
      video.muted = isMuted || !audioUnlocked;
    });
  }, [volumeLevel, isMuted, audioUnlocked]);

  useEffect(() => {
    if (!isVolumeMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (volumeMenuRef.current && !volumeMenuRef.current.contains(target)) {
        setIsVolumeMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [isVolumeMenuOpen]);

  useEffect(() => {
    setIsVolumeMenuOpen(false);
  }, [activeClipId]);

  const fetchClips = useCallback(async () => {
    setLoading(true);
    try {
      const clipsResult = await listLiveClips(50);
      if (clipsResult.error) throw new Error(clipsResult.error);
      const data = clipsResult.data;
      if (data.length === 0) {
        setClips(
          DEMO_CLIPS.map((c) => ({
            ...c,
            profiles: { username: "fancam_demo", avatar_url: null, team: "Demo Feed" },
            liked: false,
            comment_count: 0,
            repost_count: 0,
            is_demo: true,
            reposted: false,
          }))
        );
        setLoading(false);
        return;
      }

      let likedIds: string[] = [];
      let repostedIds = new Set<string>();
      if (user) {
        const { data: likes } = await supabase
          .from("clip_likes")
          .select("clip_id")
          .eq("user_id", user.id);
        likedIds = likes?.map((l) => l.clip_id) ?? [];
        const { data: reps, error: repErr } = await supabase
          .from("clip_reposts")
          .select("clip_id")
          .eq("user_id", user.id);
        if (!repErr && reps) repostedIds = new Set(reps.map((r) => r.clip_id));
      }

      // Fetch comment counts
      const clipIds = data.map((c: { id: string }) => c.id);
      const commentCounts: Record<string, number> = {};
      const repostCounts: Record<string, number> = {};
      if (clipIds.length > 0) {
        const { data: counts } = await supabase
          .from("comments")
          .select("clip_id")
          .in("clip_id", clipIds);
        counts?.forEach((c) => {
          commentCounts[c.clip_id] = (commentCounts[c.clip_id] || 0) + 1;
        });
        const { data: repostRows } = await supabase
          .from("clip_reposts")
          .select("clip_id")
          .in("clip_id", clipIds);
        repostRows?.forEach((r) => {
          repostCounts[r.clip_id] = (repostCounts[r.clip_id] || 0) + 1;
        });
      }

      const rows = data as unknown as Array<{
        id: string; title: string; caption: string | null; section_tag: string | null;
        game_tag: string | null; thumbnail_url: string | null; video_url: string | null;
        likes_count: number; ai_processed: boolean; ai_title: string | null;
        ai_caption: string | null; status: string; created_at: string; user_id: string; is_hidden: boolean;
      }>;

      const profileMap = new Map<string, ClipProfile>();
      const following = new Set<string>();
      if (user) {
        const { data: follows, error: followsErr } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id);
        if (!followsErr) {
          follows?.forEach((f) => {
            following.add(f.following_id);
          });
        } else {
          // Fallback for environments where follows migration is not applied yet.
          const { data: friendships } = await supabase
            .from("friendships")
            .select("addressee_id, status")
            .eq("status", "accepted")
            .eq("requester_id", user.id);
          friendships?.forEach((f) => {
            following.add(f.addressee_id);
          });
        }
      }

      const userIds = [...new Set(rows.map((c) => c.user_id))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, username, avatar_url, team, is_private")
          .in("user_id", userIds);
        profiles?.forEach((p) => {
          profileMap.set(p.user_id, {
            username: p.username,
            avatar_url: p.avatar_url,
            team: p.team,
            is_private: p.is_private,
          });
        });
      }

      const mappedAll: Clip[] = rows
        .filter((c) => {
          const profile = profileMap.get(c.user_id);
          if (!profile?.is_private) return true;
          if (!user) return false;
          return c.user_id === user.id || following.has(c.user_id);
        })
        .map((c) => ({
          ...c,
          profiles: profileMap.get(c.user_id) ?? null,
          liked: likedIds.includes(c.id),
          comment_count: commentCounts[c.id] || 0,
          repost_count: repostCounts[c.id] || 0,
          reposted: repostedIds.has(c.id),
        }));

      const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);
      const followedKeywords = new Set(
        followedChannelIds
          .map((id) => CHANNELS.find((channel) => channel.id === id))
          .filter((channel): channel is (typeof CHANNELS)[number] => Boolean(channel))
          .flatMap((channel) => channel.keywords.map((k) => k.toLowerCase()))
      );
      const scoreByPreference = (clip: Clip) => {
        const text = `${clip.title} ${clip.caption ?? ""} ${clip.ai_title ?? ""} ${clip.ai_caption ?? ""} ${clip.game_tag ?? ""} ${clip.section_tag ?? ""}`.toLowerCase();
        const sportScore = feedPrefs.preferred_sports.some((s) => text.includes(s.toLowerCase())) ? 2 : 0;
        const teamScore = feedPrefs.preferred_teams.some((s) => text.includes(s.toLowerCase())) ? 1 : 0;
        const locScore = feedPrefs.preferred_locations.some((s) => text.includes(s.toLowerCase())) ? 1 : 0;
        const channelScore =
          followedKeywords.size > 0 &&
          [...followedKeywords].some((keyword) => keyword && text.includes(keyword))
            ? 3
            : 0;
        return sportScore + teamScore + locScore + channelScore;
      };
      const mapped = feedMode === "friends" && user
        ? mappedAll.filter((c) => c.user_id === user.id || following.has(c.user_id))
        : [
            ...mappedAll.filter((c) => c.user_id === user?.id || following.has(c.user_id)),
            ...shuffle(mappedAll.filter((c) => c.user_id !== user?.id && !following.has(c.user_id))),
          ];
      setClips([...mapped].sort((a, b) => scoreByPreference(b) - scoreByPreference(a)));
    } catch {
        setClips(
          DEMO_CLIPS.map((c) => ({
            ...c,
            profiles: { username: "fancam_demo", avatar_url: null, team: "Demo Feed" },
            liked: false,
            comment_count: 0,
            repost_count: 0,
            is_demo: true,
            reposted: false,
          }))
        );
      toast({ title: "Showing demo clips", description: "Live feed is unavailable right now." });
    } finally {
      setLoading(false);
    }
  }, [user, toast, feedMode, feedPrefs, followedChannelIds]);

  useEffect(() => {
    fetchClips();
  }, [fetchClips]);

  useEffect(() => {
    if (clips.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          setActiveClipId(visible[0].target.getAttribute("data-clip-id"));
        }
      },
      { threshold: [0.4, 0.7, 0.9], root: containerRef.current }
    );

    clips.forEach((clip) => {
      const node = cardRefs.current[clip.id];
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [clips]);

  useEffect(() => {
    if (watchingClip) return;
    clips.forEach((clip) => {
      const video = videoRefs.current[clip.id];
      if (!video) return;
      if (clip.id === activeClipId) {
        video.volume = volumeLevel;
        video.muted = isMuted || !audioUnlocked;
        void video.play().catch(async () => {
          // Mobile autoplay policies may block unmuted playback until a gesture.
          video.muted = true;
          await video.play().catch(() => undefined);
        });
      } else {
        video.pause();
      }
    });
  }, [activeClipId, clips, watchingClip, audioUnlocked, isMuted, volumeLevel]);

  const visibleClips = !searchQuery.trim()
    ? clips
    : clips.filter((c) => {
        const q = searchQuery.trim().toLowerCase();
        const isHashtag = q.startsWith("#");
        const combined = `${c.title} ${c.ai_title ?? ""} ${c.caption ?? ""} ${c.ai_caption ?? ""} ${c.game_tag ?? ""} ${c.section_tag ?? ""} ${c.profiles?.username ?? ""}`.toLowerCase();
        if (isHashtag) {
          const tag = q.slice(1);
          return combined.includes(`#${tag}`) || combined.includes(tag);
        }
        return combined.includes(q);
      });

  const handleVideoEnded = (clipId: string) => {
    const index = visibleClips.findIndex((c) => c.id === clipId);
    if (index < 0 || index >= visibleClips.length - 1) return;
    const next = visibleClips[index + 1];
    cardRefs.current[next.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const visibleClipsRef = useRef<Clip[]>([]);
  visibleClipsRef.current = visibleClips;
  const activeClipIdRef = useRef<string | null>(null);
  activeClipIdRef.current = activeClipId;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (modalsOpenRef.current) return;
      if (Math.abs(e.deltaY) < 12) return;
      e.preventDefault();
      const list = visibleClipsRef.current;
      if (list.length < 2) return;
      const curId = activeClipIdRef.current;
      let idx = list.findIndex((c) => c.id === curId);
      if (idx < 0) idx = 0;
      if (e.deltaY > 0 && idx < list.length - 1) {
        const next = list[idx + 1];
        cardRefs.current[next.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (e.deltaY < 0 && idx > 0) {
        const prev = list[idx - 1];
        cardRefs.current[prev.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    // Feed now behaves like TikTok: no separate watch modal state during normal browsing.
    onWatchModeChange?.(false);
  }, [onWatchModeChange]);

  useEffect(() => {
    modalsOpenRef.current = Boolean(watchingClip || chatClip || shareClip);
  }, [watchingClip, chatClip, shareClip]);

  useEffect(() => {
    if (!watchingClip) {
      setWatchDragY(0);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWatchingClip(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [watchingClip]);

  const handleLike = useCallback(
    async (clipId: string) => {
      const targetClip = clips.find((c) => c.id === clipId);
      if (targetClip?.is_demo) {
        toast({ title: "Demo clip", description: "Likes are disabled for demo videos." });
        return;
      }
      if (!user) {
        navigate("/auth");
        return;
      }

      setClips((prev) =>
        prev.map((c) => {
          if (c.id !== clipId) return c;
          const newLiked = !c.liked;
          return { ...c, liked: newLiked, likes_count: c.likes_count + (newLiked ? 1 : -1) };
        })
      );

      const result = await toggleClipLike(clipId, user.id);
      if (result.data) {
        setClips((prev) =>
          prev.map((c) => (c.id === clipId ? { ...c, liked: result.data.liked, likes_count: result.data.likes_count } : c)),
        );
        void refreshProfile();
      } else {
        setClips((prev) =>
          prev.map((c) => {
            if (c.id !== clipId) return c;
            const reverted = !c.liked;
            return { ...c, liked: reverted, likes_count: c.likes_count + (reverted ? 1 : -1) };
          })
        );
        toast({ title: "Like failed, try again", variant: "destructive" });
      }
    },
    [clips, user, navigate, toast, refreshProfile]
  );

  const onFeedVideoTap = useCallback(
    (clip: Clip, event: React.MouseEvent<HTMLDivElement>) => {
      setIsVolumeMenuOpen(false);
      const rect = event.currentTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const nearCenter = Math.abs(event.clientX - centerX) <= 92 && Math.abs(event.clientY - centerY) <= 92;
      if (nearCenter) {
        const video = videoRefs.current[clip.id];
        if (video) {
          if (video.paused) {
            setAudioUnlocked(true);
            video.volume = volumeLevel;
            video.muted = isMuted;
            void video.play().catch(async () => {
              video.muted = true;
              await video.play().catch(() => undefined);
            });
          } else {
            video.pause();
          }
          return;
        }
      }

      const now = Date.now();
      const pending = pendingOpenClipIdRef.current;
      if (pending === clip.id && now - firstTapRef.current < 340) {
        if (openWatchTimerRef.current) {
          clearTimeout(openWatchTimerRef.current);
          openWatchTimerRef.current = null;
        }
        setAudioUnlocked(true);
        pendingOpenClipIdRef.current = null;
        void handleLike(clip.id);
        setBurstClipId(clip.id);
        window.setTimeout(() => setBurstClipId(null), 700);
        return;
      }
      if (openWatchTimerRef.current) clearTimeout(openWatchTimerRef.current);
      pendingOpenClipIdRef.current = clip.id;
      firstTapRef.current = now;
      openWatchTimerRef.current = setTimeout(() => {
        if (pendingOpenClipIdRef.current === clip.id) setAudioUnlocked(true);
        pendingOpenClipIdRef.current = null;
        openWatchTimerRef.current = null;
      }, 280);
    },
    [handleLike, isMuted, volumeLevel]
  );

  const handleRepost = useCallback(
    async (clip: Clip) => {
      if (!user) {
        navigate("/auth");
        return;
      }
      if (clip.is_demo) {
        toast({ title: "Demo clip", description: "Repost isn’t available for demos." });
        return;
      }
      if (clip.user_id === user.id) {
        toast({ title: "Your clip", description: "You can’t repost your own video." });
        return;
      }
      if (clip.reposted) {
        toast({ title: "Already reposted", description: "You’ve shared this one already." });
        return;
      }
      const result = await repostClip(clip.id);
      if (result.error) {
        toast({ title: "Repost failed", description: result.error, variant: "destructive" });
        return;
      }
      const payload = result.data;
      if (payload?.error === "own_clip") {
        toast({ title: "Your clip", description: "You can’t repost your own video." });
        return;
      }
      if (payload?.already) {
        setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, reposted: true } : c)));
        toast({ title: "Already reposted" });
        return;
      }
      if (payload?.ok) {
        setClips((prev) =>
          prev.map((c) =>
            c.id === clip.id ? { ...c, reposted: true, repost_count: c.reposted ? c.repost_count : c.repost_count + 1 } : c
          )
        );
        await refreshProfile();
        toast({ title: "Reposted! +5 pts", description: "The creator earned +3 pts too." });
      } else {
        toast({ title: "Couldn’t repost", description: "Try again after your backend migration is applied.", variant: "destructive" });
      }
    },
    [user, navigate, toast, refreshProfile]
  );

  const handleShare = async (clip: Clip) => {
    const shareUrl = `${window.location.origin}/clip/${encodeURIComponent(clip.id)}`;
    const shareTitle = clip.ai_title || clip.title;
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast({ title: "Link copied! 📋" });
      }
    } catch {
      // User cancelled share dialog
    }
  };

  const handleOpenClipDetail = (clipId: string) => {
    setWatchingClip(null);
    setChatClip(null);
    setShareClip(null);
    setTimeout(() => navigate(`/clip/${clipId}`), 0);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-8">
        <div className="relative h-14 w-14" aria-hidden>
          <div className="absolute inset-0 rounded-full border-2 border-muted/50 border-t-primary motion-reduce:animate-none animate-spin" />
          <div className="absolute inset-[5px] rounded-full bg-card/80" />
        </div>
        <div className="max-w-[220px] space-y-2 text-center">
          <p className="text-sm font-semibold text-foreground">Loading your feed</p>
          <p className="text-xs leading-relaxed text-muted-foreground">Pulling the latest highlights from the stadium.</p>
        </div>
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[hsl(240_100%_58%)] text-primary-foreground shadow-[0_12px_40px_hsl(210_100%_50%/0.35)] ring-1 ring-white/15">
          <Play className="ml-0.5 h-10 w-10" strokeWidth={2} />
        </div>
        <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">No clips yet</h2>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">Be the first to upload a stadium highlight and show up here.</p>
      </div>
    );
  }

  if (visibleClips.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-border/80 bg-card/80 text-muted-foreground shadow-inner">
          <Search className="h-9 w-9" strokeWidth={1.75} />
        </div>
        <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">No matches</h2>
        <p className="mb-5 max-w-xs text-sm leading-relaxed text-muted-foreground">Try another search or clear filters to see the full feed.</p>
        <button
          type="button"
          onClick={() => setSearchQuery("")}
          className="focus-ring rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition active:scale-[0.98]"
        >
          Clear search
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col">
      <div className="fixed right-2.5 top-24 z-[65] flex w-[3.35rem] flex-col items-center gap-1.5 rounded-[1.75rem] border border-white/18 bg-black/45 p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <button
          type="button"
          onClick={() => setTopMenuVisible((v) => !v)}
          className="focus-ring-inset-dark flex h-11 w-11 items-center justify-center rounded-full border border-white/22 bg-white/8 text-white transition hover:bg-white/12"
          aria-label={topMenuVisible ? "Hide top menu" : "Show top menu"}
        >
          {topMenuVisible ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
        </button>
        <NotificationBell
          onClick={() => setNotifOpen((v) => !v)}
          className="focus-ring-inset-dark flex h-11 w-11 items-center justify-center rounded-full border border-white/22 bg-white/8 p-0 text-white transition hover:bg-white/12"
        />
      </div>
      <NotificationsPopover open={notifOpen} onClose={() => setNotifOpen(false)} />

      {topMenuVisible && (
        <div className="z-30 shrink-0 space-y-2.5 border-b border-border/50 bg-gradient-to-b from-background via-background/95 to-background/88 px-3 pb-3 pt-2.5 shadow-[0_12px_40px_hsl(220_20%_4%/0.65)] backdrop-blur-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sports, teams, cities, #tags, @creators…"
              className="h-11 w-full rounded-2xl border border-white/12 bg-black/45 pl-10 pr-3 text-sm text-foreground shadow-inner placeholder:text-muted-foreground/85 focus:border-primary/45 focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFeedMode("all")}
              className={`rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${feedMode === "all" ? "border-primary/45 bg-primary/20 text-primary shadow-[0_0_14px_hsl(210_100%_56%/0.2)]" : "border-border/70 bg-black/40 text-muted-foreground hover:text-foreground"}`}
            >
              For you
            </button>
            <button
              type="button"
              onClick={() => {
                if (!user) {
                  toast({ title: "Sign in required", description: "Sign in to view your friends feed." });
                  return;
                }
                setFeedMode("friends");
              }}
              className={`rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${feedMode === "friends" ? "border-primary/45 bg-primary/20 text-primary shadow-[0_0_14px_hsl(210_100%_56%/0.2)]" : "border-border/70 bg-black/40 text-muted-foreground hover:text-foreground"}`}
            >
              Friends
            </button>
            <div className="flex-1 min-w-0 flex gap-1 overflow-x-auto whitespace-nowrap scrollbar-hide">
              {QUICK_SPORT_FILTERS.map((sport) => {
                const active = searchQuery.trim().toLowerCase() === sport.query.toLowerCase();
                return (
                  <button
                    key={sport.query}
                    type="button"
                    onClick={() => setSearchQuery(active ? "" : sport.query)}
                    title={sport.label}
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${active ? "border-primary/45 bg-primary/18 shadow-[0_0_10px_hsl(210_100%_56%/0.22)]" : "border-border/70 bg-black/40 hover:border-border"}`}
                  >
                    <span aria-hidden>{sport.icon}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-scroll overscroll-y-contain scrollbar-hide snap-y snap-mandatory"
      >

      {/* Clips */}
      {visibleClips.map((clip) => {
        const youtubeEmbedUrl = getYouTubeEmbedUrl(clip.video_url);
        return (
        <div
          key={clip.id}
          data-clip-id={clip.id}
          ref={(node) => { cardRefs.current[clip.id] = node; }}
          className="snap-start snap-always shrink-0 h-full relative mx-0 mb-0 overflow-hidden border-0 md:border-0"
        >
          <div
            className="absolute inset-0 bg-secondary flex items-center justify-center overflow-hidden cursor-pointer touch-manipulation select-none"
            onClick={(e) => onFeedVideoTap(clip, e)}
          >
            {youtubeEmbedUrl ? (
              <iframe
                src={youtubeEmbedUrl}
                title={clip.ai_title || clip.title}
                className="w-full h-full pointer-events-none"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : clip.video_url ? (
              <video
                ref={(node) => { videoRefs.current[clip.id] = node; }}
                src={clip.video_url}
                className="w-full h-full object-cover"
                muted={isMuted || !audioUnlocked}
                onLoadedMetadata={(e) => {
                  e.currentTarget.volume = volumeLevel;
                }}
                playsInline
                preload="metadata"
                onEnded={() => handleVideoEnded(clip.id)}
                onClick={() => setAudioUnlocked(true)}
              />
            ) : clip.thumbnail_url ? (
              <img src={clip.thumbnail_url} alt={clip.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-card">
                <div className="text-center">
                  <Play className="w-16 h-16 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">Fan Highlight</p>
                </div>
              </div>
            )}
            {burstClipId === clip.id && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
                <Heart className="w-28 h-28 text-destructive fill-destructive drop-shadow-lg animate-[pulse_0.6s_ease-out]" />
              </div>
            )}

            {clip.ai_processed && (
              <div className="absolute top-3 right-3">
                <div className="flex items-center gap-1 bg-blue-500/20 border border-blue-400/40 rounded-full px-2 py-1 backdrop-blur-sm">
                  <BadgeCheck className="w-3 h-3 text-blue-300" />
                  <span className="text-blue-200 text-xs font-bold">Top Pick</span>
                </div>
              </div>
            )}

            {clip.status === "featured" && (
              <div className="absolute top-3 left-3">
                <div className="bg-accent text-accent-foreground rounded-full px-2 py-1 text-xs font-black">
                  ⭐ FEATURED
                </div>
              </div>
            )}
            <div className="absolute right-2.5 top-1/2 z-20 flex w-[3.35rem] -translate-y-1/2 flex-col items-center gap-1.5 rounded-[1.75rem] border border-white/18 bg-black/40 p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.4)] backdrop-blur-md">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/u/${clip.user_id}`);
                }}
                className="focus-ring-inset-dark flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-white/22 bg-white/8 transition hover:bg-white/12 active:scale-95 motion-reduce:active:scale-100"
                title="Uploader profile"
              >
                <span className="text-xs font-bold text-white">
                  {(clip.profiles?.username?.[0] ?? "F").toUpperCase()}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setChatClip(clip);
                }}
                className="focus-ring-inset-dark flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-white/22 bg-white/8 transition hover:bg-white/12 active:scale-95 motion-reduce:active:scale-100"
              >
                <MessageCircle className="h-4 w-4 text-white" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShareClip(clip);
                }}
                className="focus-ring-inset-dark flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-white/22 bg-white/8 transition hover:bg-white/12 active:scale-95 motion-reduce:active:scale-100"
              >
                <Share2 className="h-4 w-4 text-white" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!user) {
                    toast({ title: "Sign in required", description: "Sign in to record a live reaction.", variant: "destructive" });
                    return;
                  }
                  if (clip.is_demo) {
                    toast({ title: "Demo clip", description: "Reactions aren’t available on demo videos." });
                    return;
                  }
                  if (clip.user_id === user.id) {
                    toast({ title: "Your clip", description: "Record reactions on someone else’s video." });
                    return;
                  }
                  navigate(`/clip/${clip.id}/reaction`);
                }}
                disabled={Boolean(clip.is_demo || (user && clip.user_id === user.id))}
                title="Record live reaction"
                aria-label="Record live reaction"
                className="focus-ring-inset-dark flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-electric/35 bg-electric/15 transition hover:bg-electric/25 disabled:pointer-events-none disabled:opacity-40 active:scale-95 motion-reduce:active:scale-100"
              >
                <Mic className="h-4 w-4 text-electric" />
              </button>
              <div className="relative" ref={activeClipId === clip.id ? volumeMenuRef : undefined}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsVolumeMenuOpen((prev) => !prev);
                  }}
                  className="focus-ring-inset-dark flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-white/22 bg-white/8 transition hover:bg-white/12 active:scale-95 motion-reduce:active:scale-100"
                  aria-label="Open volume controls"
                  title="Open volume controls"
                >
                  {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
                </button>
                {isVolumeMenuOpen && activeClipId === clip.id && (
                  <div
                    className="absolute right-14 top-1/2 -translate-y-1/2 w-24 rounded-2xl border border-white/20 bg-black/75 p-2 backdrop-blur"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="mb-1.5 px-1 text-[10px] font-semibold text-white/80">Volume</p>
                    <div className="space-y-1">
                      {VOLUME_PRESETS.map((level) => {
                        const selected = Math.abs(volumeLevel - level) < 0.01;
                        const label = level === 0 ? "Mute" : `${Math.round(level * 100)}%`;
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => {
                              setVolumeLevel(level);
                              if (level > 0) setAudioUnlocked(true);
                              setIsVolumeMenuOpen(false);
                            }}
                            className={`h-7 w-full rounded-lg border text-[11px] font-semibold transition-colors ${
                              selected
                                ? "border-electric/50 bg-electric/30 text-white"
                                : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRepost(clip);
                }}
                disabled={Boolean(clip.reposted || clip.user_id === user?.id || clip.is_demo)}
                title="Repost (+5 pts)"
                className="focus-ring-inset-dark relative flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-white/22 bg-white/8 transition hover:bg-white/12 disabled:pointer-events-none disabled:opacity-40 active:scale-95 motion-reduce:active:scale-100"
              >
                <Repeat2 className={`h-4 w-4 ${clip.reposted ? "text-primary" : "text-white"}`} />
                <span className="absolute -bottom-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-black/70 border border-white/30 text-[10px] leading-4 font-bold text-white tabular-nums text-center">
                  {clip.repost_count}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleLike(clip.id);
                }}
                className="focus-ring-inset-dark relative flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-white/22 bg-white/8 transition hover:bg-white/12 active:scale-95 motion-reduce:active:scale-100"
              >
                <Heart className={`h-5 w-5 ${clip.liked ? "fill-destructive text-destructive" : "text-white"}`} />
                <span className="absolute -bottom-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-black/70 border border-white/30 text-[10px] leading-4 font-bold text-white tabular-nums text-center">
                  {clip.likes_count}
                </span>
              </button>
            </div>

            <div
              onClick={(e) => {
                e.stopPropagation();
                handleOpenClipDetail(clip.id);
              }}
              className="absolute inset-x-0 bottom-0 p-4 pb-5 md:pb-6 bg-gradient-to-t from-black/90 via-black/55 to-transparent text-left"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpenClipDetail(clip.id);
                }
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/u/${clip.user_id}`);
                }}
                className="flex items-center gap-2 mb-1"
              >
                <Avatar className="w-6 h-6 border border-white/35">
                  <AvatarImage src={clip.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px] bg-black/45 text-white">
                    {(clip.profiles?.username?.[0] ?? "F").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <p className="text-xs text-white/90 font-semibold">@{clip.profiles?.username ?? "fan"}</p>
              </button>
              <p className="text-base md:text-lg font-bold text-white line-clamp-3">{clip.ai_title || clip.title}</p>
              {(clip.ai_caption || clip.caption) && (
                <p className="text-sm text-white/85 mt-1 line-clamp-3">{clip.ai_caption || clip.caption}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {clip.section_tag && (
                  <div className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5">
                    <MapPin className="w-3 h-3 text-electric" />
                    <span className="text-xs text-white">{clip.section_tag}</span>
                  </div>
                )}
                {clip.game_tag && (
                  <span className="bg-white/15 rounded-full px-2 py-0.5 text-xs text-white/85">{clip.game_tag}</span>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })}

      {watchingClip && (
        <div
          className="fixed inset-0 z-[70] bg-black/96 backdrop-blur-sm p-0 animate-fade-in flex flex-col"
          onWheel={(e) => {
            if (e.deltaY > 18) {
              e.preventDefault();
              setWatchingClip(null);
            }
          }}
          role="presentation"
        >
          {(() => {
            const watchEmbedUrl = getYouTubeEmbedUrl(watchingClip.video_url);
            const closeIfDragEnd = () => {
              if (watchDragY > 72) setWatchingClip(null);
              setWatchDragY(0);
              watchTouchRef.current.active = false;
            };
            return (
              <div
                className="mx-auto h-full w-full max-w-none md:max-w-[980px] flex flex-col min-h-0 will-change-transform"
                style={watchDragY > 0 ? { transform: `translateY(${watchDragY}px)` } : undefined}
                onTouchStart={(e) => {
                  watchTouchRef.current = { startY: e.touches[0].clientY, active: true };
                }}
                onTouchMove={(e) => {
                  if (!watchTouchRef.current.active) return;
                  const dy = e.touches[0].clientY - watchTouchRef.current.startY;
                  if (dy > 0) setWatchDragY(dy);
                }}
                onTouchEnd={closeIfDragEnd}
              >
                <div
                  className="shrink-0 flex flex-col items-center gap-2 pb-2 touch-pan-y cursor-grab active:cursor-grabbing"
                >
                  <div className="w-12 h-1 rounded-full bg-white/35 mb-1" aria-hidden />
                  <div className="w-full flex items-center justify-between px-1">
                    <p className="text-sm text-white/80">Swipe down or scroll to close</p>
                    <button
                      type="button"
                      onClick={() => setWatchingClip(null)}
                      className="h-9 px-3 rounded-full bg-white/10 text-white text-sm touch-manipulation"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 flex items-center justify-center px-0 md:px-3 pb-1">
                  <div className="relative w-full h-full rounded-none md:rounded-2xl overflow-hidden border-0 md:border md:border-white/10 bg-black">
                    {watchEmbedUrl ? (
                      <iframe
                        src={watchEmbedUrl}
                        title={watchingClip.ai_title || watchingClip.title}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    ) : watchingClip.video_url ? (
                      <video
                        src={watchingClip.video_url}
                        className="w-full h-full object-contain"
                        controls
                        autoPlay
                        muted={isMuted || !audioUnlocked}
                        onLoadedMetadata={(e) => {
                          e.currentTarget.volume = volumeLevel;
                        }}
                        playsInline
                      />
                    ) : watchingClip.thumbnail_url ? (
                      <img src={watchingClip.thumbnail_url} alt={watchingClip.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play className="w-12 h-12 text-white/50" />
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
                      <p className="text-xs text-electric font-semibold mb-1">FanCam Reel</p>
                      <p className="text-base md:text-lg font-bold text-white line-clamp-2">
                        {watchingClip.ai_title || watchingClip.title}
                      </p>
                      {(watchingClip.ai_caption || watchingClip.caption) && (
                        <p className="text-sm text-white/80 mt-1 line-clamp-2">
                          {watchingClip.ai_caption || watchingClip.caption}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 pt-2 px-1">
                  <button
                    type="button"
                    onClick={() => handleOpenClipDetail(watchingClip.id)}
                    className="text-xs text-white/80 underline touch-manipulation"
                  >
                    Open full clip page
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {chatClip && (
        <div className="fixed inset-0 z-[71] bg-black/50 flex items-end md:items-center justify-center p-3">
          <div
            className="w-full max-w-md h-[78vh] md:h-[70vh] rounded-2xl bg-card border border-border overflow-hidden will-change-transform"
            style={chatDragY > 0 ? { transform: `translateY(${chatDragY}px)` } : undefined}
            onTouchStart={(e) => {
              chatTouchRef.current = { startY: e.touches[0].clientY, active: true };
            }}
            onTouchMove={(e) => {
              if (!chatTouchRef.current.active) return;
              const dy = e.touches[0].clientY - chatTouchRef.current.startY;
              if (dy > 0) setChatDragY(dy);
            }}
            onTouchEnd={() => {
              if (chatDragY > 72) {
                setChatClip(null);
              }
              setChatDragY(0);
              chatTouchRef.current.active = false;
            }}
          >
            <div className="h-12 px-4 border-b border-border flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">Comments</p>
              <button onClick={() => setChatClip(null)} className="text-xs text-muted-foreground">Close</button>
            </div>
            <CommentSection clipId={chatClip.id} clipOwnerId={chatClip.user_id} />
          </div>
        </div>
      )}

      {shareClip && (
        <div className="fixed inset-0 z-[71] bg-black/50 flex items-end md:items-center justify-center p-3">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-4">
            <p className="text-sm font-bold text-foreground mb-1">Share</p>
            <p className="text-xs text-muted-foreground mb-4">Share this clip with your friends.</p>
            <div className="flex gap-2">
              <button onClick={() => setShareClip(null)} className="flex-1 h-10 rounded-xl border border-border text-muted-foreground">Close</button>
              <button
                onClick={async () => { await handleShare(shareClip); setShareClip(null); }}
                className="flex-1 h-10 rounded-xl gradient-electric text-primary-foreground font-semibold"
              >
                Share Now
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
