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

    let body: { clip_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { clip_id } = body;
    if (!clip_id || typeof clip_id !== "string" || clip_id.length > 100) {
      return new Response(JSON.stringify({ error: "Valid clip_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch the clip (must belong to user)
    const { data: clip, error: clipError } = await supabase
      .from("clips")
      .select("*")
      .eq("id", clip_id)
      .eq("user_id", user.id)
      .single();

    if (clipError || !clip) {
      return new Response(JSON.stringify({ error: "Clip not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Fetch user profile for context
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, team, section")
      .eq("user_id", user.id)
      .single();

    // Generate AI content
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

    try {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
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
      // AI failed - keep originals, clip is still live
      console.error("AI processing failed, keeping original title/caption");
    }

    // Update clip with AI results (don't change status - already live)
    await supabase
      .from("clips")
      .update({ ai_title, ai_caption, ai_processed: true })
      .eq("id", clip_id);

    // Award points once per clip (safe if the function is retried)
    const pointsToAward = 50;
    const { count: existingUploadPts } = await supabase
      .from("points_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("reference_id", clip_id)
      .eq("reason", "Clip uploaded");

    if (!existingUploadPts) {
      await supabase.from("points_transactions").insert({
        user_id: user.id,
        amount: pointsToAward,
        reason: "Clip uploaded",
        reference_id: clip_id,
      });

      await supabase.rpc("increment_points", {
        p_user_id: user.id,
        p_amount: pointsToAward,
      });
    }

    return new Response(
      JSON.stringify({ success: true, ai_title, ai_caption, points_awarded: pointsToAward }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-clip-ai error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
