import { useEffect, useState } from "react";
import { Film, Zap, Star, Clock, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Clip {
  id: string;
  title: string;
  ai_title: string | null;
  caption: string | null;
  section_tag: string | null;
  thumbnail_url: string | null;
  status: string;
  ai_processed: boolean;
  likes_count: number;
  created_at: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  processing: {
    label: "AI Enhancing…",
    color: "bg-electric/10 text-electric border-electric/30",
    icon: <Zap className="w-3 h-3 animate-pulse" />,
  },
  live: {
    label: "Live",
    color: "bg-primary/10 text-primary border-primary/30",
    icon: <div className="w-1.5 h-1.5 rounded-full bg-primary" />,
  },
  featured: {
    label: "⭐ Featured",
    color: "bg-stadium-yellow/10 text-stadium-yellow border-stadium-yellow/30",
    icon: <Star className="w-3 h-3" />,
  },
  rejected: {
    label: "Rejected",
    color: "bg-destructive/10 text-destructive border-destructive/30",
    icon: null,
  },
};

export default function MyClipsPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchClips();
    else setLoading(false);
  }, [user]);

  const fetchClips = async () => {
    const { data } = await supabase
      .from("clips")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });
    setClips((data as Clip[]) ?? []);
    setLoading(false);
  };

  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
          <Lock className="w-10 h-10 text-electric" />
        </div>
        <h2 className="text-2xl font-black text-foreground mb-2">My Clips</h2>
        <p className="text-muted-foreground mb-6">Sign in to view and manage your highlight clips</p>
        <Button
          onClick={() => navigate("/auth")}
          className="gradient-electric text-primary-foreground font-bold glow-blue px-8 h-12"
        >
          Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-scroll scrollbar-hide">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-foreground">My Clips</h1>
            <p className="text-sm text-muted-foreground">{clips.length} highlight{clips.length !== 1 ? "s" : ""}</p>
          </div>
          {/* Points badge */}
          <div className="flex items-center gap-1.5 bg-electric/10 border border-electric/30 rounded-xl px-3 py-2">
            <Zap className="w-4 h-4 text-electric" />
            <span className="text-electric font-black text-sm">{profile?.points_balance ?? 0}</span>
            <span className="text-muted-foreground text-xs">pts</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
        </div>
      ) : clips.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center mt-8">
          <Film className="w-16 h-16 text-muted-foreground mb-4" />
          <p className="text-foreground font-semibold mb-1">No clips yet</p>
          <p className="text-muted-foreground text-sm">Tap the upload button to share your first highlight!</p>
        </div>
      ) : (
        <div className="px-4 space-y-3 pb-8">
          {clips.map((clip) => {
            const sc = statusConfig[clip.status] ?? statusConfig.processing;
            return (
              <div key={clip.id} className="gradient-card border border-border rounded-2xl overflow-hidden shadow-card">
                <div className="flex gap-3 p-3">
                  {/* Thumbnail */}
                  <div className="w-24 h-20 rounded-xl bg-secondary flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {clip.thumbnail_url ? (
                      <img src={clip.thumbnail_url} alt={clip.title} className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground line-clamp-1 mb-1">
                      {clip.ai_title || clip.title}
                    </p>
                    {clip.caption && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{clip.caption}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-xs border flex items-center gap-1 ${sc.color}`}>
                        {sc.icon}
                        {sc.label}
                      </Badge>
                      {clip.ai_processed && (
                        <Badge className="text-xs border bg-electric/5 text-electric border-electric/20 flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5" /> AI
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold text-foreground">{clip.likes_count}</span>
                      <span className="text-xs text-muted-foreground">❤️</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(clip.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI caption strip */}
                {clip.ai_processed && clip.ai_title && (
                  <div className="flex items-center gap-2 px-3 py-2 border-t border-electric/10 ai-shimmer">
                    <Zap className="w-3 h-3 text-electric flex-shrink-0" />
                    <p className="text-xs text-electric line-clamp-1">{clip.ai_title}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
