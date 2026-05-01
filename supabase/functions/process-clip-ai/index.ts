import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const uuidRe =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("process-clip-ai: missing SUPABASE_URL or SUPABASE_ANON_KEY");
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { clip_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { clip_id } = body;
    if (!clip_id || typeof clip_id !== "string" || clip_id.length > 100) {
      return new Response(JSON.stringify({ error: "Valid clip_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!uuidRe.test(clip_id)) {
      return new Response(JSON.stringify({ error: "clip_id must be a UUID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: clip, error: clipError } = await supabaseUser
      .from("clips")
      .select("*")
      .eq("id", clip_id)
      .eq("user_id", user.id)
      .single();

    if (clipError || !clip) {
      return new Response(JSON.stringify({ error: "Clip not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabaseUser
      .from("profiles")
      .select("username, team, section")
      .eq("user_id", user.id)
      .single();

    const prompt = `You are an AI sports content creator for FanCam, a stadium fan highlight platform.
    
    A fan has uploaded a video clip with these details:
    - Fan username: ${profile?.username || "FanCam User"}
    - Their team: ${profile?.team || "home team"}
    - Stadium section: ${clip.section_tag || profile?.section || "the stands"}
    - Game: ${clip.game_tag || "tonight's game"}
    - Their caption: ${clip.caption || "Amazing moment at the game!"}
    - Their title: ${clip.title}
    
    Create the following for this fan highlight clip:
    1. A punchy, branded highlight title (max 60 chars) using emojis. Format: "🔥 [Section] | [Exciting description] #FanCam"
    2. A social media caption (max 140 chars) that's exciting, uses relevant hashtags, and feels authentic.
    
    Respond with ONLY valid JSON: {"ai_title": "...", "ai_caption": "..."}`;

    let ai_title = clip.title;
    let ai_caption = clip.caption || "";

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (lovableKey) {
      try {
        const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${lovableKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.8,
            max_tokens: 300,
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);
          ai_title = typeof parsed.ai_title === "string" ? parsed.ai_title.slice(0, 100) : ai_title;
          ai_caption = typeof parsed.ai_caption === "string" ? parsed.ai_caption.slice(0, 200) : ai_caption;
        }
      } catch {
        console.error("AI processing failed, keeping original title/caption");
      }
    }

    const { error: updateError } = await supabaseUser
      .from("clips")
      .update({ ai_title, ai_caption, ai_processed: true })
      .eq("id", clip_id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("process-clip-ai: clip update failed", updateError);
      return new Response(JSON.stringify({ error: "Failed to update clip" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: claimData, error: claimError } = await supabaseUser.rpc("claim_clip_upload_points", {
      p_clip_id: clip_id,
    });

    if (claimError) {
      console.error("process-clip-ai: claim_clip_upload_points", claimError);
      return new Response(
        JSON.stringify({
          success: true,
          ai_title,
          ai_caption,
          points_awarded: 0,
          points_error: claimError.message,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const claim = claimData as {
      ok?: boolean;
      already_claimed?: boolean;
      points?: number;
      error?: string;
    } | null;

    if (claim?.ok !== true) {
      console.error("process-clip-ai: claim_clip_upload_points returned", claimData);
      return new Response(
        JSON.stringify({
          success: true,
          ai_title,
          ai_caption,
          points_awarded: 0,
          points_error: claim?.error ?? "claim_failed",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pointsAwarded = typeof claim.points === "number" ? claim.points : 0;

    return new Response(
      JSON.stringify({
        success: true,
        ai_title,
        ai_caption,
        points_awarded: pointsAwarded,
        already_claimed: claim.already_claimed === true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("process-clip-ai error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
