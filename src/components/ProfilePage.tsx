import { useState, useEffect } from "react";
import ProfileInterests from "@/components/ProfileInterests";
import { User, LogOut, Edit3, Trophy, Film, Heart, Lock, Zap, ChevronRight, Bell, BellOff } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { profileSchema } from "@/lib/validation";

const TIER_CONFIG = [
  { name: "Rookie", min: 0, icon: "🏅" },
  { name: "All-Star", min: 500, icon: "⭐" },
  { name: "Legend", min: 2000, icon: "🔥" },
  { name: "MVP", min: 5000, icon: "👑" },
];

export default function ProfilePage() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(profile?.username ?? "");
  const [team, setTeam] = useState(profile?.team ?? "");
  const [section, setSection] = useState(profile?.section ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clipCount, setClipCount] = useState(0);
  const [totalLikes, setTotalLikes] = useState(0);
  const [statsLoading, setStatsLoading] = useState(false);
  const { supported: pushSupported, permission: pushPermission, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe, vapidConfigured } = usePushNotifications();
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setStatsLoading(true);
      supabase.from("clips").select("id, likes_count").eq("user_id", user.id).then(({ data, error }) => {
        if (error) {
          console.error("Failed to fetch clip stats:", error);
        } else if (data) {
          setClipCount(data.length);
          setTotalLikes(data.reduce((sum, c) => sum + (c.likes_count || 0), 0));
        }
        setStatsLoading(false);
      });
    }
  }, [user]);

  // Sync form state when profile changes
  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setTeam(profile.team ?? "");
      setSection(profile.section ?? "");
    }
  }, [profile]);

  if (!user || !profile) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-4">
          <User className="w-10 h-10 text-primary" />
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
    const result = profileSchema.safeParse({ username, team: team || undefined, section: section || undefined });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          username: result.data.username,
          team: result.data.team || null,
          section: result.data.section || null,
        })
        .eq("user_id", user.id);

      if (error) throw error;
      toast({ title: "Profile updated! ✅" });
      await refreshProfile();
      setEditing(false);
    } catch (err) {
      console.error("Profile save error:", err);
      toast({ title: "Failed to save", description: err instanceof Error ? err.message : "Please try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="h-full overflow-y-scroll scrollbar-hide">
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-black text-foreground">Profile</h1>
      </div>

      {/* Profile card */}
      <div className="mx-4 my-4 gradient-card border border-border rounded-2xl p-5 shadow-card">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <Avatar className="w-16 h-16 border-2 border-primary/40">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback className="bg-primary/20 text-primary text-2xl font-black">
                {profile.username[0]?.toUpperCase() ?? "F"}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full gradient-electric flex items-center justify-center text-xs">
              {tier.icon}
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-black text-foreground">@{profile.username}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-sm font-bold text-primary">{tier.icon} {tier.name}</span>
            </div>
          </div>
          <button
            onClick={() => { setEditing(!editing); setErrors({}); }}
            className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: <Zap className="w-4 h-4 text-primary" />, value: points.toLocaleString(), label: "Points" },
            { icon: <Film className="w-4 h-4 text-primary" />, value: statsLoading ? "—" : clipCount.toLocaleString(), label: "Clips" },
            { icon: <Heart className="w-4 h-4 text-destructive" />, value: statsLoading ? "—" : totalLikes.toLocaleString(), label: "Likes" },
          ].map((stat) => (
            <div key={stat.label} className="bg-secondary/50 rounded-xl p-3 text-center">
              <div className="flex justify-center mb-1">{stat.icon}</div>
              <p className="text-lg font-black text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="mx-4 mb-4 gradient-card border border-primary/20 rounded-2xl p-4 space-y-3 animate-fade-in">
          <p className="text-sm font-bold text-foreground">Edit Profile</p>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Username</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
              maxLength={30} className={`bg-secondary/50 border-border h-11 text-foreground text-sm ${errors.username ? "border-destructive" : ""}`} />
            {errors.username && <p className="text-xs text-destructive">{errors.username}</p>}
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Favorite Team</label>
            <Input value={team} onChange={(e) => setTeam(e.target.value)} maxLength={50}
              placeholder="e.g. Lakers, Chiefs..." className="bg-secondary/50 border-border h-11 text-foreground text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Usual Section</label>
            <Input value={section} onChange={(e) => setSection(e.target.value)} maxLength={50}
              placeholder="e.g. Section 114" className="bg-secondary/50 border-border h-11 text-foreground text-sm" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={() => setEditing(false)} variant="outline" className="flex-1 h-11 border-border text-muted-foreground">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 gradient-electric text-primary-foreground font-bold border-0">
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      {/* My Interests */}
      <ProfileInterests />

      {/* Settings */}
      <div className="mx-4 mb-4 gradient-card border border-border rounded-2xl overflow-hidden shadow-card">
        {pushSupported && vapidConfigured && (
          <button
            onClick={async () => {
              setPushLoading(true);
              try {
                if (pushPermission === "granted") {
                  await pushUnsubscribe();
                } else {
                  await pushSubscribe();
                }
              } catch (err) {
                console.error("Push notification toggle error:", err);
                toast({ title: "Failed to update notifications", variant: "destructive" });
              } finally {
                setPushLoading(false);
              }
            }}
            disabled={pushLoading}
            className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-secondary/30 transition-colors border-b border-border"
          >
            {pushPermission === "granted" ? (
              <Bell className="w-5 h-5 text-primary" />
            ) : (
              <BellOff className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="flex-1 text-sm font-medium text-foreground">
              {pushLoading ? "Updating..." : pushPermission === "granted" ? "Push Notifications On" : "Enable Push Notifications"}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pushPermission === "granted" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
              {pushPermission === "granted" ? "ON" : "OFF"}
            </span>
          </button>
        )}
        {[
          { icon: Trophy, label: "Tier Progress", action: () => {} },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action}
            className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-secondary/30 transition-colors border-b border-border last:border-0">
            <Icon className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Sign out */}
      <div className="mx-4 mb-8">
        <Button onClick={handleSignOut} variant="outline" className="w-full h-12 border-destructive/30 text-destructive hover:bg-destructive/10 font-semibold">
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
