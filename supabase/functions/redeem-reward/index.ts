import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let body: { reward_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { reward_id } = body;
    if (!reward_id || typeof reward_id !== "string" || reward_id.length > 100) {
      return new Response(JSON.stringify({ error: "Valid reward_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch reward
    const { data: reward, error: rewardError } = await supabase
      .from("rewards")
      .select("*")
      .eq("id", reward_id)
      .eq("active", true)
      .single();

    if (rewardError || !reward) {
      return new Response(JSON.stringify({ error: "Reward not found or inactive" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Check user's points
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("points_balance")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (profile.points_balance < reward.points_cost) {
      return new Response(
        JSON.stringify({ error: "Insufficient points", balance: profile.points_balance, cost: reward.points_cost }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create redemption
    const { error: redemptionError } = await supabase
      .from("reward_redemptions")
      .insert({
        user_id: user.id,
        reward_id: reward.id,
        points_spent: reward.points_cost,
      });

    if (redemptionError) {
      return new Response(JSON.stringify({ error: "Failed to redeem reward" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Deduct points
    const newBalance = profile.points_balance - reward.points_cost;
    await supabase
      .from("profiles")
      .update({ points_balance: newBalance })
      .eq("user_id", user.id);

    // Log transaction
    await supabase.from("points_transactions").insert({
      user_id: user.id,
      amount: -reward.points_cost,
      reason: `Redeemed: ${reward.name}`,
      reference_id: reward.id,
    });

    return new Response(
      JSON.stringify({ success: true, new_balance: newBalance, reward_name: reward.name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("redeem-reward error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
