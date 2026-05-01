import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import {
  commentaryAudioBucketForPath,
  commentaryAudioStoragePath,
  CLIP_COMMENTARY_STORAGE_BUCKET,
} from "@/lib/clipCommentary/constants";
import type { ClipCommentaryFeature, CommentaryListItem } from "@/lib/clipCommentary/types";
import { fail, ok, type ApiResult } from "@/services/apiResult";

export const getCommentaryAudioPublicUrl = (storagePath: string): string => {
  const bucket = commentaryAudioBucketForPath(storagePath);
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
};

export const listCommentaryByCreator = async (creatorUserId: string): Promise<ApiResult<CommentaryListItem[]>> => {
  const { data: features, error } = await supabase
    .from("clip_commentary_features")
    .select("id, source_clip_id, creator_user_id, audio_storage_path, duration_seconds, title, created_at")
    .eq("creator_user_id", creatorUserId)
    .order("created_at", { ascending: false })
    .limit(48);

  if (error) return fail(error.message);
  const rows = (features ?? []) as ClipCommentaryFeature[];
  if (rows.length === 0) return ok([]);

  const clipIds = [...new Set(rows.map((r) => r.source_clip_id))];
  const { data: clips, error: clipErr } = await supabase
    .from("clips")
    .select("id, title, ai_title, thumbnail_url, status, is_hidden")
    .in("id", clipIds);

  if (clipErr) return fail(clipErr.message);
  const clipMap = new Map((clips ?? []).map((c) => [c.id, c]));

  const items: CommentaryListItem[] = rows.map((feature) => ({
    feature,
    clip: clipMap.get(feature.source_clip_id) ?? null,
  }));

  return ok(items);
};

export const getCommentaryById = async (
  featureId: string,
  expectedSourceClipId?: string,
): Promise<ApiResult<ClipCommentaryFeature>> => {
  let q = supabase
    .from("clip_commentary_features")
    .select("id, source_clip_id, creator_user_id, audio_storage_path, duration_seconds, title, created_at")
    .eq("id", featureId);

  if (expectedSourceClipId) {
    q = q.eq("source_clip_id", expectedSourceClipId);
  }

  const { data, error } = await q.maybeSingle();
  if (error) return fail(error.message);
  if (!data) return fail("Reaction not found");
  return ok(data as ClipCommentaryFeature);
};

export type PublishCommentaryInput = {
  featureId: string;
  sourceClipId: string;
  creatorUserId: string;
  audioBlob: Blob;
  durationSeconds: number;
  title?: string | null;
};

export const publishClipCommentary = async (input: PublishCommentaryInput): Promise<ApiResult<ClipCommentaryFeature>> => {
  const path = commentaryAudioStoragePath(input.creatorUserId, input.featureId);
  const { error: upErr } = await supabase.storage.from(CLIP_COMMENTARY_STORAGE_BUCKET).upload(path, input.audioBlob, {
    cacheControl: "3600",
    upsert: true,
    contentType: input.audioBlob.type || "audio/webm",
  });
  if (upErr) return fail(upErr.message);

  const insert: TablesInsert<"clip_commentary_features"> = {
    id: input.featureId,
    source_clip_id: input.sourceClipId,
    creator_user_id: input.creatorUserId,
    audio_storage_path: path,
    duration_seconds: input.durationSeconds,
    title: input.title?.trim() ? input.title.trim() : null,
  };

  const { data, error } = await supabase.from("clip_commentary_features").insert(insert).select().single();
  if (error) {
    await supabase.storage.from(CLIP_COMMENTARY_STORAGE_BUCKET).remove([path]);
    return fail(error.message);
  }
  return ok(data as ClipCommentaryFeature);
};

export const deleteMyCommentary = async (
  featureId: string,
  creatorUserId: string,
): Promise<ApiResult<{ ok: true }>> => {
  const { data: row, error: fetchErr } = await supabase
    .from("clip_commentary_features")
    .select("id, creator_user_id, audio_storage_path")
    .eq("id", featureId)
    .maybeSingle();

  if (fetchErr) return fail(fetchErr.message);
  if (!row || row.creator_user_id !== creatorUserId) return fail("Not found");

  const { error: delDb } = await supabase.from("clip_commentary_features").delete().eq("id", featureId);
  if (delDb) return fail(delDb.message);

  const bucket = commentaryAudioBucketForPath(row.audio_storage_path);
  await supabase.storage.from(bucket).remove([row.audio_storage_path]);
  return ok({ ok: true });
};
