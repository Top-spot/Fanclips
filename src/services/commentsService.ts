import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fail, ok, type ApiResult } from "@/services/apiResult";
import { commentIdSchema, commentSchema } from "@/lib/validation";

export type CommentRow = Tables<"comments">;
export type CommentProfile = { user_id: string; username: string; avatar_url: string | null };
export type CommentWithProfile = CommentRow & { profiles: { username: string; avatar_url: string | null } | null };

export const listCommentsByClip = async (clipId: string): Promise<ApiResult<CommentRow[]>> => {
  let { data, error } = await supabase
    .from("comments")
    .select("id, content, created_at, user_id, parent_comment_id, clip_id")
    .eq("clip_id", clipId)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error && error.message.toLowerCase().includes("parent_comment_id")) {
    const fallback = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, clip_id")
      .eq("clip_id", clipId)
      .order("created_at", { ascending: true })
      .limit(300);
    data = fallback.data?.map((row) => ({ ...row, parent_comment_id: null })) as typeof data;
    error = fallback.error as typeof error;
  }

  if (error) return fail(error.message);
  return ok((data ?? []) as CommentRow[]);
};

export const listCommentProfiles = async (userIds: string[]): Promise<ApiResult<CommentProfile[]>> => {
  if (userIds.length === 0) return ok([]);
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, avatar_url")
    .in("user_id", userIds);
  if (error) return fail(error.message);
  return ok((data ?? []) as CommentProfile[]);
};

export const createComment = async (payload: {
  clip_id: string;
  user_id: string;
  content: string;
  parent_comment_id?: string;
}): Promise<ApiResult<CommentRow>> => {
  if (!commentIdSchema.safeParse(payload.clip_id).success || !commentIdSchema.safeParse(payload.user_id).success) {
    return fail("Invalid comment payload");
  }
  const parsedContent = commentSchema.safeParse({ content: payload.content });
  if (!parsedContent.success) {
    return fail(parsedContent.error.errors[0]?.message ?? "Invalid comment payload");
  }
  if (payload.parent_comment_id && !commentIdSchema.safeParse(payload.parent_comment_id).success) {
    return fail("Invalid reply target");
  }

  const rowPayload: Record<string, string> = {
    clip_id: payload.clip_id,
    user_id: payload.user_id,
    content: parsedContent.data.content,
  };
  if (payload.parent_comment_id) rowPayload.parent_comment_id = payload.parent_comment_id;

  let { data, error } = await supabase.from("comments").insert(rowPayload).select().single();
  if (error && payload.parent_comment_id && error.message.toLowerCase().includes("parent_comment_id")) {
    delete rowPayload.parent_comment_id;
    const fallback = await supabase.from("comments").insert(rowPayload).select().single();
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data) return fail(error?.message ?? "Failed to create comment");
  return ok(data as CommentRow);
};

export const deleteComment = async (commentId: string): Promise<ApiResult<true>> => {
  if (!commentIdSchema.safeParse(commentId).success) {
    return fail("Invalid comment target");
  }
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) return fail(error.message);
  return ok(true);
};
