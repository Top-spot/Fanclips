import { useEffect, useState, useRef, useCallback } from "react";
import { Heart, MapPin, Zap, Play, Share2, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import NotificationBell from "@/components/NotificationBell";
import { useToast } from "@/hooks/use-toast";

interface ClipProfile {
  username: string;
  avatar_url: string | null;
  team: string | null;
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
  user_id: string;
  profiles: ClipProfile | null;
  liked: boolean;
  comment_count: number;
}

export default function HomeFeed({ onOpenNotifications }: { onOpenNotifications: () => void }) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchClips = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clips")
        .select(`
          id, title, caption, section_tag, game_tag, thumbnail_url, video_url,
          likes_count, ai_processed, ai_title, ai_caption, status, created_at, user_id,
          profiles!inner(username, avatar_url, team)
        `)
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!data) { setClips([]); setLoading(false); return; }

      let likedIds: string[] = [];
      if (user) {
        const { data: likes } = await supabase
          .from("clip_likes")
          .select("clip_id")
          .eq("user_id", user.id);
        likedIds = likes?.map((l) => l.clip_id) ?? [];
      }

      // Fetch comment counts
      const clipIds = data.map((c: { id: string }) => c.id);
      const commentCounts: Record<string, number> = {};
      if (clipIds.length > 0) {
        const { data: counts } = await supabase
          .from("comments")
          .select("clip_id")
          .in("clip_id", clipIds);
        counts?.forEach((c) => {
          commentCounts[c.clip_id] = (commentCounts[c.clip_id] || 0) + 1;
        });
      }

      const mapped: Clip[] = (data as unknown as Array<{
        id: string; title: string; caption: string | null; section_tag: string | null;
        game_tag: string | null; thumbnail_url: string | null; video_url: string | null;
        likes_count: number; ai_processed: boolean; ai_title: string | null;
        ai_caption: string | null; status: string; created_at: string; user_id: string;
        profiles: ClipProfile | null;
      }>).map((c) => ({
        ...c,
        liked: likedIds.includes(c.id),
        comment_count: commentCounts[c.id] || 0,
      }));

      setClips(mapped);
    } catch {
      toast({ title: "Failed to load feed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    fetchClips();
  }, [fetchClips]);

  const handleLike = async (clipId: string) => {
    if (!user) { navigate("/auth"); return; }

    // Optimistic update
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        const newLiked = !c.liked;
        return { ...c, liked: newLiked, likes_count: c.likes_count + (newLiked ? 1 : -1) };
      })
    );

    const result = await supabase.rpc("toggle_clip_like", { p_clip_id: clipId, p_user_id: user.id });
    const data = result.data as { liked: boolean; likes_count: number } | null;
    if (data) {
      // Sync with server truth
      setClips((prev) =>
        prev.map((c) => c.id === clipId ? { ...c, liked: data.liked, likes_count: data.likes_count } : c)
      );
    } else {
      // Revert on failure
      setClips((prev) =>
        prev.map((c) => {
          if (c.id !== clipId) return c;
          const reverted = !c.liked;
          return { ...c, liked: reverted, likes_count: c.likes_count + (reverted ? 1 : -1) };
        })
      );
      toast({ title: "Like failed, try again", variant: "destructive" });
    }
  };

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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full gradient-electric mx-auto mb-3 animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading highlights...</p>
        </div>
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full gradient-electric flex items-center justify-center glow-blue mb-4">
          <Play className="w-10 h-10 text-primary-foreground ml-1" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">No clips yet!</h2>
        <p className="text-muted-foreground text-sm">Be the first to upload a stadium highlight 🏟️</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-scroll scrollbar-hide snap-y snap-mandatory">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 pt-4 pb-2"
        style={{ background: "linear-gradient(to bottom, hsl(var(--background)) 80%, transparent)" }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-electric flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-black text-foreground">
            Fan<span className="text-electric">Cam</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell onClick={onOpenNotifications} />
          <Badge className="bg-electric/10 text-electric border-electric/30 text-xs">
            🔴 LIVE
          </Badge>
        </div>
      </div>

      {/* Clips */}
      {clips.map((clip) => (
        <div
          key={clip.id}
          className="snap-start h-[calc(100vh-10rem)] flex flex-col relative mx-3 mb-3 rounded-2xl overflow-hidden border border-border gradient-card shadow-card"
        >
          {/* Thumbnail / Video */}
          <div
            className="flex-1 relative bg-secondary flex items-center justify-center overflow-hidden cursor-pointer"
            onClick={() => navigate(`/clip/${clip.id}`)}
          >
            {clip.video_url ? (
              <video src={clip.video_url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
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
            {clip.video_url && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-background/40 backdrop-blur-sm flex items-center justify-center">
                  <Play className="w-7 h-7 text-foreground ml-1" />
                </div>
              </div>
            )}

            {clip.ai_processed && (
              <div className="absolute top-3 right-3">
                <div className="flex items-center gap-1 bg-electric/20 border border-electric/40 rounded-full px-2 py-1 backdrop-blur-sm">
                  <Zap className="w-3 h-3 text-electric" />
                  <span className="text-electric text-xs font-bold">AI Enhanced</span>
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
          </div>

          {/* Info overlay */}
          <div className="p-4 bg-card border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Avatar className="w-8 h-8 border border-electric/30">
                  <AvatarImage src={clip.profiles?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-electric/20 text-electric text-xs font-bold">
                    {clip.profiles?.username?.[0]?.toUpperCase() ?? "F"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">@{clip.profiles?.username ?? "fan"}</p>
                  {clip.profiles?.team && (
                    <p className="text-xs text-muted-foreground">{clip.profiles.team}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigate(`/clip/${clip.id}`)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-secondary border border-border active:scale-90 transition-all"
                >
                  <MessageCircle className="w-4 h-4 text-muted-foreground" />
                  {clip.comment_count > 0 && (
                    <span className="text-xs font-bold text-muted-foreground">{clip.comment_count}</span>
                  )}
                </button>
                <button
                  onClick={() => handleShare(clip)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-all active:scale-90 bg-secondary border border-border"
                >
                  <Share2 className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => handleLike(clip.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-all active:scale-90"
                  style={{
                    background: clip.liked ? "hsl(var(--destructive) / 0.15)" : "hsl(var(--secondary))",
                    border: `1px solid ${clip.liked ? "hsl(var(--destructive) / 0.4)" : "hsl(var(--border))"}`,
                  }}
                >
                  <Heart className={`w-5 h-5 transition-all ${clip.liked ? "fill-destructive text-destructive scale-110" : "text-muted-foreground"}`} />
                  <span className={`text-sm font-bold ${clip.liked ? "text-destructive" : "text-muted-foreground"}`}>
                    {clip.likes_count}
                  </span>
                </button>
              </div>
            </div>

            <p className="text-sm font-bold text-foreground mb-1 line-clamp-1">{clip.ai_title || clip.title}</p>

            {(clip.ai_caption || clip.caption) && (
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{clip.ai_caption || clip.caption}</p>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {clip.section_tag && (
                <div className="flex items-center gap-1 bg-secondary rounded-full px-2 py-0.5">
                  <MapPin className="w-3 h-3 text-electric" />
                  <span className="text-xs text-foreground">{clip.section_tag}</span>
                </div>
              )}
              {clip.game_tag && (
                <span className="bg-secondary rounded-full px-2 py-0.5 text-xs text-muted-foreground">{clip.game_tag}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
