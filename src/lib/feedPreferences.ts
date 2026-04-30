/** Client-side feed hints + merge with profile when DB columns lag migrations (e.g. Lovable schema cache). */

import type { SupabaseClient } from "@supabase/supabase-js";

export type FeedPrefsPayload = {
  preferred_sports: string[];
  preferred_teams: string[];
  preferred_locations: string[];
};

const LS_KEY = (userId: string) => `fanclips_feed_prefs_${userId}`;

export function loadLocalFeedPrefs(userId: string): FeedPrefsPayload {
  try {
    const raw = localStorage.getItem(LS_KEY(userId));
    if (!raw) return { preferred_sports: [], preferred_teams: [], preferred_locations: [] };
    const parsed = JSON.parse(raw) as Partial<FeedPrefsPayload>;
    return {
      preferred_sports: Array.isArray(parsed.preferred_sports) ? parsed.preferred_sports : [],
      preferred_teams: Array.isArray(parsed.preferred_teams) ? parsed.preferred_teams : [],
      preferred_locations: Array.isArray(parsed.preferred_locations) ? parsed.preferred_locations : [],
    };
  } catch {
    return { preferred_sports: [], preferred_teams: [], preferred_locations: [] };
  }
}

export function saveLocalFeedPrefs(userId: string, prefs: FeedPrefsPayload) {
  localStorage.setItem(LS_KEY(userId), JSON.stringify(prefs));
}

function uniqMergeLists(server: string[] | null | undefined, local: string[]): string[] {
  const map = new Map<string, string>();
  for (const s of server ?? []) {
    if (s?.trim()) map.set(s.trim().toLowerCase(), s.trim());
  }
  for (const s of local) {
    if (s?.trim()) map.set(s.trim().toLowerCase(), s.trim());
  }
  return [...map.values()];
}

export function mergeFeedPreferences(
  profile: {
    preferred_sports?: string[] | null;
    preferred_teams?: string[] | null;
    preferred_locations?: string[] | null;
  } | null,
  userId: string | undefined
): FeedPrefsPayload {
  const local = userId ? loadLocalFeedPrefs(userId) : { preferred_sports: [], preferred_teams: [], preferred_locations: [] };
  return {
    preferred_sports: uniqMergeLists(profile?.preferred_sports, local.preferred_sports),
    preferred_teams: uniqMergeLists(profile?.preferred_teams, local.preferred_teams),
    preferred_locations: uniqMergeLists(profile?.preferred_locations, local.preferred_locations),
  };
}

/**
 * Tries full profile columns, then progressively smaller payloads so older DBs still save sports/teams.
 * Always mirrors to localStorage so the feed works even when the cloud schema is behind migrations.
 */
export async function saveProfileFeedPreferences(
  client: SupabaseClient,
  userId: string,
  prefs: FeedPrefsPayload
): Promise<{ savedToDb: boolean; partial: boolean }> {
  saveLocalFeedPrefs(userId, prefs);

  const payloads: Record<string, unknown>[] = [
    {
      preferred_sports: prefs.preferred_sports,
      preferred_teams: prefs.preferred_teams,
      preferred_locations: prefs.preferred_locations,
    },
    {
      preferred_sports: prefs.preferred_sports,
      preferred_teams: prefs.preferred_teams,
    },
    {
      preferred_sports: prefs.preferred_sports,
    },
  ];

  for (let i = 0; i < payloads.length; i++) {
    const { error } = await client.from("profiles").update(payloads[i]).eq("user_id", userId);
    if (!error) {
      return { savedToDb: true, partial: i > 0 };
    }
    const msg = error.message.toLowerCase();
    const isMissingColumn =
      msg.includes("schema cache") ||
      msg.includes("column") ||
      msg.includes("could not find");
    if (!isMissingColumn) {
      break;
    }
  }

  return { savedToDb: false, partial: false };
}
