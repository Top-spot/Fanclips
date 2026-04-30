import { useEffect, useState, useRef, useCallback } from "react";
import { Heart, MapPin, Zap, Play, Share2, MessageCircle, Search, Trophy, School, ChevronUp, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import NotificationBell from "@/components/NotificationBell";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { SPORT_OPTIONS } from "@/lib/validation";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { scoreClips } from "@/lib/feedAlgorithm";
import CommentSection from "@/components/CommentSection";

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
  sport: string | null;
  school_team: string | null;
  location: string | null;
  event_date: string | null;
  profiles: ClipProfile | null;
  liked: boolean;
  comment_count: number;
}

const ALL_SPORTS = ["All", ...SPORT_OPTIONS] as const;
const DATE_FILTERS = ["Today", "This Week", "All Time"] as const;
type FeedMode = "foryou" | "latest";
type ExpandedSection = "info" | "comments" | null;

export default function HomeFeed({ onOpenNotifications }: { onOpenNotifications: () => void }) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSport, setActiveSport] = useState("All");
  const [dateFilter, setDateFilter] = useState<string>("All Time");
  const [teamSearch, setTeamSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [feedMode, setFeedMode] = useState<FeedMode>("foryou");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [pausedByUser, setPausedByUser] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { sports: userSports, teams: userTeams, loaded: prefsLoaded } = useUserPreferences();

  const fetchClips = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("clips")
        .select(`
          id, title, caption, section_tag, game_tag, thumbnail_url, video_url,
          likes_count, ai_processed, ai_title, ai_caption, status, created_at, user_id,
          sport, school_team, location, event_date
        `)
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .limit(50);

      if (activeSport !== "All") query = query.eq("sport", activeSport);
      if (debouncedSearch.trim()) query = query.ilike("school_team", `%${debouncedSearch.trim()}%`);
      if (dateFilter === "Today") {
        query = query.gte("created_at", new Date().toISOString().split("T")[0]);
      } else if (dateFilter === "This Week") {
        query = query.gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      if (!data) { setClips([]); setLoading(false); return; }

      // Fetch profiles separately (no FK join)
      const userIds = [...new Set((data as any[]).map((c: any) => c.user_id).filter(Boolean))];
      const profileMap: Record<string, ClipProfile> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, username, avatar_url, team").in("user_id", userIds);
        profiles?.forEach((p: any) => { profileMap[p.user_id] = { username: p.username, avatar_url: p.avatar_url, team: p.team }; });
      }

      let likedIds: string[] = [];
      if (user) {
        const { data: likes } = await supabase.from("clip_likes").select("clip_id").eq("user_id", user.id);
        likedIds = likes?.map((l) => l.clip_id) ?? [];
      }

      const clipIds = data.map((c: { id: string }) => c.id);
      const commentCounts: Record<string, number> = {};
      if (clipIds.length > 0) {
        const { data: counts } = await supabase.from("comments").select("clip_id").in("clip_id", clipIds);
        counts?.forEach((c) => { commentCounts[c.clip_id] = (commentCounts[c.clip_id] || 0) + 1; });
      }

      let mapped: Clip[] = (data as any[]).map((c: any) => ({
        ...c,
        profiles: profileMap[c.user_id] || null,
        liked: likedIds.includes(c.id),
        comment_count: commentCounts[c.id] || 0,
      }));

      if (feedMode === "foryou" && (userSports.length > 0 || userTeams.length > 0)) {
        mapped = scoreClips(mapped, userSports, userTeams);
      }

      setClips(mapped);
    } catch {
      toast({ title: "Failed to load feed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user, toast, activeSport, dateFilter, debouncedSearch, feedMode, userSports, userTeams]);

  useEffect(() => { if (prefsLoaded) fetchClips(); }, [fetchClips, prefsLoaded]);

  // IntersectionObserver for auto-play/pause
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const clipId = entry.target.getAttribute("data-clip-id");
          if (!clipId) return;
          const video = videoRefs.current.get(clipId);
          if (!video) return;

          if (entry.isIntersecting) {
            if (!pausedByUser.has(clipId)) {
              video.play().catch(() => {});
            }
          } else {
            video.pause();
            video.currentTime = 0;
            setPausedByUser((prev) => { const n = new Set(prev); n.delete(clipId); return n; });
          }
        });
      },
      { threshold: 0.7 }
    );

    cardRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [clips, pausedByUser]);

  const handleTapVideo = (clipId: string) => {
    const video = videoRefs.current.get(clipId);
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setPausedByUser((prev) => { const n = new Set(prev); n.delete(clipId); return n; });
    } else {
      video.pause();
      setPausedByUser((prev) => new Set(prev).add(clipId));
    }
  };

  // Debounced team search — only trigger fetchClips after 400ms idle
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(teamSearch), 400);
    return () => clearTimeout(t);
  }, [teamSearch]);

  const handleLike = async (clipId: string) => {
    if (!user) { navigate("/auth"); return; }
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
      setClips((prev) => prev.map((c) => c.id === clipId ? { ...c, liked: data.liked, likes_count: data.likes_count } : c));
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
    } catch {}
  };

  const togglePanel = (clipId: string, section: ExpandedSection) => {
    if (expandedClipId === clipId && expandedSection === section) {
      setExpandedClipId(null);
      setExpandedSection(null);
    } else {
      setExpandedClipId(clipId);
      setExpandedSection(section);
    }
  };

  const closePanel = () => {
    setExpandedClipId(null);
    setExpandedSection(null);
  };

  if (loading && clips.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full gradient-electric mx-auto mb-3 animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading highlights...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-scroll scrollbar-hide snap-y snap-mandatory">
      {/* Floating Header */}
      <div className="fixed top-0 left-0 right-0 z-40 pointer-events-none" style={{ maxWidth: "inherit" }}>
        <div className="pointer-events-auto px-4 pt-3 pb-8" style={{ background: "linear-gradient(to bottom, hsl(var(--background)) 40%, transparent)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg gradient-electric flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-primary-foreground" />
              </div>
              <span className="text-base font-black text-foreground">
                Fan<span className="text-electric">Cam</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Feed mode toggle */}
              <div className="flex gap-0.5 bg-background/60 backdrop-blur-sm rounded-lg p-0.5 border border-border/30">
                {(["foryou", "latest"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setFeedMode(mode)}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all whitespace-nowrap ${
                      feedMode === mode
                        ? "gradient-electric text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode === "foryou" ? "⚡ For You" : "🕐 Latest"}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="w-8 h-8 rounded-full bg-background/60 backdrop-blur-sm border border-border/30 flex items-center justify-center"
              >
                <Search className="w-3.5 h-3.5 text-foreground" />
              </button>
              <NotificationBell onClick={onOpenNotifications} />
            </div>
          </div>

          {/* Collapsible filters */}
          {showFilters && (
            <div className="mt-2 animate-fade-in">
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  placeholder="Search team..."
                  className="pl-8 h-8 bg-background/80 backdrop-blur-sm border-border/50 text-xs text-foreground placeholder:text-muted-foreground rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-1">
                  {ALL_SPORTS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setActiveSport(s)}
                      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                        activeSport === s
                          ? "gradient-electric text-primary-foreground"
                          : "bg-background/60 text-muted-foreground border border-border/30 backdrop-blur-sm"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="h-7 px-2 rounded-lg bg-background/60 backdrop-blur-sm border border-border/30 text-[11px] font-semibold text-foreground appearance-none cursor-pointer focus:outline-none"
                >
                  {DATE_FILTERS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty state */}
      {clips.length === 0 && !loading && (
        <div className="h-full snap-start snap-always flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 rounded-full gradient-electric flex items-center justify-center glow-blue mb-4">
            <Play className="w-10 h-10 text-primary-foreground ml-1" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">No clips found</h2>
          <p className="text-muted-foreground text-sm">
            {activeSport !== "All" || teamSearch
              ? "Try changing your filters to see more highlights"
              : "Be the first to upload a highlight! 🏆"}
          </p>
        </div>
      )}

      {/* Full-screen clip cards */}
      {clips.map((clip) => {
        const isExpanded = expandedClipId === clip.id;
        const currentSection = isExpanded ? expandedSection : null;

        return (
          <div
            key={clip.id}
            data-clip-id={clip.id}
            ref={(el) => { if (el) cardRefs.current.set(clip.id, el); else cardRefs.current.delete(clip.id); }}
            className="relative h-[calc(100dvh-4rem)] w-full snap-start snap-always flex-shrink-0"
          >
            {/* Full-screen video/thumbnail */}
            <div className="absolute inset-0 bg-background">
              {clip.video_url ? (
                <>
                  <video
                    ref={(el) => { if (el) videoRefs.current.set(clip.id, el); else videoRefs.current.delete(clip.id); }}
                    src={clip.video_url}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                    loop
                    onClick={() => handleTapVideo(clip.id)}
                  />
                  {pausedByUser.has(clip.id) && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-16 h-16 rounded-full bg-background/30 backdrop-blur-sm flex items-center justify-center">
                        <Play className="w-8 h-8 text-foreground ml-1" />
                      </div>
                    </div>
                  )}
                </>
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
            </div>

            {/* AI badge */}
            {clip.ai_processed && (
              <div className="absolute top-14 right-3 z-10">
                <div className="flex items-center gap-1 bg-primary/20 border border-primary/40 rounded-full px-2 py-1 backdrop-blur-sm">
                  <Zap className="w-3 h-3 text-primary" />
                  <span className="text-primary text-[10px] font-bold">AI</span>
                </div>
              </div>
            )}

            {/* Featured badge */}
            {clip.status === "featured" && (
              <div className="absolute top-14 left-3 z-10">
                <div className="bg-accent text-accent-foreground rounded-full px-2 py-1 text-[10px] font-black backdrop-blur-sm">
                  ⭐ FEATURED
                </div>
              </div>
            )}

            {/* Right-side action buttons (TikTok style) */}
            <div className="absolute right-3 bottom-[30%] z-10 flex flex-col items-center gap-5">
              {/* Like */}
              <button
                onClick={() => handleLike(clip.id)}
                className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm ${
                  clip.liked ? "bg-destructive/20 border border-destructive/40" : "bg-background/30 border border-border/30"
                }`}>
                  <Heart className={`w-5 h-5 ${clip.liked ? "fill-destructive text-destructive" : "text-foreground"}`} />
                </div>
                <span className={`text-[11px] font-bold ${clip.liked ? "text-destructive" : "text-foreground"}`}>
                  {clip.likes_count}
                </span>
              </button>

              {/* Comment */}
              <button
                onClick={() => togglePanel(clip.id, "comments")}
                className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm ${
                  currentSection === "comments" ? "bg-primary/20 border border-primary/40" : "bg-background/30 border border-border/30"
                }`}>
                  <MessageCircle className={`w-5 h-5 ${currentSection === "comments" ? "text-primary" : "text-foreground"}`} />
                </div>
                {clip.comment_count > 0 && (
                  <span className="text-[11px] font-bold text-foreground">{clip.comment_count}</span>
                )}
              </button>

              {/* Share */}
              <button
                onClick={() => handleShare(clip)}
                className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
              >
                <div className="w-11 h-11 rounded-full bg-background/30 backdrop-blur-sm border border-border/30 flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-foreground" />
                </div>
              </button>
            </div>

            {/* Bottom info bar */}
            <div className="absolute bottom-0 left-0 right-0 z-10">
              {/* Expandable panels */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-out ${
                  currentSection ? "max-h-[75vh] opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                {currentSection === "info" && (
                  <div className="bg-background/90 backdrop-blur-xl border-t border-border/30 p-4 max-h-[50vh] overflow-y-auto scrollbar-hide">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-foreground">Details</h3>
                      <button onClick={closePanel} className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>

                    <p className="text-sm font-bold text-foreground mb-2">{clip.ai_title || clip.title}</p>

                    {(clip.ai_caption || clip.caption) && (
                      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{clip.ai_caption || clip.caption}</p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {clip.sport && (
                        <div className="flex items-center gap-1 bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1">
                          <Trophy className="w-3 h-3 text-primary" />
                          <span className="text-xs text-primary font-semibold">{clip.sport}</span>
                        </div>
                      )}
                      {clip.school_team && (
                        <div className="flex items-center gap-1 bg-secondary rounded-full px-2.5 py-1">
                          <School className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{clip.school_team}</span>
                        </div>
                      )}
                      {clip.location && (
                        <div className="flex items-center gap-1 bg-secondary rounded-full px-2.5 py-1">
                          <MapPin className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{clip.location}</span>
                        </div>
                      )}
                      {clip.game_tag && (
                        <span className="bg-secondary rounded-full px-2.5 py-1 text-xs text-muted-foreground">{clip.game_tag}</span>
                      )}
                      {clip.event_date && (
                        <span className="bg-secondary rounded-full px-2.5 py-1 text-xs text-muted-foreground">
                          📅 {new Date(clip.event_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {currentSection === "comments" && (
                  <div className="bg-background/90 backdrop-blur-xl border-t border-border/30 h-[70vh] flex flex-col">
                    <div className="flex items-center justify-between p-4 pb-2 shrink-0">
                      <h3 className="text-sm font-bold text-foreground">Comments</h3>
                      <button onClick={closePanel} className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="flex-1 min-h-0">
                      <CommentSection clipId={clip.id} clipOwnerId={clip.user_id} />
                    </div>
                  </div>
                )}
              </div>

              {/* Compact info bar */}
              <button
                onClick={() => togglePanel(clip.id, "info")}
                className="w-full text-left"
              >
                <div className="bg-gradient-to-t from-background/95 via-background/70 to-transparent px-4 pt-8 pb-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <Avatar className="w-9 h-9 border-2 border-foreground/20">
                      <AvatarImage src={clip.profiles?.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {clip.profiles?.username?.[0]?.toUpperCase() ?? "F"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">@{clip.profiles?.username ?? "fan"}</p>
                      {clip.school_team && (
                        <p className="text-[11px] text-foreground/70 flex items-center gap-1">
                          <School className="w-3 h-3" />{clip.school_team}
                        </p>
                      )}
                    </div>
                    <ChevronUp className={`w-4 h-4 text-foreground/50 transition-transform duration-300 ${
                      currentSection === "info" ? "rotate-180" : ""
                    }`} />
                  </div>

                  <p className="text-sm font-semibold text-foreground line-clamp-1 mb-1">
                    {clip.ai_title || clip.title}
                  </p>

                  <div className="flex items-center gap-2">
                    {clip.sport && (
                      <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary text-[10px] px-1.5 py-0">
                        {clip.sport}
                      </Badge>
                    )}
                    {clip.section_tag && (
                      <Badge variant="outline" className="bg-accent/10 border-accent/30 text-accent text-[10px] px-1.5 py-0">
                        {clip.section_tag}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
