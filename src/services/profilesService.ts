import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { fail, ok, type ApiResult } from "@/services/apiResult";

export type ProfileRow = Tables<"profiles">;

export const getProfileByUserId = async (userId: string): Promise<ApiResult<ProfileRow>> => {
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return fail(error?.message ?? "Profile not found");
  return ok(data as ProfileRow);
};

export const updateProfileByUserId = async (
  userId: string,
  updates: TablesUpdate<"profiles">,
): Promise<ApiResult<ProfileRow>> => {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("user_id", userId)
    .select()
    .single();
  if (error || !data) return fail(error?.message ?? "Failed to update profile");
  return ok(data as ProfileRow);
};
