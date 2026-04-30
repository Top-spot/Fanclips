import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Share2, Play, Zap, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import CommentSection from "@/components/CommentSection";

interface ClipDetail {
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
  user_id: string;
  profiles: { username: string; avatar_url: string | null; team: string | null } | null;
}

export default function ClipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [clip, setClip] = useState<ClipDetail | null>(null);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchClip = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("clips")
        .select("id, title, caption, section_tag, game_tag, thumbnail_url, video_url, likes_count, ai_processed, ai_title, ai_caption, user_id")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("Failed to fetch clip:", error);
        toast({ title: "Failed to load clip", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (!data) { setClip(null); setLoading(false); return; }

      // Fetch profile separately
      let profileData: { username: string; avatar_url: string | null; team: string | null } | null = null;
      if (data.user_id) {
        const { data: prof } = await supabase.from("profiles").select("username, avatar_url, team").eq("user_id", data.user_id).maybeSingle();
        profileData = prof;
      }

      const c = { ...data, profiles: profileData || { username: "Anonymous", avatar_url: null, team: null } } as unknown as ClipDetail;
      setClip(c);
      setLikesCount(c.likes_count);

      if (user) {
        const { data: like } = await supabase
          .from("clip_likes")
          .select("id")
          .eq("clip_id", id)
          .eq("user_id", user.id)
          .maybeSingle();
        setLiked(!!like);
      }
    } catch (err) {
      console.error("Clip fetch error:", err);
      toast({ title: "Something went wrong", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [id, user, toast]);

  useEffect(() => {
    fetchClip();
  }, [fetchClip]);

  // Track view (once per clip per session)
  useEffect(() => {
    if (!id || !user) return;
    const viewedKey = `viewed_${id}`;
    if (sessionStorage.getItem(viewedKey)) return;
    sessionStorage.setItem(viewedKey, "1");
    supabase.from("clip_views").insert({ clip_id: id, user_id: user.id }).then(() => {});
  }, [id, user]);

  const handleLike = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!id) return;
    // Optimistic update
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(!liked);
    setLikesCount(liked ? likesCount - 1 : likesCount + 1);

    const result = await supabase.rpc("toggle_clip_like", { p_clip_id: id, p_user_id: user.id });
    const d = result.data as { liked: boolean; likes_count: number } | null;
    if (d) {
      setLiked(d.liked);
      setLikesCount(d.likes_count);
    } else {
      // Rollback
      setLiked(prevLiked);
      setLikesCount(prevCount);
      toast({ title: "Like failed, try again", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    if (!clip) return;
    const url = `${window.location.origin}/clip/${clip.id}`;
    const title = clip.ai_title || clip.title;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied! 📋" });
      }
    } catch {}
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-full gradient-electric animate-pulse" />
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-8 text-center">
        <p className="text-xl font-bold text-foreground mb-2">Clip not found</p>
        <p className="text-sm text-muted-foreground mb-4">This clip may have been removed or doesn't exist.</p>
        <button onClick={() => navigate("/")} className="text-primary text-sm font-semibold">Go to Feed</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full bg-secondary border border-border">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar className="w-8 h-8 border border-primary/30">
            <AvatarImage src={clip.profiles?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {clip.profiles?.username?.[0]?.toUpperCase() ?? "F"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">@{clip.profiles?.username ?? "fan"}</p>
            {clip.profiles?.team && <p className="text-xs text-muted-foreground">{clip.profiles.team}</p>}
          </div>
        </div>
      </div>

      {/* Video */}
      <div className="relative bg-background w-full shrink-0">
        {clip.video_url ? (
          <video
            src={clip.video_url}
            className="w-full max-h-[70vh] object-contain"
            controls
            autoPlay
            playsInline
          />
        ) : clip.thumbnail_url ? (
          <img src={clip.thumbnail_url} alt={clip.title} className="w-full max-h-[70vh] object-contain" />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Play className="w-12 h-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No video</p>
          </div>
        )}
        {clip.ai_processed && (
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-primary/20 border border-primary/40 rounded-full px-2 py-1 backdrop-blur-sm">
            <Zap className="w-3 h-3 text-primary" />
            <span className="text-primary text-xs font-bold">AI Enhanced</span>
          </div>
        )}
      </div>

      {/* Info + actions */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-base font-bold text-foreground flex-1 mr-3">{clip.ai_title || clip.title}</p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleShare} className="p-2 rounded-full bg-secondary border border-border active:scale-90 transition-all">
              <Share2 className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={handleLike}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full transition-all active:scale-90"
              style={{
                background: liked ? "hsl(var(--destructive) / 0.15)" : "hsl(var(--secondary))",
                border: `1px solid ${liked ? "hsl(var(--destructive) / 0.4)" : "hsl(var(--border))"}`,
              }}
            >
              <Heart className={`w-5 h-5 transition-all ${liked ? "fill-destructive text-destructive scale-110" : "text-muted-foreground"}`} />
              <span className={`text-sm font-bold ${liked ? "text-destructive" : "text-muted-foreground"}`}>{likesCount}</span>
            </button>
          </div>
        </div>
        {(clip.ai_caption || clip.caption) && (
          <p className="text-sm text-muted-foreground mb-2">{clip.ai_caption || clip.caption}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          {clip.section_tag && (
            <div className="flex items-center gap-1 bg-secondary rounded-full px-2 py-0.5">
              <MapPin className="w-3 h-3 text-primary" />
              <span className="text-xs text-foreground">{clip.section_tag}</span>
            </div>
          )}
          {clip.game_tag && (
            <span className="bg-secondary rounded-full px-2 py-0.5 text-xs text-muted-foreground">{clip.game_tag}</span>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="flex-1 min-h-[300px] flex flex-col overflow-auto">
        <CommentSection clipId={clip.id} clipOwnerId={clip.user_id} />
      </div>
    </div>
  );
}
