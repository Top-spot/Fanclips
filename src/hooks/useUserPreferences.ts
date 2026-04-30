import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

export function useUserPreferences() {
  const { user } = useAuth();
  const [sports, setSports] = useState<string[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasPreferences, setHasPreferences] = useState<boolean | null>(null);

  const loadPreferences = useCallback(async () => {
    if (!user) {
      setSports([]);
      setTeams([]);
      setHasPreferences(null);
      setLoaded(true);
      return;
    }
    try {
      const [{ data: prefs, error: prefsErr }, { data: followed, error: followErr }] = await Promise.all([
        supabase.from("user_preferences").select("sport").eq("user_id", user.id),
        supabase.from("user_followed_teams").select("team_name").eq("user_id", user.id),
      ]);
      if (prefsErr) console.error("Failed to fetch preferences:", prefsErr);
      if (followErr) console.error("Failed to fetch followed teams:", followErr);
      const s = prefs?.map((p) => p.sport) ?? [];
      const t = followed?.map((f) => f.team_name) ?? [];
      setSports(s);
      setTeams(t);
      setHasPreferences(s.length > 0 || t.length > 0);
    } catch (err) {
      console.error("Preferences fetch error:", err);
    } finally {
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return { sports, teams, loaded, hasPreferences, refresh: loadPreferences };
}
