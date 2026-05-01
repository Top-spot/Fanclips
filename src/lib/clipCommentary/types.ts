/** Row shape for `public.clip_commentary_features` (mirror of DB). */
export type ClipCommentaryFeature = {
  id: string;
  source_clip_id: string;
  creator_user_id: string;
  audio_storage_path: string;
  duration_seconds: number;
  title: string | null;
  created_at: string;
};

export type CommentaryClipSummary = {
  id: string;
  title: string;
  ai_title: string | null;
  thumbnail_url: string | null;
  status: string;
  is_hidden: boolean;
};

export type CommentaryListItem = {
  feature: ClipCommentaryFeature;
  clip: CommentaryClipSummary | null;
};
