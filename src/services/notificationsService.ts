import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fail, ok, type ApiResult } from "@/services/apiResult";
import { dedupeNotifications } from "@/lib/notifications";

export type NotificationRow = Tables<"notifications">;

export const listNotifications = async (
  userId: string,
  limit = 50,
): Promise<ApiResult<NotificationRow[]>> => {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, message, reference_id, read, created_at, user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fail(error.message);
  return ok(dedupeNotifications((data ?? []) as NotificationRow[]));
};

export const countUnreadNotifications = async (userId: string): Promise<ApiResult<number>> => {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, message, reference_id, read, created_at, user_id")
    .eq("user_id", userId)
    .eq("read", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return fail(error.message);
  return ok(dedupeNotifications((data ?? []) as NotificationRow[]).length);
};

export const markNotificationRead = async (userId: string, notificationId: string): Promise<ApiResult<true>> => {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId)
    .eq("user_id", userId);
  if (error) return fail(error.message);
  return ok(true);
};

export const markAllNotificationsRead = async (userId: string): Promise<ApiResult<true>> => {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) return fail(error.message);
  return ok(true);
};
