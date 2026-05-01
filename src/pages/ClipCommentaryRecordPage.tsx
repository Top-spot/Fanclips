import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { getClipById } from "@/services/clipsService";
import { CommentaryRecordingStudio } from "@/components/clip-commentary/CommentaryRecordingStudio";
import { DEMO_CLIPS } from "@/lib/demoClips";
import { Button } from "@/components/ui/button";

type ClipRow = {
  id: string;
  title: string;
  ai_title: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  user_id: string;
  is_hidden: boolean;
  status: string;
};

export default function ClipCommentaryRecordPage() {
  const { id: clipId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clip, setClip] = useState<ClipRow | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clipId) {
      setLoading(false);
      setBlocked("Missing clip.");
      return;
    }
    if (!user) {
      setLoading(false);
      setBlocked("auth");
      return;
    }

    const demo = DEMO_CLIPS.find((c) => c.id === clipId);
    if (demo) {
      setLoading(false);
      setBlocked("Reactions are not available on demo clips.");
      return;
    }

    const res = await getClipById(clipId);
    if (res.error || !res.data) {
      setLoading(false);
      setBlocked("Clip not found.");
      return;
    }
    const c = res.data as ClipRow;
    if (c.user_id === user.id) {
      setLoading(false);
      setBlocked("Record reactions on someone else’s clip — not your own.");
      return;
    }
    if (c.is_hidden || c.status !== "live") {
      setLoading(false);
      setBlocked("This clip is not available for reactions.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_private")
      .eq("user_id", c.user_id)
      .maybeSingle();

    const isPrivate = profile?.is_private ?? false;
    if (isPrivate) {
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
        const { data: friendship2 } = await supabase
          .from("friendships")
          .select("id")
          .eq("status", "accepted")
          .eq("addressee_id", user.id)
          .eq("requester_id", c.user_id)
          .maybeSingle();
        allowed = Boolean(friendship2);
      }
      if (!allowed) {
        setLoading(false);
        setBlocked("Follow this creator to react to clips from a private profile.");
        return;
      }
    }

    setClip(c);
    setBlocked(null);
    setLoading(false);
  }, [clipId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
    );
  }

  if (blocked === "auth") {
    return (
      <div className="p-6 max-w-md mx-auto space-y-4">
        <p className="text-sm text-foreground">Sign in to record a reaction.</p>
        <Button onClick={() => navigate("/auth", { state: { from: clipId ? `/clip/${clipId}/reaction` : "/" } })}>Go to sign in</Button>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>
    );
  }

  if (blocked || !clip || !user) {
    return (
      <div className="p-6 max-w-md mx-auto space-y-4">
        <p className="text-sm text-muted-foreground">{blocked ?? "Unavailable."}</p>
        <Button variant="secondary" onClick={() => navigate(clipId ? `/clip/${clipId}` : "/")}>
          Back to clip
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button
          type="button"
          onClick={() => navigate(`/clip/${clip.id}`)}
          className="p-2 rounded-full bg-secondary border border-border"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <p className="text-xs text-electric font-semibold uppercase tracking-wide">Live reaction</p>
          <p className="text-sm font-bold truncate">{clip.ai_title || clip.title}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-lg mx-auto w-full pb-10">
        <CommentaryRecordingStudio
          clipId={clip.id}
          clipTitle={clip.ai_title || clip.title}
          videoUrl={clip.video_url}
          thumbnailUrl={clip.thumbnail_url}
          currentUserId={user.id}
          onPublished={(featureId) => navigate(`/clip/${clip.id}?reaction=${featureId}`)}
          onCancel={() => navigate(`/clip/${clip.id}`)}
        />
      </div>
    </div>
  );
}
