import { useState, useEffect, useCallback } from "react";
import { User, Settings, LogOut, Edit3, Trophy, Film, Heart, Zap, ChevronRight, Sparkles, MapPin, Building2, Pin, PinOff, Play } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { profileSchema } from "@/lib/validation";
import { mergeFeedPreferences, saveProfileFeedPreferences } from "@/lib/feedPreferences";
import { Switch } from "@/components/ui/switch";

interface FriendProfile {
  user_id: string;
  username: string;
  avatar_url: string | null;
}

interface FriendRequest {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
}

const TIER_CONFIG = [
  { name: "Rookie", min: 0, icon: "🏅" },
  { name: "All-Star", min: 500, icon: "⭐" },
  { name: "Legend", min: 2000, icon: "🔥" },
  { name: "MVP", min: 5000, icon: "👑" },
];

const SPORT_OPTIONS = ["Football", "Basketball", "Baseball", "Soccer", "Tennis", "Hockey", "Cricket", "MMA"];

export default function ProfilePage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(profile?.username ?? "");
  const [team, setTeam] = useState(profile?.team ?? "");
  const [section, setSection] = useState(profile?.section ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clipCount, setClipCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [isPrivate, setIsPrivate] = useState(profile?.is_private ?? false);
  const [preferredSports, setPreferredSports] = useState<string[]>(profile?.preferred_sports ?? []);
  const [preferredTeams, setPreferredTeams] = useState<string[]>(profile?.preferred_teams ?? []);
  const [preferredLocations, setPreferredLocations] = useState<string[]>(profile?.preferred_locations ?? []);
  const [sportInput, setSportInput] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [prefSaving, setPrefSaving] = useState(false);
  const [friendQuery, setFriendQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [friendships, setFriendships] = useState<FriendRequest[]>([]);
  const [mediaTab, setMediaTab] = useState<"clips" | "reposts">("clips");
  const [myClips, setMyClips] = useState<Array<{ id: string; title: string; ai_title: string | null; thumbnail_url: string | null }>>([]);
  const [myReposts, setMyReposts] = useState<Array<{ id: string; title: string; ai_title: string | null; thumbnail_url: string | null }>>([]);
  const [pinnedClipId, setPinnedClipId] = useState<string | null>(null);
  const [pinnedClip, setPinnedClip] = useState<{ id: string; title: string; ai_title: string | null; caption: string | null; video_url: string | null; thumbnail_url: string | null } | null>(null);
  const [pinning, setPinning] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from("clips").select("id, likes_count").eq("user_id", user.id).then(({ data }) => {
        if (data) {
          setClipCount(data.length);
        }
      });
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadMedia = async () => {
      let { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("pinned_clip_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileErr && profileErr.message.toLowerCase().includes("pinned_clip_id")) {
        const fallback = await supabase
          .from("profiles")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();
        profileRow = fallback.data ? { pinned_clip_id: null } : null;
      }
      const pinnedId = (profileRow?.pinned_clip_id as string | null | undefined) ?? null;
      setPinnedClipId(pinnedId);

      const { data: clips } = await supabase
        .from("clips")
        .select("id, title, ai_title, caption, video_url, thumbnail_url")
        .eq("user_id", user.id)
        .eq("status", "live")
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(36);
      const clipRows = (clips as Array<{ id: string; title: string; ai_title: string | null; caption: string | null; video_url: string | null; thumbnail_url: string | null }> | null) ?? [];
      setMyClips(clipRows.map((c) => ({ id: c.id, title: c.title, ai_title: c.ai_title, thumbnail_url: c.thumbnail_url })));

      const { data: repostRows } = await supabase
        .from("clip_reposts")
        .select("clip_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(36);

      const repostClipIds = (repostRows ?? []).map((r) => r.clip_id);
      if (repostClipIds.length === 0) {
        setMyReposts([]);
        return;
      }
      const { data: repostClips } = await supabase
        .from("clips")
        .select("id, title, ai_title, caption, video_url, thumbnail_url, status, is_hidden")
        .in("id", repostClipIds);

      const ordered = repostClipIds
        .map((id) => (repostClips ?? []).find((c) => c.id === id))
        .filter((c): c is { id: string; title: string; ai_title: string | null; caption: string | null; video_url: string | null; thumbnail_url: string | null; status: string; is_hidden: boolean } => Boolean(c))
        .filter((c) => c.status === "live" && !c.is_hidden)
        .map((c) => ({ id: c.id, title: c.title, ai_title: c.ai_title, thumbnail_url: c.thumbnail_url }));
      setMyReposts(ordered);

      if (pinnedId) {
        const pinned = clipRows.find((c) => c.id === pinnedId) || (repostClips ?? []).find((c) => c.id === pinnedId);
        if (pinned && (!("status" in pinned) || ((pinned as { status?: string }).status === "live" && !(pinned as { is_hidden?: boolean }).is_hidden))) {
          setPinnedClip({
            id: pinned.id,
            title: pinned.title,
            ai_title: pinned.ai_title,
            caption: pinned.caption ?? null,
            video_url: pinned.video_url ?? null,
            thumbnail_url: pinned.thumbnail_url ?? null,
          });
        } else {
          setPinnedClip(null);
        }
      } else {
        setPinnedClip(null);
      }
    };
    void loadMedia();
  }, [user, clipCount]);

  useEffect(() => {
    setIsPrivate(profile?.is_private ?? false);
    setBio(profile?.bio ?? "");
  }, [profile?.is_private, profile?.bio]);

  useEffect(() => {
    if (!user || !profile) return;
    const m = mergeFeedPreferences(profile, user.id);
    setPreferredSports(m.preferred_sports);
    setPreferredTeams(m.preferred_teams);
    setPreferredLocations(m.preferred_locations);
  }, [user, profile]);

  const loadFriendData = useCallback(async () => {
    if (!user) return;
    const [{ data: followerRows, error: followersErr }, { data: relationData }] = await Promise.all([
      supabase.from("follows").select("id").eq("following_id", user.id),
      supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status")
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    ]);

    const relations = (relationData as FriendRequest[] | null) ?? [];
    setFriendships(relations);
    if (!followersErr) {
      setFollowersCount(followerRows?.length ?? 0);
    } else {
      const { data: fallbackFollowers } = await supabase
        .from("friendships")
        .select("id")
        .eq("status", "accepted")
        .eq("addressee_id", user.id);
      setFollowersCount(fallbackFollowers?.length ?? 0);
    }
    setIncomingRequests(relations.filter((r) => r.status === "pending" && r.addressee_id === user.id));

    const friendIds = relations
      .filter((r) => r.status === "accepted")
      .map((r) => (r.requester_id === user.id ? r.addressee_id : r.requester_id));

    if (friendIds.length === 0) {
      setFriends([]);
      return;
    }
    const { data: friendProfiles } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url")
      .in("user_id", friendIds);
    setFriends((friendProfiles as FriendProfile[] | null) ?? []);
  }, [user]);

  useEffect(() => {
    void loadFriendData();
  }, [loadFriendData]);

  if (!user || !profile) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
          <User className="w-10 h-10 text-electric" />
        </div>
        <h2 className="text-2xl font-black text-foreground mb-2">Your Profile</h2>
        <p className="text-muted-foreground mb-6">Sign in to view your fan stats and settings</p>
        <Button onClick={() => navigate("/auth")} className="gradient-electric text-primary-foreground font-bold glow-blue px-8 h-12">
          Sign In
        </Button>
      </div>
    );
  }

  const points = profile.points_balance;
  const tier = [...TIER_CONFIG].reverse().find((t) => points >= t.min) ?? TIER_CONFIG[0];

  const handleSave = async () => {
    setErrors({});
    const result = profileSchema.safeParse({ username, team: team || undefined, section: section || undefined, bio: bio || undefined });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        username: result.data.username,
        team: result.data.team || null,
        section: result.data.section || null,
        bio: result.data.bio || null,
        is_private: isPrivate,
      })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated! ✅" });
      await refreshProfile();
      setEditing(false);
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const searchPeople = async (query: string) => {
    setFriendQuery(query);
    if (!user || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url")
      .ilike("username", `%${query.trim()}%`)
      .neq("user_id", user.id)
      .limit(8);
    setSearchResults((data as FriendProfile[] | null) ?? []);
  };

  const relationForUser = (otherUserId: string) => {
    return friendships.find(
      (r) =>
        (r.requester_id === user?.id && r.addressee_id === otherUserId) ||
        (r.addressee_id === user?.id && r.requester_id === otherUserId)
    );
  };

  const sendFriendRequest = async (otherUserId: string) => {
    if (!user) return;
    const existing = relationForUser(otherUserId);
    if (existing) return;
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: otherUserId,
      status: "pending",
    });
    if (error) {
      toast({ title: "Could not send request", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Friend request sent" });
    await loadFriendData();
  };

  const respondToRequest = async (requestId: string, accept: boolean) => {
    const query = supabase.from("friendships");
    const { error } = accept
      ? await query.update({ status: "accepted" }).eq("id", requestId)
      : await query.delete().eq("id", requestId);
    if (error) {
      toast({ title: "Failed to update request", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: accept ? "Friend added" : "Request declined" });
    await loadFriendData();
  };

  const addTag = (
    value: string,
    current: string[],
    setCurrent: React.Dispatch<React.SetStateAction<string[]>>,
    max = 12
  ) => {
    const v = value.trim();
    if (!v) return;
    if (current.some((item) => item.toLowerCase() === v.toLowerCase()) || current.length >= max) return;
    setCurrent([...current, v]);
  };

  const removeTag = (value: string, setCurrent: React.Dispatch<React.SetStateAction<string[]>>) => {
    setCurrent((prev) => prev.filter((item) => item !== value));
  };

  const maskedEmail = user.email
    ? user.email.replace(/(^.).*(@.*$)/, (_m, a, b) => `${a}••••••${b}`)
    : "";

  const savePreferences = async () => {
    if (!user) return;
    setPrefSaving(true);
    const prefs = {
      preferred_sports: preferredSports,
      preferred_teams: preferredTeams,
      preferred_locations: preferredLocations,
    };
    const { savedToDb, partial } = await saveProfileFeedPreferences(supabase, user.id, prefs);
    setPrefSaving(false);
    if (savedToDb) {
      if (partial) {
        toast({
          title: "Preferences saved",
          description: "Synced what your database supports; the rest stays on this device until migrations are applied.",
        });
      } else {
        toast({ title: "Preferences saved" });
      }
      await refreshProfile();
    } else {
      toast({
        title: "Saved on this device",
        description: "Shortcuts work in your feed. Apply the latest Supabase migration in Lovable to sync to the cloud.",
      });
    }
  };

  const handlePinClip = async (clipId: string | null) => {
    if (!user) return;
    setPinning(true);
    try {
      if (clipId) {
        const { data: clip } = await supabase
          .from("clips")
          .select("id, user_id, status, is_hidden")
          .eq("id", clipId)
          .maybeSingle();
        if (!clip || clip.status !== "live" || clip.is_hidden) {
          toast({ title: "Cannot pin this clip", description: "Clip is not available.", variant: "destructive" });
          setPinning(false);
          return;
        }
        const isOwner = clip.user_id === user.id;
        let isReposted = false;
        if (!isOwner) {
          const { data: repost } = await supabase
            .from("clip_reposts")
            .select("id")
            .eq("user_id", user.id)
            .eq("clip_id", clipId)
            .maybeSingle();
          isReposted = Boolean(repost);
        }
        if (!isOwner && !isReposted) {
          toast({ title: "Pin not allowed", description: "Pin your clips or reposted clips only.", variant: "destructive" });
          setPinning(false);
          return;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({ pinned_clip_id: clipId })
        .eq("user_id", user.id);
      if (error) throw error;
      setPinnedClipId(clipId);
      if (clipId) {
        const fromMedia = [...myClips, ...myReposts].find((c) => c.id === clipId);
        if (fromMedia) {
          setPinnedClip({
            id: fromMedia.id,
            title: fromMedia.title,
            ai_title: fromMedia.ai_title,
            caption: null,
            video_url: null,
            thumbnail_url: fromMedia.thumbnail_url,
          });
        }
      } else {
        setPinnedClip(null);
      }
      await refreshProfile();
      toast({ title: clipId ? "Pinned to player card" : "Pinned highlight removed" });
    } catch {
      toast({ title: "Failed to update pinned highlight", variant: "destructive" });
    } finally {
      setPinning(false);
    }
  };

  return (
    <div className="h-full overflow-y-scroll scrollbar-hide">
      <div className="mx-auto w-full max-w-3xl px-4 md:px-6 py-5 md:py-7">
      <div className="pb-3">
        <h1 className="text-2xl md:text-3xl font-black text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account, privacy and friends.</p>
      </div>

      {/* Profile card */}
      <div className="my-4 rounded-3xl p-5 md:p-6 shadow-card bg-gradient-to-br from-card via-card/95 to-secondary/50">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <Avatar className="w-20 h-20 border-2 border-electric/40">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="bg-electric/20 text-electric text-2xl font-black">
                {profile.username[0]?.toUpperCase() ?? "F"}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full gradient-electric flex items-center justify-center text-xs">
              {tier.icon}
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-black text-foreground">@{profile.username}</h2>
            <p className="text-sm text-muted-foreground group inline-block">
              <span className="group-hover:hidden">{maskedEmail}</span>
              <span className="hidden group-hover:inline">{user.email}</span>
            </p>
            {profile.bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{profile.bio}</p>}
            <div className="flex items-center gap-1 mt-1">
              <span className="text-sm font-bold text-electric">{tier.icon} {tier.name}</span>
            </div>
          </div>
          <button
            onClick={() => {
              setEditing(!editing);
              setUsername(profile.username);
              setTeam(profile.team ?? "");
              setSection(profile.section ?? "");
              setBio(profile.bio ?? "");
              setIsPrivate(profile.is_private ?? false);
              setErrors({});
            }}
            className="w-10 h-10 rounded-2xl bg-background/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Zap className="w-4 h-4 text-electric" />, value: points.toLocaleString(), label: "Points" },
            { icon: <Film className="w-4 h-4 text-electric" />, value: clipCount.toLocaleString(), label: "Clips" },
            { icon: <Heart className="w-4 h-4 text-destructive" />, value: followersCount.toLocaleString(), label: "Followers" },
          ].map((stat) => (
            <div key={stat.label} className="bg-background/55 rounded-2xl p-3 text-center">
              <div className="flex justify-center mb-1">{stat.icon}</div>
              <p className="text-lg font-black text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-3xl p-4 md:p-5 shadow-card bg-card/85 border border-border/50">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-foreground">Player Card</p>
          {pinnedClipId && (
            <Button type="button" size="sm" variant="outline" disabled={pinning} className="h-8 text-xs" onClick={() => void handlePinClip(null)}>
              <PinOff className="w-3.5 h-3.5 mr-1" /> Unpin
            </Button>
          )}
        </div>
        {pinnedClip ? (
          <button
            type="button"
            onClick={() => navigate(`/clip/${pinnedClip.id}`)}
            className="w-full text-left rounded-2xl overflow-hidden bg-background/60 border border-border/40"
          >
            <div className="aspect-video bg-secondary flex items-center justify-center overflow-hidden relative">
              {pinnedClip.thumbnail_url ? (
                <img src={pinnedClip.thumbnail_url} alt={pinnedClip.title} className="w-full h-full object-cover" />
              ) : (
                <Play className="w-7 h-7 text-muted-foreground" />
              )}
              <div className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/45 border border-white/20 px-2 py-1 text-[11px] text-white">
                <Pin className="w-3 h-3" /> Pinned
              </div>
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-foreground line-clamp-2">{pinnedClip.ai_title || pinnedClip.title}</p>
              {pinnedClip.caption && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pinnedClip.caption}</p>}
            </div>
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">
            No pinned highlight yet. Use the pin button on any clip/repost below to feature it here.
          </p>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <div className="mb-4 rounded-3xl p-4 md:p-5 space-y-3 animate-slide-up bg-card/80 shadow-card">
          <p className="text-sm font-bold text-foreground">Edit Profile</p>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Username</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
              maxLength={30} className={`bg-background/60 border-border/70 h-11 text-foreground text-sm ${errors.username ? "border-destructive" : ""}`} />
            {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Favorite Team</label>
            <Input value={team} onChange={(e) => setTeam(e.target.value)} maxLength={50}
              placeholder="e.g. Lakers, Chiefs..." className="bg-background/60 border-border/70 h-11 text-foreground text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Usual Section</label>
            <Input value={section} onChange={(e) => setSection(e.target.value)} maxLength={50}
              placeholder="e.g. Section 114" className="bg-background/60 border-border/70 h-11 text-foreground text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">About (max 30 words)</label>
            <Input
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={180}
              placeholder="Tell people about your fan vibe..."
              className={`bg-background/60 border-border/70 h-11 text-foreground text-sm ${errors.bio ? "border-destructive" : ""}`}
            />
            {errors.bio && <p className="text-xs text-destructive">{errors.bio}</p>}
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-background/50 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-foreground">Private profile</p>
              <p className="text-xs text-muted-foreground">Only friends can view your clips</p>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => setEditing(false)} variant="outline" className="flex-1 h-11 border-border text-muted-foreground">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 gradient-electric text-primary-foreground font-bold border-0">
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      <div className="mb-4 rounded-3xl overflow-hidden shadow-card border border-border/50 bg-gradient-to-b from-card to-card/90">
        <div className="px-4 md:px-5 pt-4 pb-3 flex items-start gap-3 border-b border-border/40">
          <div className="w-10 h-10 rounded-2xl bg-electric/15 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-electric" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-foreground">Feed shortcuts</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Boost matching clips in For you. To browse by sport anytime, use search & quick chips on the Feed — no save required.
                </p>
              </div>
              <Button size="sm" onClick={savePreferences} disabled={prefSaving} className="h-8 px-3 shrink-0 rounded-full text-xs font-semibold">
                {prefSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
        <div className="p-4 md:p-5 space-y-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Sports</p>
            <div className="flex flex-wrap gap-1.5">
              {SPORT_OPTIONS.map((sport) => {
                const selected = preferredSports.some((s) => s.toLowerCase() === sport.toLowerCase());
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() =>
                      selected
                        ? removeTag(preferredSports.find((s) => s.toLowerCase() === sport.toLowerCase()) || sport, setPreferredSports)
                        : setPreferredSports((prev) => [...prev, sport])
                    }
                    className={`text-[11px] px-2.5 py-1.5 rounded-full border transition-colors ${selected ? "bg-electric/15 border-electric/50 text-electric shadow-[0_0_10px_rgba(59,130,246,0.15)]" : "bg-background/50 border-border/60 text-foreground/90 hover:border-border"}`}
                  >
                    {sport}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-3">
              <Input
                value={sportInput}
                onChange={(e) => setSportInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(sportInput, preferredSports, setPreferredSports);
                    setSportInput("");
                  }
                }}
                placeholder="Custom sport"
                className="h-9 text-xs bg-background/50 border-border/60 rounded-xl"
              />
              <Button type="button" variant="secondary" size="sm" className="h-9 px-3 rounded-xl text-xs shrink-0" onClick={() => { addTag(sportInput, preferredSports, setPreferredSports); setSportInput(""); }}>
                Add
              </Button>
            </div>
          </div>

          <div className="rounded-2xl bg-background/40 border border-border/40 p-3 space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Building2 className="w-3.5 h-3.5" />
              Teams
            </div>
            <div className="flex gap-2">
              <Input
                value={teamInput}
                onChange={(e) => setTeamInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(teamInput, preferredTeams, setPreferredTeams);
                    setTeamInput("");
                  }
                }}
                placeholder="e.g. Lakers, Chiefs"
                className="h-9 text-xs bg-background/60 border-border/50 rounded-xl flex-1"
              />
              <Button type="button" size="sm" className="h-9 px-3 rounded-xl text-xs shrink-0" onClick={() => { addTag(teamInput, preferredTeams, setPreferredTeams); setTeamInput(""); }}>
                Add
              </Button>
            </div>
            {preferredTeams.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {preferredTeams.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => removeTag(s, setPreferredTeams)}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-secondary/80 text-foreground border border-border/50 hover:bg-secondary"
                  >
                    {s} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-background/40 border border-border/40 p-3 space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <MapPin className="w-3.5 h-3.5" />
              Places
            </div>
            <div className="flex gap-2">
              <Input
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(locationInput, preferredLocations, setPreferredLocations);
                    setLocationInput("");
                  }
                }}
                placeholder="City or country"
                className="h-9 text-xs bg-background/60 border-border/50 rounded-xl flex-1"
              />
              <Button type="button" size="sm" className="h-9 px-3 rounded-xl text-xs shrink-0" onClick={() => { addTag(locationInput, preferredLocations, setPreferredLocations); setLocationInput(""); }}>
                Add
              </Button>
            </div>
            {preferredLocations.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {preferredLocations.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => removeTag(s, setPreferredLocations)}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-secondary/80 text-foreground border border-border/50 hover:bg-secondary"
                  >
                    {s} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-3xl p-4 md:p-5 space-y-4 shadow-card bg-card/80">
        <p className="text-sm font-bold text-foreground">Friends (mutual follows)</p>
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Find people</label>
          <Input
            value={friendQuery}
            onChange={(e) => searchPeople(e.target.value)}
            placeholder="Search by username"
            className="bg-background/60 border-border/70 h-11 text-foreground text-sm"
          />
        </div>
        {searchResults.length > 0 && (
          <div className="space-y-2">
            {searchResults.map((result) => {
              const relation = relationForUser(result.user_id);
              const isAccepted = relation?.status === "accepted";
              const incoming = relation?.status === "pending" && relation.addressee_id === user.id;
              const outgoing = relation?.status === "pending" && relation.requester_id === user.id;
              return (
                <div key={result.user_id} className="flex items-center justify-between bg-background/50 rounded-2xl p-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={result.avatar_url ?? undefined} />
                      <AvatarFallback className="text-xs">{result.username[0]?.toUpperCase() ?? "F"}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground">@{result.username}</span>
                  </div>
                  {isAccepted ? (
                    <span className="text-xs text-electric font-semibold">Friends</span>
                  ) : incoming ? (
                    <Button size="sm" className="h-8" onClick={() => respondToRequest(relation.id, true)}>Accept</Button>
                  ) : outgoing ? (
                    <span className="text-xs text-muted-foreground">Pending</span>
                  ) : (
                    <Button size="sm" className="h-8" onClick={() => sendFriendRequest(result.user_id)}>Add</Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {incomingRequests.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Incoming requests</p>
            {incomingRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between bg-background/50 rounded-2xl p-2.5">
                <span className="text-sm text-foreground truncate">Request from {request.requester_id.slice(0, 8)}...</span>
                <div className="flex gap-2">
                  <Button size="sm" className="h-8" onClick={() => respondToRequest(request.id, true)}>Accept</Button>
                  <Button size="sm" variant="outline" className="h-8 border-border" onClick={() => respondToRequest(request.id, false)}>Decline</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground mb-2">Your friends ({friends.length})</p>
          {friends.length === 0 ? (
            <p className="text-xs text-muted-foreground">No friends yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {friends.map((friend) => (
                <span key={friend.user_id} className="text-xs px-2.5 py-1 rounded-full bg-background/60 text-foreground">
                  @{friend.username}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-3xl p-4 md:p-5 space-y-3 shadow-card bg-card/80">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMediaTab("clips")}
            className={`h-8 px-3 rounded-full text-xs border ${mediaTab === "clips" ? "bg-electric/20 border-electric/50 text-electric" : "bg-background/60 border-border text-muted-foreground"}`}
          >
            Clips ({myClips.length})
          </button>
          <button
            type="button"
            onClick={() => setMediaTab("reposts")}
            className={`h-8 px-3 rounded-full text-xs border ${mediaTab === "reposts" ? "bg-electric/20 border-electric/50 text-electric" : "bg-background/60 border-border text-muted-foreground"}`}
          >
            Reposts ({myReposts.length})
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          {(mediaTab === "clips" ? myClips : myReposts).map((clip) => (
            <div key={clip.id} className="rounded-xl overflow-hidden bg-background/60 border border-border/40">
              <button type="button" onClick={() => navigate(`/clip/${clip.id}`)} className="w-full text-left">
              <div className="aspect-video bg-secondary flex items-center justify-center overflow-hidden">
                {clip.thumbnail_url ? (
                  <img src={clip.thumbnail_url} alt={clip.title} className="w-full h-full object-cover" />
                ) : (
                  <Film className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="p-2">
                <p className="text-[11px] font-semibold line-clamp-2 text-foreground">{clip.ai_title || clip.title}</p>
              </div>
              </button>
              <div className="px-2 pb-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pinning}
                  variant={pinnedClipId === clip.id ? "secondary" : "outline"}
                  className="h-7 w-full text-[11px]"
                  onClick={() => void handlePinClip(clip.id)}
                >
                  <Pin className="w-3 h-3 mr-1" />
                  {pinnedClipId === clip.id ? "Pinned" : "Pin highlight"}
                </Button>
              </div>
            </div>
          ))}
        </div>
        {(mediaTab === "clips" ? myClips.length === 0 : myReposts.length === 0) && (
          <p className="text-xs text-muted-foreground text-center py-3">
            {mediaTab === "clips" ? "No clips yet." : "No reposts yet."}
          </p>
        )}
      </div>

      {/* Settings */}
      <div className="mb-4 rounded-3xl overflow-hidden shadow-card bg-card/80">
        {[
          { icon: Settings, label: "Notifications", action: () => {} },
          { icon: Trophy, label: "Tier Progress", action: () => {} },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action}
            className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-background/40 transition-colors border-b border-border/60 last:border-0">
            <Icon className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Sign out */}
      <div className="mb-3">
        <Button onClick={() => navigate("/")} variant="outline" className="w-full h-11 border-border text-foreground font-semibold">
          Frontpage
        </Button>
      </div>
      <div className="mb-8">
        <Button onClick={handleSignOut} variant="outline" className="w-full h-12 border-destructive/30 text-destructive hover:bg-destructive/10 font-semibold">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
      </div>
    </div>
  );
}
