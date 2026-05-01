import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Heart, Share2, Play, Zap, MapPin, Repeat2, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import CommentSection from "@/components/CommentSection";
import { getYouTubeEmbedUrl } from "@/lib/video";
import { DEMO_CLIPS } from "@/lib/demoClips";
import { getClipById, toggleClipLike } from "@/services/clipsService";
import { getCommentaryById } from "@/services/clipCommentaryService";
import type { ClipCommentaryFeature } from "@/lib/clipCommentary/types";
import { CommentaryPlaybackPanel } from "@/components/clip-commentary/CommentaryPlaybackPanel";
import { Button } from "@/components/ui/button";

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
  is_hidden: boolean;
  profiles: { username: string; avatar_url: string | null; team: string | null } | null;
}

export default function ClipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, refreshProfile } = useAuth();
  const [clip, setClip] = useState<ClipDetail | null>(null);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [repostCount, setRepostCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [playbackFeature, setPlaybackFeature] = useState<ClipCommentaryFeature | null>(null);

  const reactionParam = searchParams.get("reaction");

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/");
  };

  const fetchClip = useCallback(async () => {
    if (!id) {
      setClip(null);
      setLoading(false);
      return;
    }

    const demoClip = DEMO_CLIPS.find((c) => c.id === id);
    if (demoClip) {
      setAccessDenied(false);
      setClip({
        ...demoClip,
        profiles: {
          username: "fancam_demo",
          avatar_url: null,
          team: "Demo Feed",
        },
      });
      setLikesCount(demoClip.likes_count);
      setLiked(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const clipResult = await getClipById(id);
    const data = clipResult.data;

    if (!data) { setLoading(false); return; }
    const c = data as unknown as Omit<ClipDetail, "profiles">;
    if (c.is_hidden && c.user_id !== user?.id) {
      setLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, avatar_url, team, is_private")
      .eq("user_id", c.user_id)
      .maybeSingle();

    const isPrivate = profile?.is_private ?? false;
    if (isPrivate && c.user_id !== user?.id) {
      if (!user) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      let allowed = false;
      const { data: follow } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", c.user_id)
        .maybeSingle();
      allowed = Boolean(follow);
      if (!allowed) {
        const { data: friendship } = await supabase
          .from("friendships")
          .select("id")
          .eq("status", "accepted")
          .eq("requester_id", user.id)
          .eq("addressee_id", c.user_id)
          .maybeSingle();
        allowed = Boolean(friendship);
      }
      if (!allowed) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
    }

    setAccessDenied(false);
    setClip({
      ...c,
      profiles: profile
        ? { username: profile.username, avatar_url: profile.avatar_url, team: profile.team }
        : null,
    });
    setLikesCount(c.likes_count);
    const { data: repostRows } = await supabase.from("clip_reposts").select("id").eq("clip_id", c.id);
    setRepostCount(repostRows?.length ?? 0);

    if (user) {
      const { data: like } = await supabase
        .from("clip_likes")
        .select("id")
        .eq("clip_id", id!)
        .eq("user_id", user.id)
        .maybeSingle();
      setLiked(!!like);
    } else {
      setLiked(false);
    }
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    void fetchClip();
  }, [fetchClip]);

  useEffect(() => {
    if (!reactionParam || !id || !clip) {
      setPlaybackFeature(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getCommentaryById(reactionParam, id);
      if (cancelled) return;
      if (!res.error && res.data) setPlaybackFeature(res.data);
      else setPlaybackFeature(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [reactionParam, id, clip]);

  const handleLike = async () => {
    if (clip?.id.startsWith("demo-clip-")) return;
    if (!user) { navigate("/auth"); return; }
    const optimisticLiked = !liked;
    const optimisticCount = Math.max(0, likesCount + (optimisticLiked ? 1 : -1));
    setLiked(optimisticLiked);
    setLikesCount(optimisticCount);
    const result = await toggleClipLike(id!, user.id);
    if (!result.error && result.data) {
      setLiked(result.data.liked);
      setLikesCount(result.data.likes_count);
      void refreshProfile();
      return;
    }
    setLiked(!optimisticLiked);
    setLikesCount(Math.max(0, optimisticCount + (optimisticLiked ? -1 : 1)));
  };

  const handleShare = async () => {
    if (!clip) return;
    const url = `${window.location.origin}/clip/${clip.id}`;
    const title = clip.ai_title || clip.title;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch {
        void 0;
      }
    } else {
      await navigator.clipboard.writeText(url);
    }
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
        <button onClick={() => navigate("/")} className="text-electric text-sm font-semibold">Go to Feed</button>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-8 text-center">
        <p className="text-xl font-bold text-foreground mb-2">Private profile</p>
        <p className="text-sm text-muted-foreground mb-4">Only approved followers can view this clip.</p>
        <button onClick={() => navigate("/")} className="text-electric text-sm font-semibold">Go to Feed</button>
      </div>
    );
  }

  const youtubeEmbedUrl = getYouTubeEmbedUrl(clip.video_url);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button onClick={handleBack} className="p-2 rounded-full bg-secondary border border-border">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Avatar className="w-8 h-8 border border-electric/30">
            <AvatarImage src={clip.profiles?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-electric/20 text-electric text-xs font-bold">
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
      <div className="relative bg-black flex items-center justify-center w-full h-[52vh] md:h-[62vh]">
        {youtubeEmbedUrl ? (
          <iframe
            src={youtubeEmbedUrl}
            title={clip.ai_title || clip.title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : clip.video_url ? (
          <video src={clip.video_url} className="w-full h-full object-contain bg-black" controls autoPlay playsInline />
        ) : clip.thumbnail_url ? (
          <img src={clip.thumbnail_url} alt={clip.title} className="w-full h-full object-contain bg-black" />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Play className="w-12 h-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No video</p>
          </div>
        )}
        {clip.ai_processed && (
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-electric/20 border border-electric/40 rounded-full px-2 py-1 backdrop-blur-sm">
            <Zap className="w-3 h-3 text-electric" />
            <span className="text-electric text-xs font-bold">AI Enhanced</span>
          </div>
        )}
      </div>

      {/* Info + actions */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-base font-bold text-foreground flex-1 mr-3">{clip.ai_title || clip.title}</p>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-secondary border border-border">
              <Repeat2 className="w-4 h-4 text-electric" />
              <span className="text-xs font-semibold text-foreground tabular-nums">{repostCount}</span>
            </div>
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
        {playbackFeature && (
          <div className="mb-3">
            <CommentaryPlaybackPanel
              feature={playbackFeature}
              videoUrl={clip.video_url}
              onDismiss={() => {
                setPlaybackFeature(null);
                searchParams.delete("reaction");
                setSearchParams(searchParams, { replace: true });
              }}
            />
          </div>
        )}

        {user && clip.user_id !== user.id && !clip.id.startsWith("demo-clip-") && (
          <div className="mb-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full h-10 gap-2 border border-electric/30 bg-electric/10 hover:bg-electric/20"
              onClick={() => navigate(`/clip/${clip.id}/reaction`)}
            >
              <Mic className="w-4 h-4 text-electric" />
              Record live reaction
            </Button>
          </div>
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

      {/* Comments */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {clip.id.startsWith("demo-clip-") ? (
          <div className="h-full flex items-center justify-center p-6 text-center">
            <p className="text-sm text-muted-foreground">Demo video preview mode (comments disabled).</p>
          </div>
        ) : (
          <CommentSection clipId={clip.id} clipOwnerId={clip.user_id} />
        )}
      </div>
    </div>
  );
}
