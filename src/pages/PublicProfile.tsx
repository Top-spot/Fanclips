import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Film, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { listCommentaryByCreator } from "@/services/clipCommentaryService";
import type { CommentaryListItem } from "@/lib/clipCommentary/types";

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
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [reposts, setReposts] = useState<Clip[]>([]);
  const [reactions, setReactions] = useState<CommentaryListItem[]>([]);
  const [mediaTab, setMediaTab] = useState<"clips" | "reposts" | "reactions">("clips");
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [pinnedClip, setPinnedClip] = useState<Clip | null>(null);
  const [giftAmount, setGiftAmount] = useState("25");
  const [giftNote, setGiftNote] = useState("");
  const [sendingGift, setSendingGift] = useState<"gift" | "star" | null>(null);

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

      const commentaryRes = await listCommentaryByCreator(userId);
      if (!commentaryRes.error && commentaryRes.data) {
        setReactions(
          commentaryRes.data.filter((item) => item.clip && item.clip.status === "live" && !item.clip.is_hidden),
        );
      } else {
        setReactions([]);
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
    const shouldFollow = !isFollowing;
    setIsFollowing(shouldFollow);
    setFollowersCount((v) => Math.max(0, v + (shouldFollow ? 1 : -1)));
    setFollowBusy(true);
    if (!shouldFollow) {
      const { data: rpcData, error } = await supabase.rpc("unfollow_user", { p_target_user_id: userId });
      const rpcOk = !error && (rpcData as { ok?: boolean } | null)?.ok;
      if (rpcOk) {
        setFollowBusy(false);
        return;
      } else {
        const delFollow = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", userId);
        if (!delFollow.error) {
          setFollowBusy(false);
          return;
        } else {
          const fallback = await supabase
            .from("friendships")
            .delete()
            .eq("status", "accepted")
            .eq("requester_id", user.id)
            .eq("addressee_id", userId);
          if (!fallback.error) {
            setFollowBusy(false);
            return;
          }
        }
      }
    } else {
      const { data: rpcData, error } = await supabase.rpc("follow_user", { p_target_user_id: userId });
      const rpcOk = !error && (rpcData as { ok?: boolean } | null)?.ok;
      if (rpcOk) {
        setFollowBusy(false);
        return;
      } else {
        const directFollow = await supabase.from("follows").insert({ follower_id: user.id, following_id: userId });
        if (!directFollow.error) {
          setFollowBusy(false);
          return;
        } else {
          const fallback = await supabase
            .from("friendships")
            .insert({ requester_id: user.id, addressee_id: userId, status: "accepted" });
          if (!fallback.error) {
            setFollowBusy(false);
            return;
          }
        }
      }
    }
    setIsFollowing(!shouldFollow);
    setFollowersCount((v) => Math.max(0, v + (shouldFollow ? -1 : 1)));
    toast({ title: shouldFollow ? "Could not follow user" : "Could not unfollow user", variant: "destructive" });
    setFollowBusy(false);
  };

  const sendReward = async (kind: "gift" | "star") => {
    if (!user || !userId || user.id === userId) return;
    const amount = kind === "star" ? 10 : Number(giftAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      toast({ title: "Enter a valid gift amount", variant: "destructive" });
      return;
    }
    setSendingGift(kind);
    const { data, error } = await supabase.rpc("transfer_points", {
      p_to_user_id: userId,
      p_amount: amount,
      p_kind: kind,
      p_message: giftNote.trim() || null,
    });
    setSendingGift(null);

    const rpcError =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : null;

    if (error || rpcError) {
      toast({ title: "Could not send reward", description: error?.message || rpcError || "Try again", variant: "destructive" });
      return;
    }

    toast({ title: kind === "star" ? "Star sent ⭐" : "Gift sent 🎁" });
    setGiftNote("");
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

        {user && userId && user.id !== userId && (
          <div className="rounded-2xl border border-border/60 bg-card/80 p-3 mb-4 space-y-2">
            <p className="text-sm font-semibold text-foreground">Send reward to @{profile.username}</p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={giftAmount}
                onChange={(e) => setGiftAmount(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Gift points"
                className="h-9"
              />
              <Input
                value={giftNote}
                onChange={(e) => setGiftNote(e.target.value)}
                placeholder="Optional note"
                maxLength={80}
                className="h-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-9 text-xs"
                disabled={sendingGift === "star"}
                onClick={() => void sendReward("star")}
              >
                {sendingGift === "star" ? "Sending..." : "Send ⭐ (10)"}
              </Button>
              <Button
                type="button"
                className="h-9 text-xs"
                disabled={sendingGift === "gift"}
                onClick={() => void sendReward("gift")}
              >
                {sendingGift === "gift" ? "Sending..." : "Send Gift"}
              </Button>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-electric tabular-nums">{(profile.points_balance ?? 0).toLocaleString()} pts</span>
          {" · "}
          {followersCount} follower{followersCount !== 1 ? "s" : ""} · {followingCount} following · {clips.length} live clip{clips.length !== 1 ? "s" : ""} · {reposts.length} repost{reposts.length !== 1 ? "s" : ""} · {reactions.length} reaction{reactions.length !== 1 ? "s" : ""}
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
          <button
            type="button"
            onClick={() => setMediaTab("reactions")}
            className={`h-8 px-3 rounded-full text-xs border ${mediaTab === "reactions" ? "bg-electric/20 border-electric/50 text-electric" : "bg-background/60 border-border text-muted-foreground"}`}
          >
            Reactions
          </button>
        </div>

        {mediaTab === "reactions" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {reactions.map((item) => {
              const thumb = item.clip?.thumbnail_url;
              const label = item.feature.title?.trim() || item.clip?.ai_title || item.clip?.title || "Reaction";
              return (
                <button
                  key={item.feature.id}
                  type="button"
                  onClick={() => navigate(`/clip/${item.feature.source_clip_id}?reaction=${item.feature.id}`)}
                  className="text-left rounded-2xl overflow-hidden bg-card/90 shadow-card relative"
                >
                  <div className="aspect-video bg-secondary flex items-center justify-center overflow-hidden">
                    {thumb ? (
                      <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-6 h-6 text-muted-foreground" />
                    )}
                    <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/70 text-white text-[10px] px-2 py-0.5 font-semibold">
                      <Mic className="w-3 h-3" />
                      {item.feature.duration_seconds > 0 ? `${Math.round(item.feature.duration_seconds)}s` : ""}
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-semibold line-clamp-2">{label}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
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
        )}
        {((mediaTab === "clips" && clips.length === 0) ||
          (mediaTab === "reposts" && reposts.length === 0) ||
          (mediaTab === "reactions" && reactions.length === 0)) && (
          <p className="text-xs text-muted-foreground py-6 text-center">
            {mediaTab === "clips" ? "No clips yet." : mediaTab === "reposts" ? "No reposts yet." : "No live reactions yet."}
          </p>
        )}
      </div>
    </div>
  );
}
