import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsAllowHeaders =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

/** When REDEEM_REWARD_ALLOWED_ORIGINS is set (comma-separated), reflect a matching Origin; otherwise use *. */
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const raw = Deno.env.get("REDEEM_REWARD_ALLOWED_ORIGINS");
  if (!raw?.trim()) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": corsAllowHeaders,
    };
  }
  const allowed = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  if (allowed.has("*")) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": corsAllowHeaders,
    };
  }
  if (origin && allowed.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
      "Access-Control-Allow-Headers": corsAllowHeaders,
    };
  }
  return {
    "Access-Control-Allow-Headers": corsAllowHeaders,
  };
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") {
    if (!corsHeaders["Access-Control-Allow-Origin"]) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { headers: corsHeaders });
  }

  if (!corsHeaders["Access-Control-Allow-Origin"]) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Headers": corsAllowHeaders },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("redeem-reward: missing SUPABASE_URL or SUPABASE_ANON_KEY");
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // User-scoped client so Postgres `auth.uid()` inside SECURITY DEFINER RPCs matches the caller.
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
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

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(reward_id)) {
      return new Response(JSON.stringify({ error: "reward_id must be a UUID" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: redeemData, error: redeemError } = await supabaseUser.rpc("redeem_reward_atomic", {
      p_reward_id: reward_id,
    });

    if (redeemError) {
      const message = redeemError.message || "Failed to redeem reward";
      const status =
        message.includes("not found")
          ? 404
          : message.includes("Insufficient points")
            ? 400
            : message.includes("Profile not found")
              ? 404
              : message.includes("Unauthorized")
                ? 401
                : 500;

      return new Response(
        JSON.stringify({
          error: message,
        }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(redeemData ?? { success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("redeem-reward error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
