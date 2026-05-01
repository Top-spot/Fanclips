import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { fail, ok, type ApiResult } from "@/services/apiResult";

export type ClipRow = Tables<"clips">;
export type ClipLikeTogglePayload = { liked: boolean; likes_count: number };
export type RepostPayload = { ok?: boolean; already?: boolean; error?: string } | null;

export const listLiveClips = async (limit = 50): Promise<ApiResult<ClipRow[]>> => {
  const { data, error } = await supabase
    .from("clips")
    .select(
      "id, title, caption, section_tag, game_tag, thumbnail_url, video_url, likes_count, ai_processed, ai_title, ai_caption, status, created_at, user_id, is_hidden",
    )
    .eq("status", "live")
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return fail(error.message);
  return ok((data ?? []) as ClipRow[]);
};

export const getClipById = async (clipId: string): Promise<ApiResult<ClipRow>> => {
  const { data, error } = await supabase
    .from("clips")
    .select(
      "id, title, caption, section_tag, game_tag, thumbnail_url, video_url, likes_count, ai_processed, ai_title, ai_caption, status, created_at, user_id, is_hidden",
    )
    .eq("id", clipId)
    .single();

  if (error || !data) return fail(error?.message ?? "Clip not found");
  return ok(data as ClipRow);
};

export const createClip = async (payload: TablesInsert<"clips">): Promise<ApiResult<ClipRow>> => {
  const { data, error } = await supabase.from("clips").insert(payload).select().single();
  if (error || !data) return fail(error?.message ?? "Failed to create clip");
  return ok(data as ClipRow);
};

export const updateClip = async (
  clipId: string,
  updates: TablesUpdate<"clips">,
): Promise<ApiResult<ClipRow>> => {
  const { data, error } = await supabase.from("clips").update(updates).eq("id", clipId).select().single();
  if (error || !data) return fail(error?.message ?? "Failed to update clip");
  return ok(data as ClipRow);
};

export const toggleClipLike = async (
  clipId: string,
  userId: string,
): Promise<ApiResult<ClipLikeTogglePayload>> => {
  const { data, error } = await supabase.rpc("toggle_clip_like", { p_clip_id: clipId, p_user_id: userId });
  if (error || !data) return fail(error?.message ?? "Failed to update like");
  return ok(data as ClipLikeTogglePayload);
};

export const repostClip = async (clipId: string): Promise<ApiResult<RepostPayload>> => {
  const { data, error } = await supabase.rpc("repost_clip", { p_clip_id: clipId });
  if (error) return fail(error.message);
  return ok((data as RepostPayload) ?? null);
};
