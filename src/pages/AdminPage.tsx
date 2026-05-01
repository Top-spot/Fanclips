import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { adminRewardRuleSchema, rewardMutationSchema } from "@/lib/validation";

type RewardRule = {
  key: string;
  label: string;
  description: string | null;
  points_value: number;
  enabled: boolean;
};

type RewardItem = {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  category: string;
  active: boolean;
};

type AdminRewardsOverview = {
  users_count: number;
  transactions_count: number;
  total_earned: number;
  total_spent: number;
  total_redemptions: number;
};

export default function AdminPage() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);

  const [rules, setRules] = useState<RewardRule[]>([]);
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [savingRule, setSavingRule] = useState<string | null>(null);
  const [savingReward, setSavingReward] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const [newRewardName, setNewRewardName] = useState("");
  const [newRewardDescription, setNewRewardDescription] = useState("");
  const [newRewardCost, setNewRewardCost] = useState("100");
  const [newRewardCategory, setNewRewardCategory] = useState("general");
  const [newRewardBusy, setNewRewardBusy] = useState(false);
  const [overview, setOverview] = useState<AdminRewardsOverview | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: ruleData }, { data: rewardData }, overviewRes] = await Promise.all([
      supabase.from("reward_rules").select("key, label, description, points_value, enabled").order("key"),
      supabase.from("rewards").select("id, name, description, points_cost, category, active").order("points_cost"),
      supabase.rpc("get_admin_rewards_overview"),
    ]);
    setRules((ruleData as RewardRule[] | null) ?? []);
    setRewards((rewardData as RewardItem[] | null) ?? []);
    setOverview((overviewRes.data as AdminRewardsOverview | null) ?? null);

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const saveRule = async (rule: RewardRule) => {
    const parsed = adminRewardRuleSchema.safeParse({
      key: rule.key,
      label: rule.label,
      description: rule.description?.trim() || null,
      points_value: Math.max(0, Math.floor(rule.points_value)),
      enabled: rule.enabled,
    });
    if (!parsed.success) {
      toast({ title: parsed.error.errors[0]?.message ?? "Invalid rule input", variant: "destructive" });
      return;
    }

    setSavingRule(rule.key);
    const { error } = await supabase.rpc("admin_update_reward_rule", {
      p_key: parsed.data.key,
      p_label: parsed.data.label,
      p_description: parsed.data.description ?? "",
      p_points_value: parsed.data.points_value,
      p_enabled: parsed.data.enabled,
    });
    setSavingRule(null);
    if (error) {
      toast({ title: "Failed to save rule", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Rule updated" });
    await loadAll();
  };

  const saveReward = async (reward: RewardItem) => {
    const parsed = rewardMutationSchema.safeParse({
      name: reward.name,
      description: reward.description?.trim() || null,
      points_cost: Math.max(1, Math.floor(reward.points_cost)),
      category: reward.category,
      active: reward.active,
    });
    if (!parsed.success) {
      toast({ title: parsed.error.errors[0]?.message ?? "Invalid reward input", variant: "destructive" });
      return;
    }

    setSavingReward(reward.id);
    const { error } = await supabase.rpc("admin_update_reward", {
      p_id: reward.id,
      p_name: parsed.data.name,
      p_description: parsed.data.description ?? "",
      p_points_cost: parsed.data.points_cost,
      p_category: parsed.data.category,
      p_active: parsed.data.active,
    });
    setSavingReward(null);
    if (error) {
      toast({ title: "Failed to save reward", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Reward updated" });
    await loadAll();
  };

  const createReward = async () => {
    const parsed = rewardMutationSchema.safeParse({
      name: newRewardName,
      description: newRewardDescription || null,
      points_cost: Number(newRewardCost),
      category: newRewardCategory,
      active: true,
    });
    if (!parsed.success) {
      toast({ title: parsed.error.errors[0]?.message ?? "Enter a valid reward", variant: "destructive" });
      return;
    }

    setNewRewardBusy(true);
    const { error } = await supabase.rpc("admin_create_reward", {
      p_name: parsed.data.name,
      p_description: parsed.data.description ?? "",
      p_points_cost: parsed.data.points_cost,
      p_category: parsed.data.category,
      p_active: parsed.data.active,
    });
    setNewRewardBusy(false);
    if (error) {
      toast({ title: "Failed to create reward", description: error.message, variant: "destructive" });
      return;
    }

    setNewRewardName("");
    setNewRewardDescription("");
    setNewRewardCost("100");
    setNewRewardCategory("general");
    toast({ title: "Reward created" });
    await loadAll();
  };

  const changePassword = async () => {
    toast({ title: "Password management disabled", description: "Dashboard is now open without admin password setup." });
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading admin...</div>;
  }

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-foreground">Admin Dashboard</h1>
        <Link to="/" className="text-sm text-muted-foreground hover:underline">Back to app</Link>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-lg font-bold text-foreground">Admin Password</h2>
        <p className="text-xs text-muted-foreground">Password setup is disabled for open dashboard mode.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="h-10" />
          <Input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="Confirm new password" className="h-10" />
        </div>
        <Button onClick={() => void changePassword()} disabled={passwordBusy}>
          Open Mode Enabled
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-lg font-bold text-foreground">Rewards Reporting</h2>
        {overview ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <div className="rounded-xl border border-border p-3">
              <p className="text-[11px] text-muted-foreground">Users</p>
              <p className="text-base font-bold text-foreground">{overview.users_count.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-[11px] text-muted-foreground">Transactions</p>
              <p className="text-base font-bold text-foreground">{overview.transactions_count.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-[11px] text-muted-foreground">Total Earned</p>
              <p className="text-base font-bold text-green-400">{overview.total_earned.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-[11px] text-muted-foreground">Total Spent</p>
              <p className="text-base font-bold text-destructive">{overview.total_spent.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-[11px] text-muted-foreground">Redemptions</p>
              <p className="text-base font-bold text-foreground">{overview.total_redemptions.toLocaleString()}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Rewards reporting is available for admin-role users after running the latest migration.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-lg font-bold text-foreground">Interaction Reward Rules</h2>
        <div className="space-y-3">
          {rules.map((rule, idx) => (
            <div key={rule.key} className="rounded-xl border border-border p-3 space-y-2">
              <p className="text-sm font-semibold text-foreground">{rule.label}</p>
              <p className="text-xs text-muted-foreground">{rule.description}</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={rule.points_value}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, points_value: Number.isFinite(val) ? val : 0 } : r)));
                  }}
                  className="h-9 w-28"
                />
                <label className="text-sm text-foreground flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) => {
                      setRules((prev) => prev.map((r, i) => (i === idx ? { ...r, enabled: e.target.checked } : r)));
                    }}
                  />
                  Enabled
                </label>
                <Button onClick={() => void saveRule(rule)} disabled={savingRule === rule.key} className="ml-auto h-9">
                  {savingRule === rule.key ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-lg font-bold text-foreground">Rewards Catalog</h2>
        <div className="rounded-xl border border-border p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
          <Input value={newRewardName} onChange={(e) => setNewRewardName(e.target.value)} placeholder="Reward name" className="h-9 md:col-span-2" />
          <Input value={newRewardDescription} onChange={(e) => setNewRewardDescription(e.target.value)} placeholder="Description" className="h-9" />
          <Input value={newRewardCost} onChange={(e) => setNewRewardCost(e.target.value.replace(/[^\d]/g, ""))} placeholder="Cost" className="h-9" />
          <Input value={newRewardCategory} onChange={(e) => setNewRewardCategory(e.target.value)} placeholder="Category" className="h-9" />
          <Button onClick={() => void createReward()} disabled={newRewardBusy} className="h-9 md:col-span-5">
            {newRewardBusy ? "Creating..." : "Create Reward"}
          </Button>
        </div>

        <div className="space-y-3">
          {rewards.map((reward, idx) => (
            <div key={reward.id} className="rounded-xl border border-border p-3 grid grid-cols-1 md:grid-cols-6 gap-2">
              <Input
                value={reward.name}
                onChange={(e) => setRewards((prev) => prev.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))}
                className="h-9 md:col-span-2"
              />
              <Input
                value={reward.description ?? ""}
                onChange={(e) => setRewards((prev) => prev.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))}
                placeholder="Description"
                className="h-9 md:col-span-2"
              />
              <Input
                type="number"
                min={1}
                value={reward.points_cost}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setRewards((prev) => prev.map((r, i) => (i === idx ? { ...r, points_cost: Number.isFinite(val) ? val : 1 } : r)));
                }}
                className="h-9"
              />
              <Input
                value={reward.category}
                onChange={(e) => setRewards((prev) => prev.map((r, i) => (i === idx ? { ...r, category: e.target.value } : r)))}
                className="h-9"
              />
              <label className="text-sm text-foreground flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={reward.active}
                  onChange={(e) => setRewards((prev) => prev.map((r, i) => (i === idx ? { ...r, active: e.target.checked } : r)))}
                />
                Active
              </label>
              <Button onClick={() => void saveReward(reward)} disabled={savingReward === reward.id} className="h-9 md:col-span-4">
                {savingReward === reward.id ? "Saving..." : "Save Reward"}
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

