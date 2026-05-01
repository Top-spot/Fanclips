/**
 * Commentary audio is stored in the existing `clips` bucket under
 * `{userId}/commentary-{featureId}.webm` so uploads work without creating a separate bucket.
 * (RLS: first path segment must match auth.uid().)
 */
export const CLIP_COMMENTARY_STORAGE_BUCKET = "clips" as const;

/** Early migration created this bucket; still used for playback/delete of legacy paths. */
export const CLIP_COMMENTARY_LEGACY_BUCKET = "clip_commentary_audio" as const;

export function commentaryAudioStoragePath(userId: string, featureId: string): string {
  return `${userId}/commentary-${featureId}.webm`;
}

/** Resolve bucket from DB path (new paths include `commentary-`). */
export function commentaryAudioBucketForPath(storagePath: string): typeof CLIP_COMMENTARY_STORAGE_BUCKET | typeof CLIP_COMMENTARY_LEGACY_BUCKET {
  return storagePath.includes("/commentary-") ? CLIP_COMMENTARY_STORAGE_BUCKET : CLIP_COMMENTARY_LEGACY_BUCKET;
}

/** Hard cap aligned with DB CHECK (seconds). */
export const MAX_COMMENTARY_DURATION_SEC = 600;

/** Sensible default UI cap for recording timer (still allows publish up to DB max if we relax later). */
export const RECORDING_UI_MAX_SEC = 300;
