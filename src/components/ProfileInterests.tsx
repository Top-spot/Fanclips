import { useState, useEffect } from "react";
import { Plus, X, Trophy, School } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SPORT_OPTIONS } from "@/lib/validation";

const SPORT_ICONS: Record<string, string> = {
  Football: "🏈", Basketball: "🏀", Soccer: "⚽", Baseball: "⚾",
  Hockey: "🏒", Volleyball: "🏐", Track: "🏃", Wrestling: "🤼",
  Swimming: "🏊", Tennis: "🎾", Lacrosse: "🥍", Other: "🏅",
};

export default function ProfileInterests() {
  const { user } = useAuth();
  const [sports, setSports] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [teamInput, setTeamInput] = useState("");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("user_preferences").select("sport").eq("user_id", user.id),
      supabase.from("user_followed_teams").select("team_name").eq("user_id", user.id),
    ]).then(([{ data: p }, { data: t }]) => {
      setSports(p?.map((x) => x.sport) ?? []);
      setTeams(t?.map((x) => x.team_name) ?? []);
    });
  }, [user]);

  const toggleSport = async (sport: string) => {
    if (!user) return;
    if (sports.includes(sport)) {
      await supabase.from("user_preferences").delete().eq("user_id", user.id).eq("sport", sport);
      setSports((prev) => prev.filter((s) => s !== sport));
    } else {
      await supabase.from("user_preferences").insert({ user_id: user.id, sport });
      setSports((prev) => [...prev, sport]);
    }
  };

  const addTeam = async () => {
    const name = teamInput.trim();
    if (!name || !user || teams.includes(name)) return;
    await supabase.from("user_followed_teams").insert({ user_id: user.id, team_name: name });
    setTeams((prev) => [...prev, name]);
    setTeamInput("");
  };

  const removeTeam = async (name: string) => {
    if (!user) return;
    await supabase.from("user_followed_teams").delete().eq("user_id", user.id).eq("team_name", name);
    setTeams((prev) => prev.filter((t) => t !== name));
  };

  return (
    <div className="mx-4 mb-4 gradient-card border border-border rounded-2xl p-4 shadow-card space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-electric" />
        <p className="text-sm font-bold text-foreground">My Interests</p>
      </div>

      {/* Sport chips */}
      <div className="flex flex-wrap gap-2">
        {SPORT_OPTIONS.map((sport) => {
          const active = sports.includes(sport);
          return (
            <button
              key={sport}
              onClick={() => toggleSport(sport)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                active
                  ? "bg-electric/15 border border-electric/40 text-electric"
                  : "bg-secondary/50 border border-border text-muted-foreground"
              }`}
            >
              <span>{SPORT_ICONS[sport] ?? "🏅"}</span>
              {sport}
            </button>
          );
        })}
      </div>

      {/* Followed teams */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <School className="w-4 h-4 text-electric" />
          <p className="text-xs font-bold text-foreground">Following Teams</p>
        </div>
        <div className="flex gap-2 mb-2">
          <Input
            value={teamInput}
            onChange={(e) => setTeamInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTeam()}
            placeholder="Add a team or school..."
            className="flex-1 bg-secondary/50 border-border h-9 text-foreground placeholder:text-muted-foreground text-xs"
            maxLength={100}
          />
          <Button onClick={addTeam} disabled={!teamInput.trim()} size="icon" className="h-9 w-9 gradient-electric text-primary-foreground border-0 shrink-0">
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        {teams.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {teams.map((t) => (
              <div key={t} className="flex items-center gap-1 bg-electric/10 border border-electric/30 rounded-full px-2.5 py-1">
                <span className="text-xs font-semibold text-electric">{t}</span>
                <button onClick={() => removeTeam(t)} className="text-electric/60 hover:text-electric">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
