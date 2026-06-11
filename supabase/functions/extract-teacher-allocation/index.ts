import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: roleData } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", caller.id).eq("role", "admin").maybeSingle();
    if (!roleData) return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { images } = await req.json();
    const imgs: string[] = Array.isArray(images) ? images : [];
    if (imgs.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userContent: any[] = [
      { type: "text", text: "Extract every teacher allocation row from this/these sheets. Each row has: teacher name (column 1, sometimes with a max-periods number underneath), subject (column 2), and classes taught (column 3, one or more entries like '2 Orange', '3 Leo', 'Upper 6'). One teacher may teach multiple subjects across multiple rows — return one record per (teacher, subject)." },
    ];
    for (const img of imgs) {
      userContent.push({ type: "image_url", image_url: { url: img.startsWith("data:") ? img : `data:image/jpeg;base64,${img}` } });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an OCR assistant extracting structured teacher allocation tables. Read handwritten and printed text carefully. Ignore crossed-out names. Preserve class names exactly as written (e.g. '2 Orange', 'Upper 6', 'Lower 6', '4 Shark', '3 Virgo')." },
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_teacher_allocations",
            description: "Extract teacher allocation rows",
            parameters: {
              type: "object",
              properties: {
                rows: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      teacher_name: { type: "string", description: "Full name as written, e.g. 'Chuchu CE'" },
                      max_periods: { type: "number", description: "Max periods/week if visible under the name; otherwise 0" },
                      subject: { type: "string", description: "Subject name e.g. 'English Language', 'Literature in English'" },
                      classes: { type: "array", items: { type: "string" }, description: "Class identifiers as written" },
                    },
                    required: ["teacher_name", "subject", "classes"],
                  },
                },
              },
              required: ["rows"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_teacher_allocations" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) return new Response(JSON.stringify({ error: "AI busy. Try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResponse.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ error: "Failed to process image" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let rows: any[] = [];
    if (toolCall?.function?.arguments) {
      try { rows = (JSON.parse(toolCall.function.arguments).rows) || []; } catch { rows = []; }
    }

    return new Response(JSON.stringify({ rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("extract-teacher-allocation error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
