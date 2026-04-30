import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

interface Profile {
  user_id: string;
  username: string;
  avatar_url: string | null;
  team: string | null;
  section: string | null;
  bio: string | null;
  points_balance?: number;
  pinned_clip_id?: string | null;
}

interface Clip {
  id: string;
  title: string;
  ai_title: string | null;
  caption: string | null;
  thumbnail_url: string | null;
}

export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [reposts, setReposts] = useState<Clip[]>([]);
  const [mediaTab, setMediaTab] = useState<"clips" | "reposts">("clips");
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [pinnedClip, setPinnedClip] = useState<Clip | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!userId) return;
      setLoading(true);
      let p: Profile | null = null;
      const withPinned = await supabase
        .from("profiles")
        .select("user_id, username, avatar_url, team, section, bio, points_balance, pinned_clip_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (withPinned.error && withPinned.error.message.toLowerCase().includes("pinned_clip_id")) {
        const fallback = await supabase
          .from("profiles")
          .select("user_id, username, avatar_url, team, section, bio, points_balance")
          .eq("user_id", userId)
          .maybeSingle();
        p = (fallback.data as Profile | null) ?? null;
      } else {
        p = (withPinned.data as Profile | null) ?? null;
      }

      const { data: c } = await supabase
        .from("clips")
        .select("id, title, ai_title, caption, thumbnail_url")
        .eq("user_id", userId)
        .eq("status", "live")
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(24);
      setProfile((p as Profile | null) ?? null);
      setClips((c as Clip[] | null) ?? []);
      const pinnedId = (p as Profile | null)?.pinned_clip_id;
      if (pinnedId) {
        const { data: pin } = await supabase
          .from("clips")
          .select("id, title, ai_title, caption, thumbnail_url, status, is_hidden")
          .eq("id", pinnedId)
          .maybeSingle();
        if (pin && pin.status === "live" && !pin.is_hidden) {
          setPinnedClip({ id: pin.id, title: pin.title, ai_title: pin.ai_title, caption: pin.caption, thumbnail_url: pin.thumbnail_url });
        } else {
          setPinnedClip(null);
        }
      } else {
        setPinnedClip(null);
      }
      const { data: repostRows } = await supabase
        .from("clip_reposts")
        .select("clip_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(24);
      const repostClipIds = (repostRows ?? []).map((r) => r.clip_id);
      if (repostClipIds.length > 0) {
        const { data: repostClips } = await supabase
          .from("clips")
          .select("id, title, ai_title, caption, thumbnail_url, status, is_hidden")
          .in("id", repostClipIds);
        const ordered = repostClipIds
          .map((id) => (repostClips ?? []).find((rc) => rc.id === id))
          .filter((rc): rc is Clip & { status: string; is_hidden: boolean } => Boolean(rc))
          .filter((rc) => rc.status === "live" && !rc.is_hidden)
          .map((rc) => ({ id: rc.id, title: rc.title, ai_title: rc.ai_title, caption: rc.caption, thumbnail_url: rc.thumbnail_url }));
        setReposts(ordered);
      } else {
        setReposts([]);
      }
      const [{ data: followers }, { data: following }] = await Promise.all([
        supabase.from("follows").select("id").eq("following_id", userId),
        supabase.from("follows").select("id").eq("follower_id", userId),
      ]);
      if (followers && following) {
        setFollowersCount(followers.length);
        setFollowingCount(following.length);
      } else {
        const { data: fallbackFollowers } = await supabase
          .from("friendships")
          .select("id")
          .eq("status", "accepted")
          .eq("addressee_id", userId);
        const { data: fallbackFollowing } = await supabase
          .from("friendships")
          .select("id")
          .eq("status", "accepted")
          .eq("requester_id", userId);
        setFollowersCount(fallbackFollowers?.length ?? 0);
        setFollowingCount(fallbackFollowing?.length ?? 0);
      }

      if (user && userId && user.id !== userId) {
        const { data: mine, error: mineErr } = await supabase
          .from("follows")
          .select("id")
          .eq("follower_id", user.id)
          .eq("following_id", userId)
          .maybeSingle();
        if (!mineErr) {
          setIsFollowing(Boolean(mine));
        } else {
          const { data: fallbackMine } = await supabase
            .from("friendships")
            .select("id")
            .eq("status", "accepted")
            .eq("requester_id", user.id)
            .eq("addressee_id", userId)
            .maybeSingle();
          setIsFollowing(Boolean(fallbackMine));
        }
      } else {
        setIsFollowing(false);
      }
      setLoading(false);
    };
    void load();
  }, [userId, user]);

  const toggleFollow = async () => {
    if (!user || !userId || user.id === userId) return;
    setFollowBusy(true);
    if (isFollowing) {
      const { data: rpcData, error } = await supabase.rpc("unfollow_user", { p_target_user_id: userId });
      const rpcOk = !error && (rpcData as { ok?: boolean } | null)?.ok;
      if (rpcOk) {
        setIsFollowing(false);
        setFollowersCount((v) => Math.max(0, v - 1));
      } else {
        const delFollow = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", userId);
        if (!delFollow.error) {
          setIsFollowing(false);
          setFollowersCount((v) => Math.max(0, v - 1));
        } else {
          const fallback = await supabase
            .from("friendships")
            .delete()
            .eq("status", "accepted")
            .eq("requester_id", user.id)
            .eq("addressee_id", userId);
          if (!fallback.error) {
            setIsFollowing(false);
            setFollowersCount((v) => Math.max(0, v - 1));
          }
        }
      }
    } else {
      const { data: rpcData, error } = await supabase.rpc("follow_user", { p_target_user_id: userId });
      const rpcOk = !error && (rpcData as { ok?: boolean } | null)?.ok;
      if (rpcOk) {
        setIsFollowing(true);
        setFollowersCount((v) => v + 1);
      } else {
        const directFollow = await supabase.from("follows").insert({ follower_id: user.id, following_id: userId });
        if (!directFollow.error) {
          setIsFollowing(true);
          setFollowersCount((v) => v + 1);
          await supabase.from("notifications").insert({
            user_id: userId,
            type: "follow",
            message: "You have a new follower 👥",
            reference_id: user.id,
            read: false,
          });
        } else {
          const fallback = await supabase
            .from("friendships")
            .insert({ requester_id: user.id, addressee_id: userId, status: "accepted" });
          if (!fallback.error) {
            setIsFollowing(true);
            setFollowersCount((v) => v + 1);
            await supabase.from("notifications").insert({
              user_id: userId,
              type: "follow",
              message: "You have a new follower 👥",
              reference_id: user.id,
              read: false,
            });
          }
        }
      }
    }
    setFollowBusy(false);
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Loading profile...</div>;
  }

  if (!profile) {
    return <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Profile not found.</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full bg-background/70 border border-border/70">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold">@{profile.username}</span>
      </div>

      <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
        <div className="rounded-3xl p-5 md:p-6 shadow-card bg-gradient-to-br from-card via-card/95 to-secondary/50 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="w-20 h-20 border border-border/70">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback>{profile.username[0]?.toUpperCase() ?? "F"}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-lg font-bold">@{profile.username}</p>
            {profile.team && <p className="text-sm text-muted-foreground">{profile.team}</p>}
            {profile.section && <p className="text-xs text-muted-foreground mt-0.5">Section: {profile.section}</p>}
            {profile.bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{profile.bio}</p>}
            {user && userId && user.id !== userId && (
              <Button size="sm" className="mt-2 h-8 text-xs" variant={isFollowing ? "secondary" : "default"} disabled={followBusy} onClick={toggleFollow}>
                {followBusy ? "..." : isFollowing ? "Following" : "Follow"}
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-electric tabular-nums">{(profile.points_balance ?? 0).toLocaleString()} pts</span>
          {" · "}
          {followersCount} follower{followersCount !== 1 ? "s" : ""} · {followingCount} following · {clips.length} live clip{clips.length !== 1 ? "s" : ""} · {reposts.length} repost{reposts.length !== 1 ? "s" : ""}
        </p>
        </div>

        {pinnedClip && (
          <div className="mb-4 rounded-2xl overflow-hidden bg-card/85 border border-border/40 shadow-card">
            <button type="button" onClick={() => navigate(`/clip/${pinnedClip.id}`)} className="w-full text-left">
              <div className="aspect-video bg-secondary overflow-hidden">
                {pinnedClip.thumbnail_url ? (
                  <img src={pinnedClip.thumbnail_url} alt={pinnedClip.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="p-3">
                <p className="text-xs uppercase tracking-wide text-electric font-semibold mb-1">Pinned Highlight</p>
                <p className="text-sm font-semibold line-clamp-2">{pinnedClip.ai_title || pinnedClip.title}</p>
              </div>
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => setMediaTab("clips")}
            className={`h-8 px-3 rounded-full text-xs border ${mediaTab === "clips" ? "bg-electric/20 border-electric/50 text-electric" : "bg-background/60 border-border text-muted-foreground"}`}
          >
            Clips
          </button>
          <button
            type="button"
            onClick={() => setMediaTab("reposts")}
            className={`h-8 px-3 rounded-full text-xs border ${mediaTab === "reposts" ? "bg-electric/20 border-electric/50 text-electric" : "bg-background/60 border-border text-muted-foreground"}`}
          >
            Reposts
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(mediaTab === "clips" ? clips : reposts).map((clip) => (
            <button key={clip.id} onClick={() => navigate(`/clip/${clip.id}`)} className="text-left rounded-2xl overflow-hidden bg-card/90 shadow-card">
              <div className="aspect-video bg-secondary flex items-center justify-center overflow-hidden">
                {clip.thumbnail_url ? (
                  <img src={clip.thumbnail_url} alt={clip.title} className="w-full h-full object-cover" />
                ) : (
                  <Film className="w-6 h-6 text-muted-foreground" />
                )}
              </div>
              <div className="p-2.5">
                <p className="text-xs font-semibold line-clamp-2">{clip.ai_title || clip.title}</p>
              </div>
            </button>
          ))}
        </div>
        {(mediaTab === "clips" ? clips.length === 0 : reposts.length === 0) && (
          <p className="text-xs text-muted-foreground py-6 text-center">
            {mediaTab === "clips" ? "No clips yet." : "No reposts yet."}
          </p>
        )}
      </div>
    </div>
  );
}
