import { useState } from "react";
import { Zap, Plus, X, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { SPORT_OPTIONS } from "@/lib/validation";
import { useToast } from "@/hooks/use-toast";

const SPORT_ICONS: Record<string, string> = {
  Football: "🏈",
  Basketball: "🏀",
  Soccer: "⚽",
  Baseball: "⚾",
  Hockey: "🏒",
  Volleyball: "🏐",
  Track: "🏃",
  Wrestling: "🤼",
  Swimming: "🏊",
  Tennis: "🎾",
  Lacrosse: "🥍",
  Other: "🏅",
};

interface Props {
  onComplete: () => void;
}

export default function OnboardingPreferences({ onComplete }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [teamInput, setTeamInput] = useState("");
  const [followedTeams, setFollowedTeams] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const toggleSport = (sport: string) => {
    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]
    );
  };

  const addTeam = () => {
    const name = teamInput.trim();
    if (!name || followedTeams.includes(name)) return;
    setFollowedTeams((prev) => [...prev, name]);
    setTeamInput("");
  };

  const removeTeam = (name: string) => {
    setFollowedTeams((prev) => prev.filter((t) => t !== name));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (selectedSports.length > 0) {
        await supabase.from("user_preferences").insert(
          selectedSports.map((sport) => ({ user_id: user.id, sport }))
        );
      }
      if (followedTeams.length > 0) {
        await supabase.from("user_followed_teams").insert(
          followedTeams.map((team_name) => ({ user_id: user.id, team_name }))
        );
      }
      onComplete();
    } catch {
      toast({ title: "Failed to save preferences", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-scroll scrollbar-hide flex flex-col">
      <div className="flex-1 px-5 pt-10 pb-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl gradient-electric flex items-center justify-center mx-auto mb-4 glow-blue">
            <Trophy className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-black text-foreground mb-2">What do you follow?</h1>
          <p className="text-sm text-muted-foreground">
            Pick your sports and teams to get a personalized feed of highlights
          </p>
        </div>

        {/* Sports grid */}
        <div className="mb-8">
          <p className="text-sm font-bold text-foreground mb-3">Sports</p>
          <div className="grid grid-cols-3 gap-2">
            {SPORT_OPTIONS.map((sport) => {
              const active = selectedSports.includes(sport);
              return (
                <button
                  key={sport}
                  onClick={() => toggleSport(sport)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all active:scale-95 ${
                    active
                      ? "border-electric bg-electric/10 shadow-[0_0_12px_hsl(var(--electric-blue)/0.3)]"
                      : "border-border bg-secondary/50 hover:border-muted-foreground/30"
                  }`}
                >
                  <span className="text-2xl">{SPORT_ICONS[sport] ?? "🏅"}</span>
                  <span className={`text-xs font-semibold ${active ? "text-electric" : "text-muted-foreground"}`}>
                    {sport}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Teams input */}
        <div className="mb-8">
          <p className="text-sm font-bold text-foreground mb-3">Teams & Schools</p>
          <div className="flex gap-2 mb-3">
            <Input
              value={teamInput}
              onChange={(e) => setTeamInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTeam()}
              placeholder="e.g. Lincoln High, Duke..."
              className="flex-1 bg-secondary/50 border-border h-11 text-foreground placeholder:text-muted-foreground text-sm"
              maxLength={100}
            />
            <Button
              onClick={addTeam}
              disabled={!teamInput.trim()}
              size="icon"
              className="h-11 w-11 gradient-electric text-primary-foreground border-0 shrink-0"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {followedTeams.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {followedTeams.map((team) => (
                <div
                  key={team}
                  className="flex items-center gap-1.5 bg-electric/10 border border-electric/30 rounded-full px-3 py-1.5"
                >
                  <span className="text-xs font-semibold text-electric">{team}</span>
                  <button onClick={() => removeTeam(team)} className="text-electric/60 hover:text-electric">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom actions */}
      <div className="px-5 pb-8 space-y-3 shrink-0">
        <Button
          onClick={handleSave}
          disabled={saving || (selectedSports.length === 0 && followedTeams.length === 0)}
          className="w-full h-14 text-base font-black gradient-electric text-primary-foreground border-0 glow-blue rounded-2xl"
        >
          {saving ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Saving...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Continue
            </div>
          )}
        </Button>
        <button
          onClick={onComplete}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
