interface ScoredClip {
  id: string;
  created_at: string;
  likes_count: number;
  comment_count: number;
  sport: string | null;
  school_team: string | null;
}

export function scoreClips<T extends ScoredClip>(
  clips: T[],
  userSports: string[],
  userTeams: string[]
): T[] {
  const now = Date.now();
  const scored = clips.map((clip) => {
    const hoursAgo = (now - new Date(clip.created_at).getTime()) / (1000 * 60 * 60);
    const recency = Math.max(0, 1 - hoursAgo / 168); // decay over 7 days

    const sportMatch = clip.sport && userSports.includes(clip.sport) ? 0.3 : 0;

    const teamMatch =
      clip.school_team &&
      userTeams.some((t) => clip.school_team!.toLowerCase().includes(t.toLowerCase()))
        ? 0.4
        : 0;

    const engagement = Math.min(0.3, (clip.likes_count + clip.comment_count * 2) / 100);

    const score = recency + sportMatch + teamMatch + engagement;
    return { clip, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.clip);
}
