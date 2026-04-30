import { useEffect, useState } from "react";
import { Trophy, Zap, Star, Lock, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface Reward {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  category: string;
  active: boolean;
}

interface UserLite {
  user_id: string;
  username: string;
}

const TIER_CONFIG = [
  { name: "Rookie", min: 0, max: 499, color: "text-muted-foreground", icon: "🏅" },
  { name: "All-Star", min: 500, max: 1999, color: "text-electric", icon: "⭐" },
  { name: "Legend", min: 2000, max: 4999, color: "text-stadium-yellow", icon: "🔥" },
  { name: "MVP", min: 5000, max: Infinity, color: "text-green-400", icon: "👑" },
];

const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍟",
  merch: "👕",
  experience: "🏟️",
  general: "🎁",
};

export default function RewardsPage() {
  const { user, profile, session, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [giftingTo, setGiftingTo] = useState<string | null>(null);
  const [giftAmount, setGiftAmount] = useState("50");
  const [giftNote, setGiftNote] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userResults, setUserResults] = useState<UserLite[]>([]);

  useEffect(() => {
    fetchRewards();
  }, []);

  const fetchRewards = async () => {
    const { data } = await supabase
      .from("rewards")
      .select("*")
      .eq("active", true)
      .order("points_cost", { ascending: true });
    setRewards((data as Reward[]) ?? []);
    setLoading(false);
  };

  const points = profile?.points_balance ?? 0;
  const tier = [...TIER_CONFIG].reverse().find((t) => points >= t.min) ?? TIER_CONFIG[0];
  const nextTier = TIER_CONFIG.find((t) => t.min > points);
  const tierProgress = nextTier
    ? ((points - tier.min) / (nextTier.min - tier.min)) * 100
    : 100;

  const handleRedeem = async (reward: Reward) => {
    if (!user || !session) { navigate("/auth"); return; }
    if (points < reward.points_cost) {
      toast({ title: "Not enough points!", description: `You need ${reward.points_cost - points} more points.`, variant: "destructive" });
      return;
    }
    setRedeeming(reward.id);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-reward", {
        body: { reward_id: reward.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || data?.error) throw new Error(data?.error || "Redemption failed");
      toast({ title: `🎉 ${reward.name} redeemed!`, description: `New balance: ${data.new_balance} pts` });
      await refreshProfile();
    } catch (err: unknown) {
      toast({ title: "Failed to redeem", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      setRedeeming(null);
    }
  };

  const searchUsers = async (query: string) => {
    setUserSearch(query);
    if (!user || query.trim().length < 2) {
      setUserResults([]);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("user_id, username")
      .ilike("username", `%${query.trim()}%`)
      .neq("user_id", user.id)
      .limit(8);
    setUserResults((data as UserLite[]) ?? []);
  };

  const sendTransfer = async (toUserId: string, kind: "gift" | "star") => {
    if (!session) {
      navigate("/auth");
      return;
    }

    const amount = kind === "star" ? 10 : Number(giftAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (points < amount) {
      toast({ title: "Not enough points", description: `You need ${amount - points} more points.`, variant: "destructive" });
      return;
    }

    setGiftingTo(toUserId + kind);
    const { data, error } = await supabase.rpc("transfer_points", {
      p_to_user_id: toUserId,
      p_amount: amount,
      p_kind: kind,
      p_message: giftNote || null,
    });
    setGiftingTo(null);

    const rpcError =
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : null;

    if (error || rpcError) {
      toast({
        title: "Transfer failed",
        description: error?.message || rpcError || "Try again",
        variant: "destructive",
      });
      return;
    }

    toast({ title: kind === "star" ? "Stars sent ⭐" : "Gift sent 🎁" });
    setGiftNote("");
    await refreshProfile();
  };

  return (
    <div className="h-full overflow-y-scroll scrollbar-hide">
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-black text-foreground">Rewards</h1>
        <p className="text-sm text-muted-foreground">Earn points, unlock perks</p>
      </div>

      {/* Points card */}
      {user ? (
        <div className="mx-4 my-4 gradient-card border border-border rounded-2xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your Balance</p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-black text-foreground">{points.toLocaleString()}</span>
                <span className="text-muted-foreground pb-1">pts</span>
              </div>
            </div>
            <div className="w-16 h-16 rounded-2xl gradient-yellow flex items-center justify-center glow-yellow">
              <Trophy className="w-8 h-8 text-accent-foreground" />
            </div>
          </div>

          {/* Tier */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">{tier.icon}</span>
            <span className={`text-sm font-black ${tier.color}`}>{tier.name}</span>
            {nextTier && (
              <span className="text-xs text-muted-foreground ml-auto">
                {nextTier.min - points} pts to {nextTier.name}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full gradient-electric rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, tierProgress)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mx-4 my-4 gradient-card border border-border rounded-2xl p-5 flex items-center gap-4">
          <Lock className="w-8 h-8 text-electric" />
          <div className="flex-1">
            <p className="text-sm font-bold text-foreground">Sign in to earn rewards</p>
            <p className="text-xs text-muted-foreground">Upload clips, get likes, redeem perks</p>
          </div>
          <Button onClick={() => navigate("/auth")} className="gradient-electric text-primary-foreground font-bold text-sm h-9 px-4">
            Sign In
          </Button>
        </div>
      )}

      {/* How to earn */}
      <div className="mx-4 mb-4 grid grid-cols-3 gap-2">
        {[
          { icon: "📤", label: "+50 pts", sub: "per upload" },
          { icon: "❤️", label: "+5 pts", sub: "per like" },
          { icon: "⭐", label: "+200 pts", sub: "if featured" },
        ].map((item) => (
          <div key={item.label} className="bg-secondary/50 border border-border rounded-xl p-3 text-center">
            <div className="text-2xl mb-1">{item.icon}</div>
            <p className="text-xs font-black text-electric">{item.label}</p>
            <p className="text-xs text-muted-foreground">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Rewards list */}
      {user && (
        <div className="px-4 mb-5">
          <p className="text-sm font-bold text-foreground mb-3">Send Gifts & Stars</p>
          <div className="gradient-card border border-border rounded-2xl p-4 shadow-card space-y-3">
            <Input
              value={userSearch}
              onChange={(e) => searchUsers(e.target.value)}
              placeholder="Search fans by username"
              className="bg-secondary/50 border-border h-11 text-foreground text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={giftAmount}
                onChange={(e) => setGiftAmount(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Gift points"
                className="bg-secondary/50 border-border h-10 text-foreground text-sm"
              />
              <Input
                value={giftNote}
                onChange={(e) => setGiftNote(e.target.value)}
                placeholder="Optional note"
                maxLength={80}
                className="bg-secondary/50 border-border h-10 text-foreground text-sm"
              />
            </div>

            {userResults.length === 0 ? (
              <p className="text-xs text-muted-foreground">Type at least 2 characters to find fans.</p>
            ) : (
              <div className="space-y-2">
                {userResults.map((target) => (
                  <div key={target.user_id} className="flex items-center justify-between bg-secondary/30 border border-border rounded-xl p-2.5">
                    <span className="text-sm text-foreground">@{target.username}</span>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => sendTransfer(target.user_id, "star")}
                        disabled={giftingTo === target.user_id + "star"}
                        className="h-8 px-3 text-xs font-bold bg-secondary border border-border text-foreground hover:bg-secondary/70"
                      >
                        {giftingTo === target.user_id + "star" ? "..." : "Send ⭐ (10)"}
                      </Button>
                      <Button
                        onClick={() => sendTransfer(target.user_id, "gift")}
                        disabled={giftingTo === target.user_id + "gift"}
                        className="h-8 px-3 text-xs font-bold gradient-electric text-primary-foreground border-0"
                      >
                        {giftingTo === target.user_id + "gift" ? "..." : "Send Gift"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-4 pb-8">
        <p className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Star className="w-4 h-4 text-stadium-yellow" /> Available Rewards
        </p>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-electric/30 border-t-electric rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {rewards.map((reward) => {
              const canAfford = points >= reward.points_cost;
              const isRedeeming = redeeming === reward.id;
              return (
                <div
                  key={reward.id}
                  className={`gradient-card border rounded-2xl p-4 shadow-card transition-all ${
                    canAfford ? "border-border" : "border-border opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl flex-shrink-0">
                      {CATEGORY_EMOJI[reward.category] ?? "🎁"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">{reward.name}</p>
                      {reward.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{reward.description}</p>
                      )}
                      <div className="flex items-center gap-1 mt-2">
                        <Zap className="w-3 h-3 text-electric" />
                        <span className="text-sm font-black text-electric">{reward.points_cost.toLocaleString()} pts</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleRedeem(reward)}
                      disabled={!user || !canAfford || isRedeeming}
                      className={`flex-shrink-0 h-9 px-3 text-xs font-bold rounded-xl border-0 ${
                        canAfford
                          ? "gradient-electric text-primary-foreground glow-blue"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {isRedeeming ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : canAfford ? (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Claim
                        </div>
                      ) : (
                        `${(reward.points_cost - points).toLocaleString()} more`
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
