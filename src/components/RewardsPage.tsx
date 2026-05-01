import { useCallback, useEffect, useMemo, useState } from "react";
import { Trophy, Zap, Star, Lock, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { rewardTransferSchema } from "@/lib/validation";
import { sanitizeSearchTerm } from "@/lib/sanitize";

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

interface RewardsOverview {
  balance: number;
  ledger_total: number;
  total_earned: number;
  total_spent: number;
  transactions_count: number;
  redemptions_count: number;
}

interface PointsTransaction {
  id: string;
  amount: number;
  reason: string;
  created_at: string;
}

interface RewardRedemption {
  id: string;
  points_spent: number;
  redeemed_at: string;
  reward_id: string;
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
  const [overview, setOverview] = useState<RewardsOverview | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<PointsTransaction[]>([]);
  const [recentRedemptions, setRecentRedemptions] = useState<RewardRedemption[]>([]);
  const [earnRules, setEarnRules] = useState<Record<string, number>>({
    upload: 50,
    like_received: 5,
    comment_posted: 2,
  });

  const fetchRewards = useCallback(async () => {
    setLoading(true);
    const requests = [
      supabase
        .from("rewards")
        .select("*")
        .eq("active", true)
        .order("points_cost", { ascending: true }),
      supabase.from("reward_rules").select("key, points_value, enabled"),
      user
        ? supabase.rpc("get_my_rewards_overview")
        : Promise.resolve({ data: null, error: null }),
      user
        ? supabase
            .from("points_transactions")
            .select("id, amount, reason, created_at")
            .order("created_at", { ascending: false })
            .limit(12)
        : Promise.resolve({ data: null, error: null }),
      user
        ? supabase
            .from("reward_redemptions")
            .select("id, points_spent, redeemed_at, reward_id")
            .order("redeemed_at", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: null, error: null }),
    ] as const;

    const [rewardRes, rulesRes, overviewRes, txRes, redemptionsRes] = await Promise.all(requests);
    const { data: rewardData, error: rewardError } = rewardRes;
    const { data: rulesData } = rulesRes;

    if (rewardError) {
      toast({ title: "Failed to load rewards", description: rewardError.message, variant: "destructive" });
      setRewards([]);
    } else {
      setRewards((rewardData as Reward[]) ?? []);
    }

    const nextRules: Record<string, number> = {
      upload: 50,
      like_received: 5,
      comment_posted: 2,
    };
    (rulesData ?? []).forEach((rule) => {
      if (rule.enabled) nextRules[rule.key] = rule.points_value;
    });
    setEarnRules(nextRules);
    setOverview((overviewRes.data as RewardsOverview | null) ?? null);
    setRecentTransactions((txRes.data as PointsTransaction[] | null) ?? []);
    setRecentRedemptions((redemptionsRes.data as RewardRedemption[] | null) ?? []);
    setLoading(false);
  }, [toast, user]);

  useEffect(() => {
    void fetchRewards();
  }, [fetchRewards]);

  const points = overview?.balance ?? profile?.points_balance ?? 0;
  const ledgerMatches = overview ? overview.balance === overview.ledger_total : true;
  const tier = [...TIER_CONFIG].reverse().find((t) => points >= t.min) ?? TIER_CONFIG[0];
  const nextTier = TIER_CONFIG.find((t) => t.min > points);
  const tierProgress = nextTier
    ? ((points - tier.min) / (nextTier.min - tier.min)) * 100
    : 100;
  const earnCards = useMemo(
    () => [
      { icon: "📤", label: `+${earnRules.upload ?? 50} pts`, sub: "per upload" },
      { icon: "❤️", label: `+${earnRules.like_received ?? 5} pts`, sub: "per like received" },
      { icon: "💬", label: `+${earnRules.comment_posted ?? 2} pts`, sub: "per comment" },
      { icon: "🔁", label: `+${earnRules.repost_made ?? 5} pts`, sub: "per repost" },
    ],
    [earnRules]
  );
  const milestones = useMemo(() => {
    const postedComments = recentTransactions.filter((tx) => tx.reason === "Comment posted").length;
    const uploads = recentTransactions.filter((tx) => tx.reason === "Clip uploaded").length;
    const reposts = recentTransactions.filter((tx) => tx.reason === "Repost bonus").length;
    return [
      { label: "First Upload", done: uploads > 0 },
      { label: "5 Comments Posted", done: postedComments >= 5 },
      { label: "3 Reposts", done: reposts >= 3 },
      { label: "1000+ Total Earned", done: (overview?.total_earned ?? 0) >= 1000 },
    ];
  }, [overview?.total_earned, recentTransactions]);

  const handleRedeem = async (reward: Reward) => {
    if (!user || !session) {
      toast({ title: "Sign in required", description: "Sign in to redeem rewards." });
      navigate("/auth");
      return;
    }
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
      const nextBalance = typeof data?.new_balance === "number" ? data.new_balance : null;
      toast({
        title: `🎉 ${reward.name} redeemed!`,
        description: nextBalance !== null ? `New balance: ${nextBalance} pts` : "Reward redemption completed.",
      });
      await refreshProfile();
      await fetchRewards();
    } catch (err: unknown) {
      toast({ title: "Failed to redeem", description: err instanceof Error ? err.message : "Try again", variant: "destructive" });
    } finally {
      setRedeeming(null);
    }
  };

  const searchUsers = async (query: string) => {
    const sanitized = sanitizeSearchTerm(query, 40);
    setUserSearch(sanitized);
    if (!user || sanitized.length < 2) {
      setUserResults([]);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("user_id, username")
      .ilike("username", `%${sanitized}%`)
      .neq("user_id", user.id)
      .limit(8);
    setUserResults((data as UserLite[]) ?? []);
  };

  const sendTransfer = async (toUserId: string, kind: "gift" | "star") => {
    if (!session) {
      navigate("/auth");
      return;
    }

    const parsedTransfer = rewardTransferSchema.safeParse({
      amount: kind === "star" ? 10 : Number(giftAmount),
      note: giftNote,
    });
    if (!parsedTransfer.success) {
      toast({ title: parsedTransfer.error.errors[0]?.message ?? "Enter a valid amount", variant: "destructive" });
      return;
    }
    const { amount, note } = parsedTransfer.data;
    if (points < amount) {
      toast({ title: "Not enough points", description: `You need ${amount - points} more points.`, variant: "destructive" });
      return;
    }

    setGiftingTo(toUserId + kind);
    const { data, error } = await supabase.rpc("transfer_points", {
      p_to_user_id: toUserId,
      p_amount: amount,
      p_kind: kind,
      p_message: note || null,
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

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`rounded-full border px-2 py-1 ${ledgerMatches ? "border-green-500/50 text-green-400" : "border-destructive/60 text-destructive"}`}>
              {ledgerMatches ? "Ledger Synced" : "Ledger Drift"}
            </span>
            {overview && (
              <>
                <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">
                  Earned: {overview.total_earned.toLocaleString()}
                </span>
                <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">
                  Spent: {overview.total_spent.toLocaleString()}
                </span>
              </>
            )}
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
      <div className="mx-4 mb-4 grid grid-cols-2 gap-2">
        {earnCards.map((item) => (
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

      {user && (
        <div className="px-4 mb-5">
          <p className="text-sm font-bold text-foreground mb-3">Milestones</p>
          <div className="grid grid-cols-2 gap-2">
            {milestones.map((milestone) => (
              <div
                key={milestone.label}
                className={`rounded-xl border px-3 py-2 text-xs ${
                  milestone.done
                    ? "border-green-500/50 bg-green-500/10 text-green-300"
                    : "border-border bg-secondary/20 text-muted-foreground"
                }`}
              >
                {milestone.done ? "✅" : "⏳"} {milestone.label}
              </div>
            ))}
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

      {user && (
        <div className="px-4 pb-10">
          <p className="text-sm font-bold text-foreground mb-3">Recent Points Activity</p>
          <div className="space-y-2">
            {recentTransactions.length === 0 ? (
              <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
                No points activity yet.
              </div>
            ) : (
              recentTransactions.map((tx) => (
                <div key={tx.id} className="rounded-xl border border-border bg-secondary/20 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{tx.reason}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-sm font-black ${tx.amount >= 0 ? "text-green-400" : "text-destructive"}`}>
                    {tx.amount >= 0 ? "+" : ""}
                    {tx.amount}
                  </span>
                </div>
              ))
            )}
          </div>

          <p className="text-sm font-bold text-foreground mt-5 mb-3">Recent Redemptions</p>
          <div className="space-y-2">
            {recentRedemptions.length === 0 ? (
              <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
                No rewards redeemed yet.
              </div>
            ) : (
              recentRedemptions.map((redemption) => (
                <div key={redemption.id} className="rounded-xl border border-border bg-secondary/20 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Reward redemption</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(redemption.redeemed_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-sm font-black text-destructive">-{redemption.points_spent}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
