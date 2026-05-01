export type Channel = {
  id: string;
  label: string;
  type: "league" | "team";
  keywords: string[];
};

export const CHANNELS: Channel[] = [
  { id: "league-nba", label: "NBA", type: "league", keywords: ["nba", "basketball"] },
  { id: "league-nfl", label: "NFL", type: "league", keywords: ["nfl", "football"] },
  { id: "league-mlb", label: "MLB", type: "league", keywords: ["mlb", "baseball"] },
  { id: "league-epl", label: "Premier League", type: "league", keywords: ["premier league", "soccer"] },
  { id: "team-lakers", label: "Lakers", type: "team", keywords: ["lakers", "los angeles lakers"] },
  { id: "team-warriors", label: "Warriors", type: "team", keywords: ["warriors", "golden state"] },
  { id: "team-chiefs", label: "Chiefs", type: "team", keywords: ["chiefs", "kansas city"] },
  { id: "team-real-madrid", label: "Real Madrid", type: "team", keywords: ["real madrid", "madrid"] },
];

const KEY = (userId: string) => `fanclips_followed_channels_${userId}`;

export function loadFollowedChannels(userId: string): string[] {
  try {
    const raw = localStorage.getItem(KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveFollowedChannels(userId: string, channelIds: string[]) {
  localStorage.setItem(KEY(userId), JSON.stringify(Array.from(new Set(channelIds))));
}

