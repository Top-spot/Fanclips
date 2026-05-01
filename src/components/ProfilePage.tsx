import { useState, useEffect, useCallback, useRef } from "react";
import { User, Settings, LogOut, Edit3, Trophy, Film, Heart, Zap, Sparkles, MapPin, Building2, Pin, PinOff, Play, Bell, Lock, KeyRound, Shield, Smartphone, Camera, Loader2, Mic, Trash2 } from "lucide-react";
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
import { CHANNELS, loadFollowedChannels, saveFollowedChannels } from "@/lib/channels";
import { sanitizeSearchTerm } from "@/lib/sanitize";
import { updateProfileByUserId } from "@/services/profilesService";
import { deleteMyCommentary, listCommentaryByCreator } from "@/services/clipCommentaryService";
import type { CommentaryListItem } from "@/lib/clipCommentary/types";

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
const PROFILE_APP_SETTINGS_KEY = "fanclips_profile_app_settings";
const DEFAULT_APP_SETTINGS = {
  pushNotificationsEnabled: true,
  autoplayInFeed: true,
  highlightFollowersOnly: false,
  hideAccountFromSearch: false,
  compactMode: false,
};

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
  const [followedChannelIds, setFollowedChannelIds] = useState<string[]>([]);
  const [sportInput, setSportInput] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [prefSaving, setPrefSaving] = useState(false);
  const [friendQuery, setFriendQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([]);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [friendships, setFriendships] = useState<FriendRequest[]>([]);
  const [mediaTab, setMediaTab] = useState<"clips" | "reposts" | "reactions">("clips");
  const [myClips, setMyClips] = useState<Array<{ id: string; title: string; ai_title: string | null; thumbnail_url: string | null }>>([]);
  const [myReposts, setMyReposts] = useState<Array<{ id: string; title: string; ai_title: string | null; thumbnail_url: string | null }>>([]);
  const [myReactions, setMyReactions] = useState<CommentaryListItem[]>([]);
  const [deletingReactionId, setDeletingReactionId] = useState<string | null>(null);
  const [pinnedClipId, setPinnedClipId] = useState<string | null>(null);
  const [pinnedClip, setPinnedClip] = useState<{ id: string; title: string; ai_title: string | null; caption: string | null; video_url: string | null; thumbnail_url: string | null } | null>(null);
  const [pinning, setPinning] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [appSettings, setAppSettings] = useState(DEFAULT_APP_SETTINGS);
  const [isAdmin, setIsAdmin] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      const { data: profileRowData, error: profileErr } = await supabase
        .from("profiles")
        .select("pinned_clip_id")
        .eq("user_id", user.id)
        .maybeSingle();
      let profileRow = profileRowData;
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
      type RepostClipRow = {
        id: string;
        title: string;
        ai_title: string | null;
        caption: string | null;
        video_url: string | null;
        thumbnail_url: string | null;
        status: string;
        is_hidden: boolean;
      };
      let repostClips: RepostClipRow[] | null = null;

      if (repostClipIds.length === 0) {
        setMyReposts([]);
      } else {
        const { data: rc } = await supabase
          .from("clips")
          .select("id, title, ai_title, caption, video_url, thumbnail_url, status, is_hidden")
          .in("id", repostClipIds);
        repostClips = (rc ?? []) as RepostClipRow[];
        const ordered = repostClipIds
          .map((cid) => repostClips!.find((c) => c.id === cid))
          .filter((c): c is RepostClipRow => Boolean(c))
          .filter((c) => c.status === "live" && !c.is_hidden)
          .map((c) => ({ id: c.id, title: c.title, ai_title: c.ai_title, thumbnail_url: c.thumbnail_url }));
        setMyReposts(ordered);
      }

      const commentaryRes = await listCommentaryByCreator(user.id);
      if (!commentaryRes.error && commentaryRes.data) {
        const visible = commentaryRes.data.filter(
          (item) => item.clip && item.clip.status === "live" && !item.clip.is_hidden,
        );
        setMyReactions(visible);
      } else {
        setMyReactions([]);
      }

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
    setFollowedChannelIds(loadFollowedChannels(user.id));
  }, [user, profile]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROFILE_APP_SETTINGS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_APP_SETTINGS>;
      setAppSettings((prev) => ({
        ...prev,
        pushNotificationsEnabled:
          typeof parsed.pushNotificationsEnabled === "boolean"
            ? parsed.pushNotificationsEnabled
            : prev.pushNotificationsEnabled,
        autoplayInFeed:
          typeof parsed.autoplayInFeed === "boolean" ? parsed.autoplayInFeed : prev.autoplayInFeed,
        highlightFollowersOnly:
          typeof parsed.highlightFollowersOnly === "boolean" ? parsed.highlightFollowersOnly : prev.highlightFollowersOnly,
        hideAccountFromSearch:
          typeof parsed.hideAccountFromSearch === "boolean" ? parsed.hideAccountFromSearch : prev.hideAccountFromSearch,
        compactMode: typeof parsed.compactMode === "boolean" ? parsed.compactMode : prev.compactMode,
      }));
    } catch {
      // Ignore malformed local settings and keep defaults.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PROFILE_APP_SETTINGS_KEY, JSON.stringify(appSettings));
  }, [appSettings]);

  useEffect(() => {
    const loadRole = async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const { data: hasRoleData } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      setIsAdmin(Boolean(hasRoleData));
    };
    void loadRole();
  }, [user]);

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
    const saveResult = await updateProfileByUserId(user.id, {
      username: result.data.username,
      team: result.data.team || null,
      section: result.data.section || null,
      bio: result.data.bio || null,
      is_private: isPrivate,
    });

    if (saveResult.error) {
      toast({ title: "Failed to save", description: saveResult.error, variant: "destructive" });
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

  const handleAvatarClick = () => {
    if (!avatarUploading) {
      fileInputRef.current?.click();
    }
  };

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image.", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max avatar size is 5MB.", variant: "destructive" });
      return;
    }

    const tempPreview = URL.createObjectURL(file);
    setAvatarPreviewUrl(tempPreview);
    setAvatarUploading(true);

    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
        });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);
      if (updateError) throw updateError;

      setAvatarPreviewUrl(`${publicUrl}?t=${Date.now()}`);
      await refreshProfile();
      toast({ title: "Profile photo updated" });
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setAvatarPreviewUrl(null);
      toast({
        title: "Could not update profile photo",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setAvatarUploading(false);
      if (tempPreview.startsWith("blob:")) {
        URL.revokeObjectURL(tempPreview);
      }
    }
  };

  const updateAppSetting = (key: keyof typeof DEFAULT_APP_SETTINGS, value: boolean, toastMessage: string) => {
    setAppSettings((prev) => ({ ...prev, [key]: value }));
    toast({ title: toastMessage });
  };

  const searchPeople = async (query: string) => {
    const sanitized = sanitizeSearchTerm(query, 40);
    setFriendQuery(sanitized);
    if (!user || sanitized.length < 2 || appSettings.hideAccountFromSearch) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url")
      .ilike("username", `%${sanitized}%`)
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

  const currentAvatarUrl = avatarPreviewUrl ?? profile.avatar_url ?? undefined;

  const savePreferences = async () => {
    if (!user) return;
    setPrefSaving(true);
    saveFollowedChannels(user.id, followedChannelIds);
    const followedChannelLabels = CHANNELS
      .filter((channel) => followedChannelIds.includes(channel.id))
      .map((channel) => channel.label);
    const mergedTeams = Array.from(new Set([...preferredTeams, ...followedChannelLabels]));
    const prefs = {
      preferred_sports: preferredSports,
      preferred_teams: mergedTeams,
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

  const handleDeleteReaction = async (featureId: string) => {
    if (!user) return;
    setDeletingReactionId(featureId);
    const res = await deleteMyCommentary(featureId, user.id);
    setDeletingReactionId(null);
    if (res.error) {
      toast({ title: "Could not delete reaction", description: res.error, variant: "destructive" });
      return;
    }
    setMyReactions((prev) => prev.filter((x) => x.feature.id !== featureId));
    toast({ title: "Reaction removed" });
  };

  return (
    <div className="h-full overflow-y-scroll scrollbar-hide">
      <div className="mx-auto w-full max-w-3xl px-4 md:px-6 py-5 md:py-7">
      <div className="pb-3">
        <h1 className="text-2xl md:text-3xl font-black text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account, privacy and friends.</p>
      </div>

      {/* Profile card */}
      <div className="my-4 rounded-3xl p-5 md:p-6 shadow-card bg-gradient-to-br from-card via-card/95 to-secondary/50 border border-border/40">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarFileChange}
        />
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={avatarUploading}
              className="relative rounded-full group"
              aria-label="Change profile picture"
            >
            <Avatar className="w-20 h-20 border-2 border-electric/50 ring-4 ring-electric/10">
              <AvatarImage src={currentAvatarUrl} />
              <AvatarFallback className="bg-electric/20 text-electric text-2xl font-black">
                {profile.username[0]?.toUpperCase() ?? "F"}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
              {avatarUploading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
            {!avatarUploading && (
              <span className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-background border border-border flex items-center justify-center">
                <Camera className="w-3.5 h-3.5 text-electric" />
              </span>
            )}
            </button>
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
            <p className="text-[11px] text-muted-foreground mt-1">Tap profile photo to change picture</p>
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
              <Sparkles className="w-3.5 h-3.5" />
              Follow channels (teams & leagues)
            </div>
            <p className="text-[11px] text-muted-foreground">
              Follow channels to prioritize matching clips in your feed.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CHANNELS.map((channel) => {
                const selected = followedChannelIds.includes(channel.id);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() =>
                      setFollowedChannelIds((prev) =>
                        selected ? prev.filter((id) => id !== channel.id) : [...prev, channel.id]
                      )
                    }
                    className={`text-[11px] px-2.5 py-1.5 rounded-full border transition-colors ${
                      selected
                        ? "bg-electric/15 border-electric/50 text-electric"
                        : "bg-background/50 border-border/60 text-foreground/90 hover:border-border"
                    }`}
                  >
                    {channel.type === "league" ? "League: " : "Team: "}
                    {channel.label}
                  </button>
                );
              })}
            </div>
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
            disabled={appSettings.hideAccountFromSearch}
            className="bg-background/60 border-border/70 h-11 text-foreground text-sm"
          />
          {appSettings.hideAccountFromSearch && (
            <p className="text-xs text-muted-foreground">
              People search suggestions are currently hidden in Settings.
            </p>
          )}
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
          <button
            type="button"
            onClick={() => setMediaTab("reactions")}
            className={`h-8 px-3 rounded-full text-xs border ${mediaTab === "reactions" ? "bg-electric/20 border-electric/50 text-electric" : "bg-background/60 border-border text-muted-foreground"}`}
          >
            Reactions ({myReactions.length})
          </button>
        </div>
        {mediaTab === "reactions" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {myReactions.map((item) => {
              const thumb = item.clip?.thumbnail_url;
              const label = item.feature.title?.trim() || item.clip?.ai_title || item.clip?.title || "Reaction";
              return (
                <div key={item.feature.id} className="rounded-xl overflow-hidden bg-background/60 border border-border/40">
                  <button
                    type="button"
                    onClick={() => navigate(`/clip/${item.feature.source_clip_id}?reaction=${item.feature.id}`)}
                    className="w-full text-left relative"
                  >
                    <div className="aspect-video bg-secondary flex items-center justify-center overflow-hidden">
                      {thumb ? (
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-5 h-5 text-muted-foreground" />
                      )}
                      <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/70 text-white text-[10px] px-2 py-0.5 font-semibold">
                        <Mic className="w-3 h-3" />
                        {item.feature.duration_seconds > 0 ? `${Math.round(item.feature.duration_seconds)}s` : ""}
                      </span>
                    </div>
                    <div className="p-2">
                      <p className="text-[11px] font-semibold line-clamp-2 text-foreground">{label}</p>
                    </div>
                  </button>
                  <div className="px-2 pb-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 w-full text-[11px] text-destructive border-destructive/40 hover:bg-destructive/10"
                      disabled={deletingReactionId === item.feature.id}
                      onClick={() => void handleDeleteReaction(item.feature.id)}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      {deletingReactionId === item.feature.id ? "…" : "Delete"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
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
        )}
        {((mediaTab === "clips" && myClips.length === 0) ||
          (mediaTab === "reposts" && myReposts.length === 0) ||
          (mediaTab === "reactions" && myReactions.length === 0)) && (
          <p className="text-xs text-muted-foreground text-center py-3">
            {mediaTab === "clips" ? "No clips yet." : mediaTab === "reposts" ? "No reposts yet." : "No live reactions yet. Open someone else’s clip and tap Record live reaction."}
          </p>
        )}
      </div>

      {/* Settings */}
      <div className="mb-4 rounded-3xl overflow-hidden shadow-card bg-card/80 border border-border/50">
        <div className="px-4 py-3 border-b border-border/60">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <Settings className="w-4 h-4 text-electric" />
            Settings
          </p>
          <p className="text-xs text-muted-foreground mt-1">Privacy, notifications, and account safety controls.</p>
        </div>

        <div className="px-4 py-3 border-b border-border/60 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Bell className="w-4 h-4 text-muted-foreground" />
                Notifications
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Receive push notifications when interactions happen.
              </p>
            </div>
            <Switch
              checked={appSettings.pushNotificationsEnabled}
              onCheckedChange={(checked) =>
                updateAppSetting(
                  "pushNotificationsEnabled",
                  checked,
                  checked ? "Push notifications enabled" : "Push notifications disabled"
                )
              }
            />
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-muted-foreground" />
                Compact mobile layout
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tighter spacing for one-hand scrolling on smaller screens.
              </p>
            </div>
            <Switch
              checked={appSettings.compactMode}
              onCheckedChange={(checked) =>
                updateAppSetting("compactMode", checked, checked ? "Compact mode enabled" : "Compact mode disabled")
              }
            />
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Play className="w-4 h-4 text-muted-foreground" />
                Feed autoplay
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-play videos while scrolling through the feed.
              </p>
            </div>
            <Switch
              checked={appSettings.autoplayInFeed}
              onCheckedChange={(checked) =>
                updateAppSetting("autoplayInFeed", checked, checked ? "Feed autoplay enabled" : "Feed autoplay disabled")
              }
            />
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                Followers-only highlights
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Make your future highlights visible to followers only.
              </p>
            </div>
            <Switch
              checked={appSettings.highlightFollowersOnly}
              onCheckedChange={(checked) =>
                updateAppSetting(
                  "highlightFollowersOnly",
                  checked,
                  checked ? "Followers-only highlights enabled" : "Highlights are public by default"
                )
              }
            />
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Lock className="w-4 h-4 text-muted-foreground" />
                Hide people search suggestions
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Disable username suggestion cards while searching for friends on this device.
              </p>
            </div>
            <Switch
              checked={appSettings.hideAccountFromSearch}
              onCheckedChange={(checked) =>
                updateAppSetting(
                  "hideAccountFromSearch",
                  checked,
                  checked ? "Search suggestions hidden" : "Search suggestions visible"
                )
              }
            />
          </div>
        </div>

        <div className="px-4 py-3 border-b border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/auth?mode=forgot")}
            className="w-full h-11 border-border text-foreground justify-start"
          >
            <KeyRound className="w-4 h-4 mr-2 text-muted-foreground" />
            Change password
          </Button>
        </div>

        <div className="px-4 py-3 border-b border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/about")}
            className="w-full h-11 border-border text-foreground justify-start"
          >
            <Shield className="w-4 h-4 mr-2 text-muted-foreground" />
            About, safety and legal
          </Button>
        </div>

        {isAdmin && (
          <div className="px-4 py-3 border-b border-border/60">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin")}
              className="w-full h-11 border-border text-foreground justify-start"
            >
              <Shield className="w-4 h-4 mr-2 text-muted-foreground" />
              Open admin dashboard
            </Button>
          </div>
        )}

        <div className="px-4 py-3">
          <div className="rounded-2xl bg-background/60 border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">
              Security note: app settings here are saved on this device. Profile privacy fields are saved to your account and sync across devices.
            </p>
          </div>
        </div>
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
